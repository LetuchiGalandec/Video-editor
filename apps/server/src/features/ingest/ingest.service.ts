import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { FfmpegService } from '../clips/ffmpeg.service';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { ProbeService } from '../videos/probe.service';
import { isBrowserPlayable } from './ingest-args';

const MAX_TITLE_LEN = 200;

/** Derive a display title from the upload's filename — never used as a path. */
function cleanTitle(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '');
  const cleaned = base.replace(/[\r\n\t]+/g, ' ').trim();
  return (cleaned || 'Uploaded video').slice(0, MAX_TITLE_LEN);
}

@Injectable()
export class IngestService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly store: JobStore,
    private readonly queue: JobQueue,
    private readonly probe: ProbeService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async ingest(tempPath: string, originalName: string): Promise<Job> {
    const job = this.store.create('ingest');
    const videoDir = path.join(this.config.dataDir, 'videos', job.id);
    this.queue.schedule(job.id, async () => {
      try {
        await mkdir(videoDir, { recursive: true });
        const media = await this.probe.probe(tempPath);
        if (media.width === 0 || media.height === 0 || media.durationSec === 0) {
          throw new BadRequestException(
            'That file has no playable video stream.',
          );
        }
        if (media.durationSec > this.config.maxUploadDurationSec) {
          const minutes = Math.round(this.config.maxUploadDurationSec / 60);
          throw new BadRequestException(
            `That video is longer than the ${minutes}-minute limit.`,
          );
        }
        const outputPath = path.join(videoDir, 'source.mp4');
        const transcode = !isBrowserPlayable(media);
        await this.ffmpeg.normalize(
          { inputPath: tempPath, outputPath, transcode },
          media.durationSec,
          (percent) => this.store.patch(job.id, { progress: percent }),
        );
        await writeFile(
          path.join(videoDir, 'info.json'),
          JSON.stringify(
            { title: cleanTitle(originalName), durationSec: media.durationSec },
            null,
            2,
          ),
        );
        this.store.patch(job.id, { result: { videoId: job.id } });
      } catch (error) {
        await rm(videoDir, { recursive: true, force: true });
        throw error;
      } finally {
        await rm(tempPath, { force: true });
      }
    });
    return job;
  }
}
