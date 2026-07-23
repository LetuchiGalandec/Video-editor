import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { isTerminal } from '../../core/api.models';
import { isYoutubeVideoUrl } from '../../core/youtube-link';
import { ProgressCard } from '../../shared/progress-card';

@Component({
  selector: 'app-fetch-page',
  imports: [ProgressCard],
  templateUrl: './fetch-page.html',
  styleUrl: './fetch-page.scss',
})
export class FetchPage {
  private readonly api = inject(ApiService);
  private readonly jobEvents = inject(JobEventsService);
  private readonly router = inject(Router);

  protected readonly url = signal('');
  protected readonly requestError = signal('');
  private readonly watch = signal<JobWatch | undefined>(undefined);

  protected readonly job = computed(() => this.watch()?.job());
  protected readonly isValidUrl = computed(() => isYoutubeVideoUrl(this.url()));
  protected readonly busy = computed(() => {
    const job = this.job();
    return job !== undefined && !isTerminal(job.state);
  });
  protected readonly errorText = computed(() => {
    const job = this.job();
    return (
      this.requestError() || (job?.state === 'error' ? (job.error ?? 'Something went wrong.') : '')
    );
  });

  constructor() {
    effect(() => {
      const job = this.job();
      if (job?.state === 'done' && job.result?.videoId) {
        void this.router.navigate(['/edit', job.result.videoId]);
      }
    });
  }

  protected onInput(value: string): void {
    this.url.set(value);
    this.requestError.set('');
  }

  protected submit(): void {
    if (!this.isValidUrl() || this.busy()) {
      return;
    }
    this.requestError.set('');
    this.watch()?.dispose();
    this.api.startDownload(this.url()).subscribe({
      next: ({ jobId }) => this.watch.set(this.jobEvents.watch(jobId)),
      error: (err: { error?: { message?: string } }) =>
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.'),
    });
  }
}
