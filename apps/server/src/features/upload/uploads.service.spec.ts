import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JobStore } from '../jobs/job-store';
import { JobQueue } from '../jobs/job-queue';
import { UploadsService } from './uploads.service';
import type { ClipsService } from '../clips/clips.service';
import type { GoogleAuthService } from './google-auth.service';
import type { YoutubeUploadService } from './youtube-upload.service';

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('UploadsService', () => {
  let store: JobStore;
  let clips: { clipPathOrThrow: ReturnType<typeof vi.fn> };
  let auth: { status: ReturnType<typeof vi.fn> };
  let youtube: { upload: ReturnType<typeof vi.fn> };
  let service: UploadsService;

  beforeEach(() => {
    store = new JobStore();
    clips = {
      clipPathOrThrow: vi.fn().mockResolvedValue('/data/clips/x/clip.mp4'),
    };
    auth = {
      status: vi.fn().mockResolvedValue({ configured: true, authorized: true }),
    };
    youtube = {
      upload: vi
        .fn()
        .mockResolvedValue({
          youtubeVideoId: 'yt123',
          watchUrl: 'https://youtu.be/yt123',
        }),
    };
    service = new UploadsService(
      store,
      new JobQueue(store),
      clips as unknown as ClipsService,
      auth as unknown as GoogleAuthService,
      youtube as unknown as YoutubeUploadService,
    );
  });

  it('rejects uploads for unknown clips', async () => {
    clips.clipPathOrThrow.mockRejectedValue(new NotFoundException());
    await expect(
      service.startUpload({ clipId: 'nope', title: 'x', description: '' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects uploads when Google is not connected', async () => {
    auth.status.mockResolvedValue({ configured: true, authorized: false });
    await expect(
      service.startUpload({ clipId: 'abc', title: 'x', description: '' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects empty titles', async () => {
    await expect(
      service.startUpload({ clipId: 'abc', title: '   ', description: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runs the upload job through to done with the watch url in the result', async () => {
    const job = await service.startUpload({
      clipId: 'abc',
      title: 'My clip',
      description: 'desc',
    });
    await tick();
    const finished = store.get(job.id);
    expect(finished?.state).toBe('done');
    expect(finished?.result?.watchUrl).toBe('https://youtu.be/yt123');
    expect(youtube.upload).toHaveBeenCalledWith(
      {
        filePath: '/data/clips/x/clip.mp4',
        title: 'My clip',
        description: 'desc',
      },
      expect.any(Function),
    );
  });

  it('surfaces upload failures as job errors', async () => {
    youtube.upload.mockRejectedValue(new Error('quotaExceeded'));
    const job = await service.startUpload({
      clipId: 'abc',
      title: 'My clip',
      description: '',
    });
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
    expect(store.get(job.id)?.error).toContain('quotaExceeded');
  });
});
