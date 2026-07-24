import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { isTerminal } from '../../core/api.models';
import type { ClipMode, VideoMeta } from '../../core/api.models';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { ProgressCard } from '../../shared/progress-card';
import { ControlsBar } from './controls-bar';
import { EditorStore } from './editor-store';
import { EmbedPlayer } from './embed-player';
import { MarkerInputs } from './marker-inputs';
import { TrimTimeline } from './trim-timeline/trim-timeline';
import { VideoPlayer } from './video-player';

type EditorMode = 'quick' | 'precise';

@Component({
  selector: 'app-editor-page',
  imports: [VideoPlayer, EmbedPlayer, ControlsBar, TrimTimeline, MarkerInputs, ProgressCard],
  providers: [EditorStore],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
})
export class EditorPage {
  private readonly api = inject(ApiService);
  private readonly jobEvents = inject(JobEventsService);
  private readonly router = inject(Router);

  // Only one player is rendered at a time; whichever exists is the active one.
  private readonly nativePlayer = viewChild(VideoPlayer);
  private readonly embedPlayer = viewChild(EmbedPlayer);

  protected readonly store = inject(EditorStore);
  protected readonly mode = signal<EditorMode>('precise');
  protected readonly videoId = signal('');
  protected readonly youtubeId = signal('');
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
    const mode: EditorMode = route.snapshot.data['mode'] === 'quick' ? 'quick' : 'precise';
    this.mode.set(mode);
    if (mode === 'quick') {
      this.initQuick(route.snapshot.paramMap.get('youtubeId') ?? '');
    } else {
      this.initPrecise(route.snapshot.paramMap.get('videoId') ?? '');
    }

    effect(() => {
      const job = this.clipJob();
      if (job?.state === 'done' && job.result?.clipId) {
        void this.router.navigate(['/result', job.result.clipId]);
      }
    });
  }

  private initPrecise(videoId: string): void {
    this.videoId.set(videoId);
    this.streamUrl.set(this.api.videoStreamUrl(videoId));
    this.api.videoMeta(videoId).subscribe({
      next: (meta) => this.store.initFromMeta(meta),
      error: () => void this.router.navigate(['/']),
    });
  }

  private initQuick(youtubeId: string): void {
    this.youtubeId.set(youtubeId);
    // The fetch page passes title/duration via navigation state for an instant
    // editor; on reload/direct nav that's gone, so re-resolve.
    const state = history.state as { title?: string; durationSec?: number };
    if (typeof state?.durationSec === 'number' && state.durationSec > 0) {
      this.seedQuick(youtubeId, state.title ?? 'YouTube video', state.durationSec);
      return;
    }
    this.api.resolve(`https://www.youtube.com/watch?v=${youtubeId}`).subscribe({
      next: (result) => this.seedQuick(youtubeId, result.title, result.durationSec),
      error: () => void this.router.navigate(['/']),
    });
  }

  private seedQuick(youtubeId: string, title: string, durationSec: number): void {
    const meta: VideoMeta = {
      videoId: youtubeId,
      title,
      durationSec,
      width: 0,
      height: 0,
      sizeBytes: 0,
    };
    this.store.initFromMeta(meta);
  }

  private activePlayer(): VideoPlayer | EmbedPlayer | undefined {
    return this.embedPlayer() ?? this.nativePlayer();
  }

  protected togglePlay(): void {
    this.activePlayer()?.toggle();
  }

  protected toggleMute(): void {
    this.activePlayer()?.toggleMute();
  }

  protected setVolume(volume: number): void {
    this.activePlayer()?.setVolume(volume);
  }

  protected seek(seconds: number): void {
    this.activePlayer()?.seek(seconds);
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
    const request$ =
      this.mode() === 'quick'
        ? this.api.createClipFromYoutube(
            this.youtubeId(),
            this.store.meta()?.title ?? 'Cropcorn clip',
            this.store.markIn(),
            this.store.markOut(),
            this.store.mode(),
          )
        : this.api.createClip(
            this.videoId(),
            this.store.markIn(),
            this.store.markOut(),
            this.store.mode(),
          );
    request$.subscribe({
      next: ({ jobId }) => this.clipWatch.set(this.jobEvents.watch(jobId)),
      error: (err: { error?: { message?: string } }) =>
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.'),
    });
  }
}
