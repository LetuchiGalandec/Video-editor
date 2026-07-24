import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { ApiService } from './api.service';
import type { UploadEvent } from './api.service';

describe('ApiService uploads', () => {
  let api: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getConfig GETs /api/config', () => {
    let result: unknown;
    api.getConfig().subscribe((c) => (result = c));
    const req = httpMock.expectOne('/api/config');
    expect(req.request.method).toBe('GET');
    req.flush({ youtubeEnabled: true, maxUploadBytes: 10, maxUploadDurationSec: 20 });
    expect(result).toEqual({ youtubeEnabled: true, maxUploadBytes: 10, maxUploadDurationSec: 20 });
  });

  it('uploadVideo posts FormData and maps progress then uploaded', () => {
    const events: UploadEvent[] = [];
    const file = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
    api.uploadVideo(file).subscribe((e) => events.push(e));

    const req = httpMock.expectOne('/api/videos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    req.event(new HttpResponse({ body: { jobId: 'job-1' } }));

    expect(events).toContainEqual({ kind: 'progress', percent: 50 });
    expect(events).toContainEqual({ kind: 'uploaded', jobId: 'job-1' });
  });
});
