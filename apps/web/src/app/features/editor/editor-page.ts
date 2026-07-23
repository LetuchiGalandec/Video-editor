import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { isTerminal } from '../../core/api.models';
import type { ClipMode } from '../../core/api.models';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { ProgressCard } from '../../shared/progress-card';
import { ControlsBar } from './controls-bar';
import { EditorStore } from './editor-store';
import { MarkerInputs } from './marker-inputs';
import { TrimTimeline } from './trim-timeline/trim-timeline';
import { VideoPlayer } from './video-player';

@Component({
  selector: 'app-editor-page',
  imports: [VideoPlayer, ControlsBar, TrimTimeline, MarkerInputs, ProgressCard],
  providers: [EditorStore],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
})
export class EditorPage {
  private readonly api = inject(ApiService);
  private readonly jobEvents = inject(JobEventsService);
  private readonly router = inject(Router);

  protected readonly store = inject(EditorStore);
  protected readonly videoId = signal('');
  protected readonly streamUrl = signal('');
  protected readonly requestError = signal('');
  private readonly clipWatch = signal<JobWatch | undefined>(undefined);

  protected readonly clipJob = computed(() => this.clipWatch()?.job());
  protected readonly generating = computed(() => {
    const job = this.clipJob();
    return job !== undefined && !isTerminal(job.state);
  });
  protected readonly errorText = computed(() => {
    const job = this.clipJob();
    return (
      this.requestError() || (job?.state === 'error' ? (job.error ?? 'Generating failed.') : '')
    );
  });

  constructor() {
    const route = inject(ActivatedRoute);
    const videoId = route.snapshot.paramMap.get('videoId') ?? '';
    this.videoId.set(videoId);
    this.streamUrl.set(this.api.videoStreamUrl(videoId));
    this.api.videoMeta(videoId).subscribe({
      next: (meta) => this.store.initFromMeta(meta),
      error: () => void this.router.navigate(['/']),
    });

    effect(() => {
      const job = this.clipJob();
      if (job?.state === 'done' && job.result?.clipId) {
        void this.router.navigate(['/result', job.result.clipId]);
      }
    });
  }

  protected setMode(mode: ClipMode): void {
    this.store.mode.set(mode);
  }

  protected generate(): void {
    if (!this.store.canGenerate() || this.generating()) {
      return;
    }
    this.requestError.set('');
    this.clipWatch()?.dispose();
    this.api
      .createClip(this.videoId(), this.store.markIn(), this.store.markOut(), this.store.mode())
      .subscribe({
        next: ({ jobId }) => this.clipWatch.set(this.jobEvents.watch(jobId)),
        error: (err: { error?: { message?: string } }) =>
          this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.'),
      });
  }
}
