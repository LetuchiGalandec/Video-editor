import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JobStore } from '../jobs/job-store';
import { JobQueue } from '../jobs/job-queue';
import { UploadsService } from './uploads.service';
import type { ClipsService } from '../clips/clips.service';
import type { GoogleAuthService } from '../auth/google-auth.service';
import type { YoutubeUploadService } from './youtube-upload.service';
import type { YoutubePlaylistService } from './youtube-playlist.service';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const SID = 'sid-1';

describe('UploadsService', () => {
  let store: JobStore;
  let clips: { clipPathOrThrow: ReturnType<typeof vi.fn> };
  let auth: { clientForSession: ReturnType<typeof vi.fn> };
  let youtube: { upload: ReturnType<typeof vi.fn> };
  let playlists: { create: ReturnType<typeof vi.fn>; addVideo: ReturnType<typeof vi.fn> };
  let service: UploadsService;
  const fakeClient = { id: 'client' };

  beforeEach(() => {
    store = new JobStore();
    clips = { clipPathOrThrow: vi.fn().mockResolvedValue('/data/clips/x/clip.mp4') };
    auth = { clientForSession: vi.fn().mockResolvedValue(fakeClient) };
    youtube = {
      upload: vi
        .fn()
        .mockResolvedValue({ youtubeVideoId: 'yt123', watchUrl: 'https://youtu.be/yt123' }),
    };
    playlists = {
      create: vi.fn().mockResolvedValue('pl-new'),
      addVideo: vi.fn().mockResolvedValue(undefined),
    };
    service = new UploadsService(
      store,
      new JobQueue(store),
      clips as unknown as ClipsService,
      auth as unknown as GoogleAuthService,
      youtube as unknown as YoutubeUploadService,
      playlists as unknown as YoutubePlaylistService,
    );
  });

  it('rejects uploads for unknown clips', async () => {
    clips.clipPathOrThrow.mockRejectedValue(new NotFoundException());
    await expect(
      service.startUpload(SID, { clipId: 'nope', title: 'x', description: '' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects uploads when the session has no connected account', async () => {
    auth.clientForSession.mockResolvedValue(null);
    await expect(
      service.startUpload(SID, { clipId: 'abc', title: 'x', description: '' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects empty titles', async () => {
    await expect(
      service.startUpload(SID, { clipId: 'abc', title: '   ', description: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uploads and does not touch playlists when none is requested', async () => {
    const job = await service.startUpload(SID, { clipId: 'abc', title: 'My clip', description: 'd' });
    await tick();
    expect(store.get(job.id)?.state).toBe('done');
    expect(store.get(job.id)?.result?.watchUrl).toBe('https://youtu.be/yt123');
    expect(youtube.upload).toHaveBeenCalledWith(
      fakeClient,
      { filePath: '/data/clips/x/clip.mp4', title: 'My clip', description: 'd' },
      expect.any(Function),
    );
    expect(playlists.create).not.toHaveBeenCalled();
    expect(playlists.addVideo).not.toHaveBeenCalled();
  });

  it('adds the uploaded video to an existing playlist', async () => {
    const job = await service.startUpload(SID, {
      clipId: 'abc',
      title: 'My clip',
      description: '',
      playlistId: 'pl-existing',
    });
    await tick();
    expect(store.get(job.id)?.state).toBe('done');
    expect(playlists.create).not.toHaveBeenCalled();
    expect(playlists.addVideo).toHaveBeenCalledWith(fakeClient, 'pl-existing', 'yt123');
  });

  it('creates a new playlist then adds the video to it', async () => {
    const job = await service.startUpload(SID, {
      clipId: 'abc',
      title: 'My clip',
      description: '',
      newPlaylistTitle: 'Cropcorn clips',
    });
    await tick();
    expect(playlists.create).toHaveBeenCalledWith(fakeClient, 'Cropcorn clips');
    expect(playlists.addVideo).toHaveBeenCalledWith(fakeClient, 'pl-new', 'yt123');
    expect(store.get(job.id)?.state).toBe('done');
  });

  it('surfaces upload failures as job errors', async () => {
    youtube.upload.mockRejectedValue(new Error('quotaExceeded'));
    const job = await service.startUpload(SID, { clipId: 'abc', title: 'My clip', description: '' });
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
    expect(store.get(job.id)?.error).toContain('quotaExceeded');
  });
});
