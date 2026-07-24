import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { FetchPage } from './fetch-page';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { UploadEvent } from '../../core/api.service';

function setup(youtubeEnabled: boolean, upload$: Subject<UploadEvent>) {
  const api = {
    getConfig: vi
      .fn()
      .mockReturnValue(of({ youtubeEnabled, maxUploadBytes: 1_000_000, maxUploadDurationSec: 60 })),
    uploadVideo: vi.fn().mockReturnValue(upload$.asObservable()),
    resolve: vi.fn(),
    startDownload: vi.fn(),
  };
  const jobEvents = {
    watch: vi.fn().mockReturnValue({ job: () => undefined, dispose: () => undefined }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: JobEventsService, useValue: jobEvents },
    ],
  });
  const fixture = TestBed.createComponent(FetchPage);
  fixture.detectChanges();
  return { fixture, api };
}

describe('FetchPage upload mode', () => {
  it('hides the YouTube form when youtubeEnabled is false', () => {
    const { fixture } = setup(false, new Subject());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="yt-url"]')).toBeNull();
    expect(el.querySelector('[data-testid="file-input"]')).not.toBeNull();
  });

  it('uploads a selected file and starts watching the returned job', () => {
    const upload$ = new Subject<UploadEvent>();
    const { fixture, api } = setup(true, upload$);
    const component = fixture.componentInstance as unknown as {
      onFileSelected: (f: File) => void;
    };
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    component.onFileSelected(file);
    expect(api.uploadVideo).toHaveBeenCalledWith(file);
  });

  it('keeps working defaults and logs (never silently swallows) when getConfig fails', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = {
      getConfig: vi.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED'))),
      uploadVideo: vi.fn(),
      resolve: vi.fn(),
      startDownload: vi.fn(),
    };
    const jobEvents = {
      watch: vi.fn().mockReturnValue({ job: () => undefined, dispose: () => undefined }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: JobEventsService, useValue: jobEvents },
      ],
    });
    const fixture = TestBed.createComponent(FetchPage);
    fixture.detectChanges();

    // Flush the retry backoff (3 × 500ms) so the error handler runs.
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // Failure keeps the working default (youtubeEnabled=true) — both sources
    // stay available rather than silently hiding YouTube — and it is logged.
    expect(el.querySelector('[data-testid="source-youtube"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="file-input"]')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    vi.useRealTimers();
  });
});
