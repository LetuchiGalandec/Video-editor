import { Injectable } from '@nestjs/common';
import { JobStore } from './job-store';

export type JobWork = () => Promise<void>;

const MAX_CONCURRENT_JOBS = 2;

/**
 * Runs job work functions with a concurrency cap so parallel yt-dlp/ffmpeg
 * processes don't saturate CPU and disk. Work functions report their own
 * progress via JobStore; the queue owns the state transitions.
 */
@Injectable()
export class JobQueue {
  private running = 0;
  private readonly waiting: Array<{ jobId: string; work: JobWork }> = [];

  constructor(private readonly store: JobStore) {}

  schedule(jobId: string, work: JobWork): void {
    if (this.running >= MAX_CONCURRENT_JOBS) {
      this.waiting.push({ jobId, work });
      return;
    }
    this.start(jobId, work);
  }

  private start(jobId: string, work: JobWork): void {
    this.running += 1;
    this.store.patch(jobId, { state: 'running' });
    void work()
      .then(() => {
        this.store.patch(jobId, { state: 'done', progress: 100 });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        this.store.patch(jobId, { state: 'error', error: message });
      })
      .finally(() => {
        this.running -= 1;
        const next = this.waiting.shift();
        if (next) {
          this.start(next.jobId, next.work);
        }
      });
  }
}
