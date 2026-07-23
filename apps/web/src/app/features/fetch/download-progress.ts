import { Component, computed, input } from '@angular/core';
import type { Job } from '../../core/api.models';

const STAGE_LABELS: Record<Job['state'], string> = {
  queued: 'Waiting for a free popper…',
  running: 'Fetching your feature presentation…',
  done: 'Popped and ready!',
  error: 'That one burned.',
};

@Component({
  selector: 'app-download-progress',
  templateUrl: './download-progress.html',
  styleUrl: './download-progress.scss',
})
export class DownloadProgress {
  readonly job = input.required<Job>();

  protected readonly label = computed(() => STAGE_LABELS[this.job().state]);
  protected readonly percent = computed(() => Math.round(this.job().progress));
}
