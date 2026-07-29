import { Component, computed, inject } from '@angular/core';
import { secondsToTimestamp, timestampToSeconds } from '../../core/time-format';
import { EditorStore } from './editor-store';
import { markerKeyStep, snapToTenth } from './marker-step';

type MarkerSide = 'in' | 'out';

/**
 * Numeric fallbacks for the timeline: typed timestamps, arrow-key stepping and
 * set-from-playhead.
 */
@Component({
  selector: 'app-marker-inputs',
  templateUrl: './marker-inputs.html',
  styleUrl: './marker-inputs.scss',
})
export class MarkerInputs {
  protected readonly store = inject(EditorStore);

  protected readonly inText = computed(() => secondsToTimestamp(this.store.markIn()));
  protected readonly outText = computed(() => secondsToTimestamp(this.store.markOut()));
  protected readonly lengthText = computed(() => secondsToTimestamp(this.store.selectionLength()));

  protected commit(which: MarkerSide, input: HTMLInputElement): void {
    const parsed = timestampToSeconds(input.value);
    if (parsed === null) {
      this.revert(which, input);
      return;
    }
    this.apply(which, parsed, input);
  }

  /** Arrow/page keys nudge the marker instead of moving the caret. */
  protected onKeydown(which: MarkerSide, event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.revert(which, input);
      return;
    }
    const step = markerKeyStep(event.key, event.shiftKey);
    if (step === null) {
      return;
    }
    // Otherwise Up/Down jump the caret to the ends of the field.
    event.preventDefault();
    // Step from what is on screen, so a half-typed value is honoured rather
    // than silently discarded in favour of the last committed one.
    const shown = timestampToSeconds(input.value);
    const base = shown ?? (which === 'in' ? this.store.markIn() : this.store.markOut());
    this.apply(which, snapToTenth(base + step), input);
  }

  private apply(which: MarkerSide, seconds: number, input: HTMLInputElement): void {
    // The store owns the ordering and bounds rules; it may clamp what we pass.
    if (which === 'in') {
      this.store.setMarkIn(seconds);
    } else {
      this.store.setMarkOut(seconds);
    }
    // Written back by hand: when the store clamps to the value already held,
    // the [value] binding sees no change and would leave the stale text.
    this.revert(which, input);
  }

  private revert(which: MarkerSide, input: HTMLInputElement): void {
    input.value = which === 'in' ? this.inText() : this.outText();
  }

  protected setFromPlayhead(which: MarkerSide): void {
    const now = this.store.currentTime();
    if (which === 'in') {
      this.store.setMarkIn(now);
    } else {
      this.store.setMarkOut(now);
    }
  }
}
