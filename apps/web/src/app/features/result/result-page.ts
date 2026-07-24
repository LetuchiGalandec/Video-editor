import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { secondsToTimestamp } from '../../core/time-format';
import { YoutubeUploadCard } from './youtube-upload-card';

export interface ClipMetaResponse {
  clipId: string;
  source: 'downloaded' | 'youtube';
  videoId: string;
  youtubeId: string;
  title: string;
  startSec: number;
  endSec: number;
  mode: 'accurate' | 'fast';
  sizeBytes: number;
  durationSec: number;
}

const BYTES_PER_MB = 1024 * 1024;

@Component({
  selector: 'app-result-page',
  imports: [RouterLink, YoutubeUploadCard],
  templateUrl: './result-page.html',
  styleUrl: './result-page.scss',
})
export class ResultPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly meta = signal<ClipMetaResponse | undefined>(undefined);
  protected readonly clipId = signal('');

  protected readonly streamUrl = computed(() => `/api/clips/${this.clipId()}/stream`);
  protected readonly downloadUrl = computed(() => this.api.clipFileUrl(this.clipId()));
  protected readonly editUrl = computed(() => {
    const meta = this.meta();
    return meta?.source === 'youtube'
      ? ['/preview', meta.youtubeId]
      : ['/edit', meta?.videoId ?? ''];
  });
  protected readonly factsLine = computed(() => {
    const meta = this.meta();
    if (!meta) {
      return '';
    }
    const range = `${secondsToTimestamp(meta.startSec)} → ${secondsToTimestamp(meta.endSec)}`;
    const size = `${(meta.sizeBytes / BYTES_PER_MB).toFixed(1)} MB`;
    const mode = meta.mode === 'accurate' ? 'frame-accurate' : 'fast cut';
    return `${range} · ${secondsToTimestamp(meta.durationSec)} long · ${mode} · ${size}`;
  });

  constructor() {
    const route = inject(ActivatedRoute);
    const http = inject(HttpClient);
    const clipId = route.snapshot.paramMap.get('clipId') ?? '';
    this.clipId.set(clipId);
    http.get<ClipMetaResponse>(`/api/clips/${clipId}/meta`).subscribe({
      next: (meta) => this.meta.set(meta),
      error: () => void this.router.navigate(['/']),
    });
  }
}
