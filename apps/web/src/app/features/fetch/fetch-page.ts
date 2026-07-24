import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { isTerminal } from '../../core/api.models';
import { isYoutubeVideoUrl } from '../../core/youtube-link';
import { ProgressCard } from '../../shared/progress-card';

type FetchMode = 'quick' | 'precise';

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
  protected readonly mode = signal<FetchMode>('quick');
  protected readonly requestError = signal('');
  protected readonly fallbackNote = signal('');
  protected readonly resolving = signal(false);
  private readonly watch = signal<JobWatch | undefined>(undefined);

  protected readonly job = computed(() => this.watch()?.job());
  protected readonly isValidUrl = computed(() => isYoutubeVideoUrl(this.url()));
  protected readonly busy = computed(() => {
    if (this.resolving()) {
      return true;
    }
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
    // Precise mode: navigate to the native editor once the full download is done.
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
    this.fallbackNote.set('');
  }

  protected setMode(mode: FetchMode): void {
    this.mode.set(mode);
  }

  protected submit(): void {
    if (!this.isValidUrl() || this.busy()) {
      return;
    }
    this.requestError.set('');
    this.fallbackNote.set('');
    this.watch()?.dispose();
    if (this.mode() === 'quick') {
      this.startQuick();
    } else {
      this.startPrecise();
    }
  }

  private startQuick(): void {
    this.resolving.set(true);
    this.api.resolve(this.url()).subscribe({
      next: (result) => {
        this.resolving.set(false);
        if (!result.playableInEmbed) {
          // Can't embed this one — fall back to a full download for editing.
          this.fallbackNote.set("This video can't be previewed inline — downloading it instead.");
          this.startPrecise();
          return;
        }
        void this.router.navigate(['/preview', result.youtubeId], {
          state: { title: result.title, durationSec: result.durationSec },
        });
      },
      error: (err: { error?: { message?: string } }) => {
        this.resolving.set(false);
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.');
      },
    });
  }

  private startPrecise(): void {
    this.api.startDownload(this.url()).subscribe({
      next: ({ jobId }) => this.watch.set(this.jobEvents.watch(jobId)),
      error: (err: { error?: { message?: string } }) =>
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.'),
    });
  }
}
