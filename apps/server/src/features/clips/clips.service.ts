import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { VIDEO_FETCHER } from '../fetch/video-fetcher';
import type { VideoFetcher } from '../fetch/video-fetcher';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { ProbeService } from '../videos/probe.service';
import { VideosService, assertJobId } from '../videos/videos.service';
import { FfmpegService } from './ffmpeg.service';
import type { ClipMode } from './ffmpeg-args';

interface ClipCommon {
  startSec: number;
  endSec: number;
  mode: ClipMode;
}

/** Crop a already-downloaded source (Precise) or fetch only the section (Quick). */
export type CreateClipInput =
  | ({ source: 'downloaded'; videoId: string } & ClipCommon)
  | ({ source: 'youtube'; youtubeId: string; title: string } & ClipCommon);

export interface ClipInfoFile {
  source: 'downloaded' | 'youtube';
  videoId: string;
  youtubeId: string;
  title: string;
  startSec: number;
  endSec: number;
  mode: ClipMode;
}

export interface ClipMeta extends ClipInfoFile {
  clipId: string;
  sizeBytes: number;
  durationSec: number;
}

const MIN_CLIP_SEC = 0.2;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

@Injectable()
export class ClipsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(VIDEO_FETCHER) private readonly fetcher: VideoFetcher,
    private readonly store: JobStore,
    private readonly queue: JobQueue,
    private readonly videos: VideosService,
    private readonly probe: ProbeService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  clipPath(clipId: string): string {
    assertJobId(clipId);
    return path.join(this.config.dataDir, 'clips', clipId, 'clip.mp4');
  }

  async clipPathOrThrow(clipId: string): Promise<string> {
    const filePath = this.clipPath(clipId);
    try {
      await stat(filePath);
    } catch {
      throw new NotFoundException('Clip not found');
    }
    return filePath;
  }

  async createClip(input: CreateClipInput): Promise<Job> {
    this.assertValidRange(input);
    if (input.mode !== 'accurate' && input.mode !== 'fast') {
      throw new BadRequestException('Unknown cut mode.');
    }
    return input.source === 'youtube'
      ? this.createFromYoutube(input)
      : this.createFromDownloaded(input);
  }

  private assertValidRange({ startSec, endSec }: ClipCommon): void {
    if (
      !Number.isFinite(startSec) ||
      !Number.isFinite(endSec) ||
      startSec < 0 ||
      endSec - startSec < MIN_CLIP_SEC
    ) {
      throw new BadRequestException('Pick a selection at least 0.2 seconds long.');
    }
  }

  private clipDir(jobId: string): string {
    return path.join(this.config.dataDir, 'clips', jobId);
  }

  private async createFromDownloaded(
    input: Extract<CreateClipInput, { source: 'downloaded' }>,
  ): Promise<Job> {
    const { videoId, startSec, endSec, mode } = input;
    const sourcePath = await this.videos.sourcePathOrThrow(videoId);
    const media = await this.probe.probe(sourcePath);
    if (startSec >= media.durationSec) {
      throw new BadRequestException('The selection starts after the video ends.');
    }
    const cappedEnd = Math.min(endSec, media.durationSec);

    const job = this.store.create('clip');
    const clipDir = this.clipDir(job.id);
    this.queue.schedule(job.id, async () => {
      await mkdir(clipDir, { recursive: true });
      const outputPath = path.join(clipDir, 'clip.mp4');
      await this.ffmpeg.cut({ inputPath: sourcePath, outputPath, startSec, endSec: cappedEnd, mode }, (percent) =>
        this.store.patch(job.id, { progress: percent }),
      );
      const videoMeta = await this.videos.meta(videoId);
      await this.writeInfo(clipDir, {
        source: 'downloaded',
        videoId,
        youtubeId: '',
        title: videoMeta.title,
        startSec,
        endSec: cappedEnd,
        mode,
      });
      this.store.patch(job.id, { result: { clipId: job.id, videoId } });
    });
    return job;
  }

  private async createFromYoutube(
    input: Extract<CreateClipInput, { source: 'youtube' }>,
  ): Promise<Job> {
    const { youtubeId, title, startSec, endSec, mode } = input;
    if (!YOUTUBE_ID.test(youtubeId)) {
      throw new BadRequestException('Invalid YouTube id.');
    }
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;

    const job = this.store.create('clip');
    const clipDir = this.clipDir(job.id);
    this.queue.schedule(job.id, async () => {
      await this.fetcher.downloadSection(url, startSec, endSec, mode, clipDir, (percent) =>
        this.store.patch(job.id, { progress: percent }),
      );
      await this.writeInfo(clipDir, {
        source: 'youtube',
        videoId: '',
        youtubeId,
        title: title.trim() || 'Cropcorn clip',
        startSec,
        endSec,
        mode,
      });
      this.store.patch(job.id, { result: { clipId: job.id } });
    });
    return job;
  }

  private async writeInfo(clipDir: string, info: ClipInfoFile): Promise<void> {
    await mkdir(clipDir, { recursive: true });
    await writeFile(path.join(clipDir, 'info.json'), JSON.stringify(info, null, 2));
  }

  async meta(clipId: string): Promise<ClipMeta> {
    const filePath = await this.clipPathOrThrow(clipId);
    const [fileStat, media, infoRaw] = await Promise.all([
      stat(filePath),
      this.probe.probe(filePath),
      readFile(path.join(this.config.dataDir, 'clips', clipId, 'info.json'), 'utf-8').catch(
        () => '{}',
      ),
    ]);
    const info = JSON.parse(infoRaw) as Partial<ClipInfoFile>;
    return {
      clipId,
      source: info.source ?? 'downloaded',
      videoId: info.videoId ?? '',
      youtubeId: info.youtubeId ?? '',
      title: info.title ?? 'Cropcorn clip',
      startSec: info.startSec ?? 0,
      endSec: info.endSec ?? media.durationSec,
      mode: info.mode ?? 'accurate',
      sizeBytes: fileStat.size,
      durationSec: media.durationSec,
    };
  }
}
