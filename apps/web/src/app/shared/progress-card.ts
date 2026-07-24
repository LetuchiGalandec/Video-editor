import { Component, computed, input } from '@angular/core';
import type { Job, JobState, JobType } from '../core/api.models';

const STAGE_LABELS: Record<JobType, Record<JobState, string>> = {
  download: {
    queued: 'Waiting for a free popper…',
    running: 'Fetching your feature presentation…',
    done: 'Popped and ready!',
    error: 'That one burned.',
  },
  clip: {
    queued: 'Waiting for the cutter…',
    running: 'Buttering the cut…',
    done: 'Sliced!',
    error: 'The cut burned.',
  },
  upload: {
    queued: 'Waiting to upload…',
    running: 'Rolling it up to YouTube…',
    done: 'On your channel!',
    error: 'The upload flopped.',
  },
  ingest: {
    queued: 'Waiting for a free popper…',
    running: 'Prepping your video…',
    done: 'Ready to trim!',
    error: "Couldn't prep that video.",
  },
};

@Component({
  selector: 'app-progress-card',
  templateUrl: './progress-card.html',
  styleUrl: './progress-card.scss',
})
export class ProgressCard {
  readonly job = input.required<Job>();

  protected readonly label = computed(() => STAGE_LABELS[this.job().type][this.job().state]);
  protected readonly percent = computed(() => Math.round(this.job().progress));
}
