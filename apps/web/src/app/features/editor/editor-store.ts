import { Injectable, computed, signal } from '@angular/core';
import type { ClipMode, VideoMeta } from '../../core/api.models';

export const MIN_SELECTION_SEC = 0.2;

/** Per-editor-session state: playback mirror signals plus the trim selection. */
@Injectable()
export class EditorStore {
  readonly meta = signal<VideoMeta | undefined>(undefined);
  readonly duration = signal(0);
  readonly currentTime = signal(0);
  readonly playing = signal(false);
  readonly muted = signal(false);
  readonly volume = signal(1);
  readonly markIn = signal(0);
  readonly markOut = signal(0);
  readonly mode = signal<ClipMode>('accurate');

  readonly selectionLength = computed(() => this.markOut() - this.markIn());
  readonly canGenerate = computed(
    () => this.duration() > 0 && this.selectionLength() >= MIN_SELECTION_SEC,
  );

  initFromMeta(meta: VideoMeta): void {
    this.meta.set(meta);
    this.duration.set(meta.durationSec);
    this.markIn.set(0);
    this.markOut.set(meta.durationSec);
  }

  setMarkIn(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.markOut() - MIN_SELECTION_SEC));
    this.markIn.set(clamped);
  }

  setMarkOut(seconds: number): void {
    const clamped = Math.min(this.duration(), Math.max(seconds, this.markIn() + MIN_SELECTION_SEC));
    this.markOut.set(clamped);
  }
}
