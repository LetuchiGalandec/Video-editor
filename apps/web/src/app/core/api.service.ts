import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { ClipMode, Job, VideoMeta } from './api.models';

export interface AuthUser {
  name: string;
}

export interface AuthStatus {
  configured: boolean;
  authorized: boolean;
  user?: AuthUser;
}

export interface Playlist {
  id: string;
  title: string;
}

export interface UploadOptions {
  playlistId?: string;
  newPlaylistTitle?: string;
}

export interface ResolveResult {
  youtubeId: string;
  title: string;
  durationSec: number;
  playableInEmbed: boolean;
}

export interface PublicConfig {
  youtubeEnabled: boolean;
  maxUploadBytes: number;
  maxUploadDurationSec: number;
}

export type UploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'uploaded'; jobId: string };

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** Quick mode: metadata only, no download. */
  resolve(url: string): Observable<ResolveResult> {
    return this.http.post<ResolveResult>('/api/resolve', { url });
  }

  /** Precise mode: full download into the native player. */
  startDownload(url: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/downloads', { url });
  }

  job(id: string): Observable<Job> {
    return this.http.get<Job>(`/api/jobs/${id}`);
  }

  videoMeta(videoId: string): Observable<VideoMeta> {
    return this.http.get<VideoMeta>(`/api/videos/${videoId}/meta`);
  }

  videoStreamUrl(videoId: string): string {
    return `/api/videos/${videoId}/stream`;
  }

  /** Precise mode: crop the already-downloaded source. */
  createClip(
    videoId: string,
    startSec: number,
    endSec: number,
    mode: ClipMode,
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/clips', {
      source: 'downloaded',
      videoId,
      startSec,
      endSec,
      mode,
    });
  }

  /** Quick mode: download only the selected section. */
  createClipFromYoutube(
    youtubeId: string,
    title: string,
    startSec: number,
    endSec: number,
    mode: ClipMode,
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/clips', {
      source: 'youtube',
      youtubeId,
      title,
      startSec,
      endSec,
      mode,
    });
  }

  clipFileUrl(clipId: string): string {
    return `/api/clips/${clipId}/file`;
  }

  authStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>('/api/auth/status');
  }

  signOut(): Observable<void> {
    return this.http.post<void>('/api/auth/signout', {});
  }

  listPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>('/api/youtube/playlists');
  }

  startUpload(
    clipId: string,
    title: string,
    description: string,
    options: UploadOptions = {},
  ): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/uploads', {
      clipId,
      title,
      description,
      playlistId: options.playlistId ?? '',
      newPlaylistTitle: options.newPlaylistTitle ?? '',
    });
  }

  getConfig(): Observable<PublicConfig> {
    return this.http.get<PublicConfig>('/api/config');
  }

  /** Upload a local file; emits transfer progress, then the created job id. */
  uploadVideo(file: File): Observable<UploadEvent> {
    const form = new FormData();
    form.append('file', file);
    const req = new HttpRequest('POST', '/api/videos', form, {
      reportProgress: true,
    });
    return this.http.request<{ jobId: string }>(req).pipe(
      map((event): UploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent = event.total
            ? Math.round((event.loaded / event.total) * 100)
            : 0;
          return { kind: 'progress', percent };
        }
        if (event instanceof HttpResponse) {
          return { kind: 'uploaded', jobId: event.body?.jobId ?? '' };
        }
        return null;
      }),
      filter((e): e is UploadEvent => e !== null),
    );
  }
}
