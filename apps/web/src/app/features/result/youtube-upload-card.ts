import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import type { AuthStatus, Playlist, UploadOptions } from '../../core/api.service';
import { isTerminal } from '../../core/api.models';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { ProgressCard } from '../../shared/progress-card';

/** Sentinel <option> values for the playlist picker. */
export const NO_PLAYLIST = '';
export const NEW_PLAYLIST = '__new__';

@Component({
  selector: 'app-youtube-upload-card',
  imports: [ProgressCard],
  templateUrl: './youtube-upload-card.html',
  styleUrl: './youtube-upload-card.scss',
})
export class YoutubeUploadCard {
  readonly clipId = input.required<string>();
  readonly defaultTitle = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly jobEvents = inject(JobEventsService);

  protected readonly status = signal<AuthStatus | undefined>(undefined);
  protected readonly playlists = signal<Playlist[]>([]);
  protected readonly title = signal('');
  protected readonly selectedPlaylist = signal<string>(NO_PLAYLIST);
  protected readonly newPlaylistTitle = signal('');
  protected readonly requestError = signal('');
  private readonly watch = signal<JobWatch | undefined>(undefined);
  private titleTouched = false;

  protected readonly newPlaylistSentinel = NEW_PLAYLIST;
  protected readonly creatingPlaylist = computed(() => this.selectedPlaylist() === NEW_PLAYLIST);

  protected readonly job = computed(() => this.watch()?.job());
  protected readonly uploading = computed(() => {
    const job = this.job();
    return job !== undefined && !isTerminal(job.state);
  });
  protected readonly watchUrl = computed(() => {
    const job = this.job();
    return job?.state === 'done' ? (job.result?.watchUrl ?? '') : '';
  });
  protected readonly errorText = computed(() => {
    const job = this.job();
    return this.requestError() || (job?.state === 'error' ? (job.error ?? 'Upload failed.') : '');
  });

  constructor() {
    this.loadStatus();
    effect(() => {
      if (!this.titleTouched && this.defaultTitle()) {
        this.title.set(`${this.defaultTitle()} — clip`);
      }
    });
  }

  private loadStatus(): void {
    this.api.authStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        if (status.authorized) {
          this.loadPlaylists();
        }
      },
      error: () => this.status.set({ configured: false, authorized: false }),
    });
  }

  private loadPlaylists(): void {
    this.api.listPlaylists().subscribe({
      next: (playlists) => this.playlists.set(playlists),
      error: () => this.playlists.set([]),
    });
  }

  protected onTitleInput(value: string): void {
    this.titleTouched = true;
    this.title.set(value);
  }

  protected connect(): void {
    window.location.href = `/api/auth/google?return=/result/${this.clipId()}`;
  }

  protected signOut(): void {
    this.api.signOut().subscribe({
      next: () => {
        this.status.set({ configured: true, authorized: false });
        this.playlists.set([]);
        this.selectedPlaylist.set(NO_PLAYLIST);
        this.watch()?.dispose();
        this.watch.set(undefined);
      },
    });
  }

  protected upload(): void {
    if (this.uploading() || !this.title().trim()) {
      return;
    }
    const options: UploadOptions = {};
    if (this.selectedPlaylist() === NEW_PLAYLIST) {
      const name = this.newPlaylistTitle().trim();
      if (!name) {
        this.requestError.set('Name the new playlist, or pick another option.');
        return;
      }
      options.newPlaylistTitle = name;
    } else if (this.selectedPlaylist()) {
      options.playlistId = this.selectedPlaylist();
    }

    this.requestError.set('');
    this.watch()?.dispose();
    this.api
      .startUpload(this.clipId(), this.title().trim(), 'Clipped with Cropcorn 🍿', options)
      .subscribe({
        next: ({ jobId }) => this.watch.set(this.jobEvents.watch(jobId)),
        error: (err: { status?: number; error?: { message?: string } }) => {
          if (err.status === 401) {
            this.status.set({ configured: true, authorized: false });
            this.requestError.set('Google session expired — connect again.');
          } else {
            this.requestError.set(err.error?.message ?? 'Could not start the upload.');
          }
        },
      });
  }
}
