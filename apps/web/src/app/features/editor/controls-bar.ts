import { Component, computed, inject, output } from '@angular/core';
import { secondsToTimestamp } from '../../core/time-format';
import { EditorStore } from './editor-store';

@Component({
  selector: 'app-controls-bar',
  templateUrl: './controls-bar.html',
  styleUrl: './controls-bar.scss',
})
export class ControlsBar {
  readonly togglePlay = output<void>();
  readonly toggleMute = output<void>();
  readonly volumeChange = output<number>();

  protected readonly store = inject(EditorStore);

  protected readonly timeLabel = computed(
    () =>
      `${secondsToTimestamp(this.store.currentTime())} / ${secondsToTimestamp(this.store.duration())}`,
  );

  protected onVolumeInput(event: Event): void {
    this.volumeChange.emit(Number((event.target as HTMLInputElement).value));
  }
}
