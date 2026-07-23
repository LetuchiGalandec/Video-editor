import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ControlsBar } from './controls-bar';
import { EditorStore } from './editor-store';
import { VideoPlayer } from './video-player';

@Component({
  selector: 'app-editor-page',
  imports: [VideoPlayer, ControlsBar],
  providers: [EditorStore],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
})
export class EditorPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly store = inject(EditorStore);
  protected readonly videoId = signal('');
  protected readonly streamUrl = signal('');

  constructor() {
    const route = inject(ActivatedRoute);
    const videoId = route.snapshot.paramMap.get('videoId') ?? '';
    this.videoId.set(videoId);
    this.streamUrl.set(this.api.videoStreamUrl(videoId));
    this.api.videoMeta(videoId).subscribe({
      next: (meta) => this.store.initFromMeta(meta),
      error: () => void this.router.navigate(['/']),
    });
  }
}
