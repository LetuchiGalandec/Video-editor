import { Injectable, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { ApiService } from './api.service';
import { isTerminal } from './api.models';
import type { Job } from './api.models';

export interface JobWatch {
  job: Signal<Job | undefined>;
  dispose: () => void;
}

const SSE_ERRORS_BEFORE_FALLBACK = 2;
const POLL_INTERVAL_MS = 2000;

/**
 * Streams job progress over SSE, falling back to polling if the stream keeps
 * failing. The watch closes itself once the job reaches a terminal state;
 * callers should still dispose() when leaving early (e.g. route change).
 */
@Injectable({ providedIn: 'root' })
export class JobEventsService {
  private readonly api = inject(ApiService);

  watch(jobId: string): JobWatch {
    const job = signal<Job | undefined>(undefined);
    let source: EventSource | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let errorCount = 0;
    let disposed = false;

    const dispose = (): void => {
      disposed = true;
      source?.close();
      source = undefined;
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const receive = (next: Job): void => {
      job.set(next);
      if (isTerminal(next.state)) {
        dispose();
      }
    };

    const startPolling = (): void => {
      if (disposed || pollTimer !== undefined) {
        return;
      }
      pollTimer = setInterval(() => {
        this.api.job(jobId).subscribe({
          next: receive,
          error: () => dispose(),
        });
      }, POLL_INTERVAL_MS);
    };

    source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (event: MessageEvent<string>) => {
      errorCount = 0;
      receive(JSON.parse(event.data) as Job);
    };
    source.onerror = () => {
      errorCount += 1;
      if (errorCount >= SSE_ERRORS_BEFORE_FALLBACK) {
        source?.close();
        source = undefined;
        startPolling();
      }
    };

    return { job, dispose };
  }
}
