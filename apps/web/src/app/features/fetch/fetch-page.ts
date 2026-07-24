import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { retry } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { isTerminal } from '../../core/api.models';
import { isYoutubeVideoUrl } from '../../core/youtube-link';
import { ProgressCard } from '../../shared/progress-card';

type FetchMode = 'quick' | 'precise';
type Source = 'youtube' | 'upload';

// /api/config can momentarily 502/ECONNREFUSED if the page load beats the
// server's boot; retry briefly instead of stranding on stale defaults.
const CONFIG_RETRY_COUNT = 3;
const CONFIG_RETRY_DELAY_MS = 500;

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
  protected readonly source = signal<Source>('youtube');
  protected readonly youtubeEnabled = signal(true);
  protected readonly maxUploadBytes = signal(0);
  protected readonly requestError = signal('');
  protected readonly fallbackNote = signal('');
  protected readonly resolving = signal(false);
  protected readonly uploadPercent = signal<number | null>(null);
  private readonly watch = signal<JobWatch | undefined>(undefined);

  protected readonly job = computed(() => this.watch()?.job());
  protected readonly isValidUrl = computed(() => isYoutubeVideoUrl(this.url()));
  protected readonly uploading = computed(() => this.uploadPercent() !== null);
  protected readonly busy = computed(() => {
    if (this.resolving() || this.uploading()) {
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
    // /api/config decides which sources are offered. Retry a few times so a page
    // load that races the server's boot recovers instead of stranding on stale
    // defaults, and surface (never silently swallow) a genuine failure.
    this.api
      .getConfig()
      .pipe(retry({ count: CONFIG_RETRY_COUNT, delay: CONFIG_RETRY_DELAY_MS }))
      .subscribe({
        next: (config) => {
          this.youtubeEnabled.set(config.youtubeEnabled);
          this.maxUploadBytes.set(config.maxUploadBytes);
          this.source.set(config.youtubeEnabled ? 'youtube' : 'upload');
        },
        error: (err: unknown) => {
          console.error('Cropcorn: /api/config failed to load; keeping default flags.', err);
        },
      });

    // Both the full-download job and the ingest job report result.videoId when
    // done — either way, head to the native editor.
    effect(() => {
      const job = this.job();
      if (job?.state === 'done' && job.result?.videoId) {
        void this.router.navigate(['/edit', job.result.videoId]);
      }
    });
  }

  protected setSource(source: Source): void {
    if (source === 'youtube' && !this.youtubeEnabled()) {
      return;
    }
    this.source.set(source);
    this.requestError.set('');
    this.fallbackNote.set('');
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

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(file);
    }
    input.value = '';
  }

  protected onFileSelected(file: File): void {
    if (this.busy()) {
      return;
    }
    this.requestError.set('');
    if (!file.type.startsWith('video/')) {
      this.requestError.set('Please choose a video file.');
      return;
    }
    const cap = this.maxUploadBytes();
    if (cap > 0 && file.size > cap) {
      const mb = Math.round(cap / (1024 * 1024));
      this.requestError.set(`That file is larger than the ${mb} MB limit.`);
      return;
    }
    this.watch()?.dispose();
    this.uploadPercent.set(0);
    this.api.uploadVideo(file).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.uploadPercent.set(event.percent);
        } else {
          // Transfer done → watch the server-side normalize job.
          this.uploadPercent.set(null);
          this.watch.set(this.jobEvents.watch(event.jobId));
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploadPercent.set(null);
        this.requestError.set(err.error?.message ?? 'Upload failed. Please try again.');
      },
    });
  }

  private startQuick(): void {
    this.resolving.set(true);
    this.api.resolve(this.url()).subscribe({
      next: (result) => {
        this.resolving.set(false);
        if (!result.playableInEmbed) {
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
