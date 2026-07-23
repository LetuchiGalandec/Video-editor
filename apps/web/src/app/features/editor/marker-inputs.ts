import { Component, computed, inject } from '@angular/core';
import { secondsToTimestamp, timestampToSeconds } from '../../core/time-format';
import { EditorStore } from './editor-store';

/** Numeric fallbacks for the timeline: typed timestamps and set-from-playhead. */
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

  protected commit(which: 'in' | 'out', input: HTMLInputElement): void {
    const parsed = timestampToSeconds(input.value);
    if (parsed === null) {
      input.value = which === 'in' ? this.inText() : this.outText();
      return;
    }
    if (which === 'in') {
      this.store.setMarkIn(parsed);
      input.value = this.inText();
    } else {
      this.store.setMarkOut(parsed);
      input.value = this.outText();
    }
  }

  protected setFromPlayhead(which: 'in' | 'out'): void {
    const now = this.store.currentTime();
    if (which === 'in') {
      this.store.setMarkIn(now);
    } else {
      this.store.setMarkOut(now);
    }
  }
}
