import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { JobStore } from '../jobs/job-store';
import { JobQueue } from '../jobs/job-queue';
import { ClipsService } from './clips.service';
import { loadConfig } from '../../config/config';
import type { VideoFetcher } from '../fetch/video-fetcher';
import type { VideosService } from '../videos/videos.service';
import type { ProbeService } from '../videos/probe.service';
import type { FfmpegService } from './ffmpeg.service';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe('ClipsService.createClip', () => {
  let dataDir: string;
  let store: JobStore;
  let fetcher: { downloadSection: ReturnType<typeof vi.fn>; probe: ReturnType<typeof vi.fn>; download: ReturnType<typeof vi.fn> };
  let videos: { sourcePathOrThrow: ReturnType<typeof vi.fn>; meta: ReturnType<typeof vi.fn> };
  let probe: { probe: ReturnType<typeof vi.fn> };
  let ffmpeg: { cut: ReturnType<typeof vi.fn> };
  let service: ClipsService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'cropcorn-clips-'));
    store = new JobStore();
    fetcher = {
      downloadSection: vi.fn().mockResolvedValue({ filePath: 'clip.mp4' }),
      probe: vi.fn(),
      download: vi.fn(),
    };
    videos = {
      sourcePathOrThrow: vi.fn().mockResolvedValue('/data/videos/v/source.mp4'),
      meta: vi.fn().mockResolvedValue({ title: 'Downloaded title' }),
    };
    probe = { probe: vi.fn().mockResolvedValue({ durationSec: 100, width: 1280, height: 720 }) };
    ffmpeg = { cut: vi.fn().mockResolvedValue(undefined) };
    service = new ClipsService(
      { ...loadConfig(), dataDir },
      fetcher as unknown as VideoFetcher,
      store,
      new JobQueue(store),
      videos as unknown as VideosService,
      probe as unknown as ProbeService,
      ffmpeg as unknown as FfmpegService,
    );
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('downloaded source crops via ffmpeg and never section-downloads', async () => {
    const job = await service.createClip({
      source: 'downloaded',
      videoId: 'abc',
      startSec: 2,
      endSec: 8,
      mode: 'accurate',
    });
    await tick();
    expect(ffmpeg.cut).toHaveBeenCalledOnce();
    expect(fetcher.downloadSection).not.toHaveBeenCalled();
    expect(store.get(job.id)?.state).toBe('done');
  });

  it('youtube source section-downloads and never runs ffmpeg', async () => {
    const job = await service.createClip({
      source: 'youtube',
      youtubeId: 'dQw4w9WgXcQ',
      title: 'My clip',
      startSec: 2,
      endSec: 8,
      mode: 'fast',
    });
    await tick();
    expect(fetcher.downloadSection).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      2,
      8,
      'fast',
      expect.any(String),
      expect.any(Function),
    );
    expect(ffmpeg.cut).not.toHaveBeenCalled();
    expect(store.get(job.id)?.state).toBe('done');
  });

  it('rejects a too-short selection', async () => {
    await expect(
      service.createClip({ source: 'youtube', youtubeId: 'dQw4w9WgXcQ', title: 't', startSec: 5, endSec: 5.1, mode: 'fast' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed youtube id (path safety)', async () => {
    await expect(
      service.createClip({ source: 'youtube', youtubeId: '../etc', title: 't', startSec: 0, endSec: 5, mode: 'fast' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown cut mode', async () => {
    await expect(
      service.createClip({
        source: 'downloaded',
        videoId: 'abc',
        startSec: 0,
        endSec: 5,
        mode: 'weird' as 'fast',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
