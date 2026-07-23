import { Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';
import { secondsToTimestamp } from '../../../core/time-format';
import { clampMarker, clientXToSeconds, keyboardStep } from './trim-timeline-math';
import type { MarkerKind, TrackRect } from './trim-timeline-math';

/**
 * The dual-handle trim timeline: drag the kernel handles to set the selection,
 * click the track to seek, arrow keys for frame-ish nudges. All px↔seconds
 * math lives in trim-timeline-math.ts.
 */
@Component({
  selector: 'app-trim-timeline',
  templateUrl: './trim-timeline.html',
  styleUrl: './trim-timeline.scss',
})
export class TrimTimeline {
  readonly duration = input.required<number>();
  readonly currentTime = input(0);
  readonly markIn = model.required<number>();
  readonly markOut = model.required<number>();
  readonly seek = output<number>();

  private readonly trackRef = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly inPct = computed(() => this.toPct(this.markIn()));
  protected readonly outPct = computed(() => this.toPct(this.markOut()));
  protected readonly playheadPct = computed(() => this.toPct(this.currentTime()));
  protected readonly inLabel = computed(() => secondsToTimestamp(this.markIn()));
  protected readonly outLabel = computed(() => secondsToTimestamp(this.markOut()));

  private toPct(seconds: number): number {
    const duration = this.duration();
    return duration > 0 ? (seconds / duration) * 100 : 0;
  }

  /** Moves a marker toward the given clientX; exposed for tests. */
  dragTo(kind: MarkerKind, clientX: number, rect: TrackRect): void {
    const seconds = clientXToSeconds(clientX, rect, this.duration());
    this.setMarker(kind, seconds);
  }

  private setMarker(kind: MarkerKind, seconds: number): void {
    const clamped = clampMarker(kind, seconds, {
      markIn: this.markIn(),
      markOut: this.markOut(),
      duration: this.duration(),
    });
    if (kind === 'in') {
      this.markIn.set(clamped);
    } else {
      this.markOut.set(clamped);
    }
  }

  protected onHandlePointerDown(kind: MarkerKind, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const rect = this.trackRect();
    handle.setPointerCapture?.(event.pointerId);
    const onMove = (move: PointerEvent): void => this.dragTo(kind, move.clientX, rect);
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  protected onTrackPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.handle')) {
      return;
    }
    const seconds = clientXToSeconds(event.clientX, this.trackRect(), this.duration());
    this.seek.emit(seconds);
  }

  protected onHandleKeydown(kind: MarkerKind, event: KeyboardEvent): void {
    const current = kind === 'in' ? this.markIn() : this.markOut();
    if (event.key === 'Home') {
      event.preventDefault();
      this.setMarker(kind, 0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.setMarker(kind, this.duration());
      return;
    }
    const step = keyboardStep(event.key, event.shiftKey);
    if (step !== null) {
      event.preventDefault();
      this.setMarker(kind, current + step);
    }
  }

  private trackRect(): TrackRect {
    const rect = this.trackRef().nativeElement.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }
}
