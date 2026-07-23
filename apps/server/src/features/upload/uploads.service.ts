import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';
import { GoogleAuthService } from '../auth/google-auth.service';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { YoutubePlaylistService } from './youtube-playlist.service';
import { YoutubeUploadService } from './youtube-upload.service';

export interface StartUploadInput {
  clipId: string;
  title: string;
  description: string;
  /** Add the uploaded video to this existing playlist, if set. */
  playlistId?: string;
  /** Or create a new private playlist with this title and add it there. */
  newPlaylistTitle?: string;
}

const MAX_TITLE_LENGTH = 100;
const MAX_PLAYLIST_TITLE_LENGTH = 150;

@Injectable()
export class UploadsService {
  constructor(
    private readonly store: JobStore,
    private readonly queue: JobQueue,
    private readonly clips: ClipsService,
    private readonly auth: GoogleAuthService,
    private readonly youtube: YoutubeUploadService,
    private readonly playlists: YoutubePlaylistService,
  ) {}

  async startUpload(sessionId: string, input: StartUploadInput): Promise<Job> {
    const filePath = await this.clips.clipPathOrThrow(input.clipId);
    const client = await this.auth.clientForSession(sessionId);
    if (!client) {
      throw new UnauthorizedException('Connect your Google account first.');
    }
    const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      throw new BadRequestException('Give the clip a title.');
    }

    const job = this.store.create('upload');
    this.queue.schedule(job.id, async () => {
      const uploaded = await this.youtube.upload(
        client,
        { filePath, title, description: input.description },
        (percent) => this.store.patch(job.id, { progress: percent }),
      );

      const playlistId = await this.resolvePlaylist(client, input);
      if (playlistId) {
        await this.playlists.addVideo(client, playlistId, uploaded.youtubeVideoId);
      }

      this.store.patch(job.id, {
        result: {
          clipId: input.clipId,
          youtubeVideoId: uploaded.youtubeVideoId,
          watchUrl: uploaded.watchUrl,
        },
      });
    });
    return job;
  }

  private async resolvePlaylist(
    client: Awaited<ReturnType<GoogleAuthService['clientForSession']>>,
    input: StartUploadInput,
  ): Promise<string> {
    if (!client) {
      return '';
    }
    const existing = input.playlistId?.trim();
    if (existing) {
      return existing;
    }
    const newTitle = input.newPlaylistTitle?.trim().slice(0, MAX_PLAYLIST_TITLE_LENGTH);
    if (newTitle) {
      return this.playlists.create(client, newTitle);
    }
    return '';
  }
}
