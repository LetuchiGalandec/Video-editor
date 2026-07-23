import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { FetchError, VIDEO_FETCHER } from './video-fetcher';
import type { VideoFetcher } from './video-fetcher';
import { parseYoutubeVideoId } from './youtube-url';

export interface VideoInfoFile {
  videoId: string;
  title: string;
  durationSec: number;
  sourceUrl: string;
}

@Injectable()
export class DownloadsService {
  constructor(
    @Inject(VIDEO_FETCHER) private readonly fetcher: VideoFetcher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly store: JobStore,
    private readonly queue: JobQueue,
  ) {}

  videoDir(videoId: string): string {
    return path.join(this.config.dataDir, 'videos', videoId);
  }

  startDownload(url: string): Job {
    if (!parseYoutubeVideoId(url)) {
      throw new BadRequestException(
        "That doesn't look like a YouTube video link.",
      );
    }
    const job = this.store.create('download');
    const destDir = this.videoDir(job.id);

    this.queue.schedule(job.id, async () => {
      const probe = await this.fetcher.probe(url);
      if (probe.isLive) {
        throw new FetchError('Live streams are not supported.', 'live');
      }
      if (probe.durationSec > this.config.maxDurationSec) {
        const hours = Math.round(this.config.maxDurationSec / 3600);
        throw new FetchError(
          `This video is longer than the ${hours}-hour limit.`,
          'too_long',
        );
      }
      await this.fetcher.download(url, destDir, (percent) => {
        this.store.patch(job.id, { progress: percent });
      });
      const info: VideoInfoFile = {
        videoId: probe.videoId,
        title: probe.title,
        durationSec: probe.durationSec,
        sourceUrl: url,
      };
      await writeFile(
        path.join(destDir, 'info.json'),
        JSON.stringify(info, null, 2),
      );
      this.store.patch(job.id, { result: { videoId: job.id } });
    });

    return job;
  }
}
