import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ClipMode, Job, VideoMeta } from './api.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

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

  createClip(videoId: string, startSec: number, endSec: number, mode: ClipMode): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/clips', { videoId, startSec, endSec, mode });
  }

  clipFileUrl(clipId: string): string {
    return `/api/clips/${clipId}/file`;
  }

  authStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>('/api/auth/status');
  }

  startUpload(clipId: string, title: string, description: string): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>('/api/uploads', { clipId, title, description });
  }
}

export interface AuthStatus {
  configured: boolean;
  authorized: boolean;
}
