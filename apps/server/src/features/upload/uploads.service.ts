import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { GoogleAuthService } from './google-auth.service';
import { YoutubeUploadService } from './youtube-upload.service';

export interface StartUploadInput {
  clipId: string;
  title: string;
  description: string;
}

const MAX_TITLE_LENGTH = 100;

@Injectable()
export class UploadsService {
  constructor(
    private readonly store: JobStore,
    private readonly queue: JobQueue,
    private readonly clips: ClipsService,
    private readonly auth: GoogleAuthService,
    private readonly youtube: YoutubeUploadService,
  ) {}

  async startUpload(input: StartUploadInput): Promise<Job> {
    const filePath = await this.clips.clipPathOrThrow(input.clipId);
    const status = await this.auth.status();
    if (!status.authorized) {
      throw new UnauthorizedException('Connect your Google account first.');
    }
    const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      throw new BadRequestException('Give the clip a title.');
    }

    const job = this.store.create('upload');
    this.queue.schedule(job.id, async () => {
      const result = await this.youtube.upload(
        { filePath, title, description: input.description },
        (percent) => this.store.patch(job.id, { progress: percent }),
      );
      this.store.patch(job.id, {
        result: {
          clipId: input.clipId,
          youtubeVideoId: result.youtubeVideoId,
          watchUrl: result.watchUrl,
        },
      });
    });
    return job;
  }
}
