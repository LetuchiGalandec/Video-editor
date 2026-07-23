import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { ProbeService } from '../videos/probe.service';
import { VideosService, assertJobId } from '../videos/videos.service';
import { FfmpegService } from './ffmpeg.service';
import type { ClipMode } from './ffmpeg-args';

export interface CreateClipInput {
  videoId: string;
  startSec: number;
  endSec: number;
  mode: ClipMode;
}

export interface ClipInfoFile {
  videoId: string;
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

@Injectable()
export class ClipsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
    const { videoId, startSec, endSec, mode } = input;
    if (
      !Number.isFinite(startSec) ||
      !Number.isFinite(endSec) ||
      startSec < 0 ||
      endSec - startSec < MIN_CLIP_SEC
    ) {
      throw new BadRequestException(
        'Pick a selection at least 0.2 seconds long.',
      );
    }
    if (mode !== 'accurate' && mode !== 'fast') {
      throw new BadRequestException('Unknown cut mode.');
    }
    const sourcePath = await this.videos.sourcePathOrThrow(videoId);
    const media = await this.probe.probe(sourcePath);
    if (startSec >= media.durationSec) {
      throw new BadRequestException(
        'The selection starts after the video ends.',
      );
    }
    const cappedEnd = Math.min(endSec, media.durationSec);

    const job = this.store.create('clip');
    const clipDir = path.join(this.config.dataDir, 'clips', job.id);

    this.queue.schedule(job.id, async () => {
      await mkdir(clipDir, { recursive: true });
      const outputPath = path.join(clipDir, 'clip.mp4');
      await this.ffmpeg.cut(
        {
          inputPath: sourcePath,
          outputPath,
          startSec,
          endSec: cappedEnd,
          mode,
        },
        (percent) => this.store.patch(job.id, { progress: percent }),
      );
      const videoMeta = await this.videos.meta(videoId);
      const info: ClipInfoFile = {
        videoId,
        title: videoMeta.title,
        startSec,
        endSec: cappedEnd,
        mode,
      };
      await writeFile(
        path.join(clipDir, 'info.json'),
        JSON.stringify(info, null, 2),
      );
      this.store.patch(job.id, { result: { clipId: job.id, videoId } });
    });

    return job;
  }

  async meta(clipId: string): Promise<ClipMeta> {
    const filePath = await this.clipPathOrThrow(clipId);
    const [fileStat, media, infoRaw] = await Promise.all([
      stat(filePath),
      this.probe.probe(filePath),
      readFile(
        path.join(this.config.dataDir, 'clips', clipId, 'info.json'),
        'utf-8',
      ).catch(() => '{}'),
    ]);
    const info = JSON.parse(infoRaw) as Partial<ClipInfoFile>;
    return {
      clipId,
      videoId: info.videoId ?? '',
      title: info.title ?? 'Cropcorn clip',
      startSec: info.startSec ?? 0,
      endSec: info.endSec ?? media.durationSec,
      mode: info.mode ?? 'accurate',
      sizeBytes: fileStat.size,
      durationSec: media.durationSec,
    };
  }
}
