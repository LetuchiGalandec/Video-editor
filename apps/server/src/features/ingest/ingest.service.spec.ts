import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../jobs/job-store';
import { JobQueue } from '../jobs/job-queue';
import { IngestService } from './ingest.service';
import { loadConfig } from '../../config/config';
import type { ProbeService } from '../videos/probe.service';
import type { FfmpegService } from '../clips/ffmpeg.service';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe('IngestService', () => {
  let dataDir: string;
  let store: JobStore;
  let queue: JobQueue;
  let probe: { probe: ReturnType<typeof vi.fn> };
  let ffmpeg: { normalize: ReturnType<typeof vi.fn> };
  let service: IngestService;

  const playable = { durationSec: 5, width: 640, height: 360, videoCodec: 'h264', audioCodec: 'aac', container: 'mov,mp4,m4a' };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cropcorn-ingest-'));
    store = new JobStore();
    queue = new JobQueue(store);
    probe = { probe: vi.fn() };
    ffmpeg = { normalize: vi.fn().mockResolvedValue(undefined) };
    service = new IngestService(
      { ...loadConfig(), dataDir, maxUploadDurationSec: 60 },
      store,
      queue,
      probe as unknown as ProbeService,
      ffmpeg as unknown as FfmpegService,
    );
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const makeTemp = async (name: string): Promise<string> => {
    const p = join(dataDir, name);
    await writeFile(p, 'x');
    return p;
  };

  it('remuxes a playable file, writes info.json, sets result.videoId, cleans temp', async () => {
    probe.probe.mockResolvedValue(playable);
    const temp = await makeTemp('in.mp4');
    const job = await service.ingest(temp, 'My Clip.mp4');
    await tick();
    expect(ffmpeg.normalize).toHaveBeenCalledWith(
      expect.objectContaining({ transcode: false }),
      5,
      expect.any(Function),
    );
    expect(store.get(job.id)?.state).toBe('done');
    expect(store.get(job.id)?.result?.videoId).toBe(job.id);
    const info = JSON.parse(await readFile(join(dataDir, 'videos', job.id, 'info.json'), 'utf-8'));
    expect(info.title).toBe('My Clip');
    await expect(stat(temp)).rejects.toThrow();
  });

  it('transcodes an HEVC file', async () => {
    probe.probe.mockResolvedValue({ ...playable, videoCodec: 'hevc' });
    const temp = await makeTemp('in.mov');
    await service.ingest(temp, 'iphone.mov');
    await tick();
    expect(ffmpeg.normalize).toHaveBeenCalledWith(
      expect.objectContaining({ transcode: true }),
      5,
      expect.any(Function),
    );
  });

  it('errors the job when the video is longer than the cap', async () => {
    probe.probe.mockResolvedValue({ ...playable, durationSec: 999 });
    const temp = await makeTemp('long.mp4');
    const job = await service.ingest(temp, 'long.mp4');
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
    expect(ffmpeg.normalize).not.toHaveBeenCalled();
  });

  it('errors the job when there is no video stream', async () => {
    probe.probe.mockResolvedValue({ durationSec: 0, width: 0, height: 0, videoCodec: '', audioCodec: '', container: '' });
    const temp = await makeTemp('note.bin');
    const job = await service.ingest(temp, 'note.bin');
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
  });
});
