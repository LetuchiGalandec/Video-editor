import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadConfig } from '../../config/config';
import { CleanupService } from './cleanup.service';
import { JobStore } from './job-store';

const HOUR_MS = 60 * 60 * 1000;

describe('CleanupService', () => {
  let dataDir: string;
  let store: JobStore;
  let service: CleanupService;

  const makeDir = async (kind: 'videos' | 'clips', name: string, ageMs: number): Promise<string> => {
    const dir = path.join(dataDir, kind, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'file.mp4'), 'x');
    const stamp = new Date(Date.now() - ageMs);
    await utimes(dir, stamp, stamp);
    return dir;
  };

  const exists = async (p: string): Promise<boolean> =>
    stat(p).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'cropcorn-cleanup-'));
    store = new JobStore();
    // ttlMinutes default: 360 (6h)
    service = new CleanupService({ ...loadConfig(), dataDir }, store);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('removes video and clip directories older than the TTL, keeps fresh ones', async () => {
    const oldVideo = await makeDir('videos', 'old-video', 10 * HOUR_MS);
    const freshVideo = await makeDir('videos', 'fresh-video', 1 * HOUR_MS);
    const oldClip = await makeDir('clips', 'old-clip', 8 * HOUR_MS);

    await service.sweep();

    expect(await exists(oldVideo)).toBe(false);
    expect(await exists(oldClip)).toBe(false);
    expect(await exists(freshVideo)).toBe(true);
  });

  it('drops terminal jobs past the TTL but never running ones', async () => {
    const doneJob = store.create('download');
    store.patch(doneJob.id, { state: 'done' });
    const runningJob = store.create('clip');
    store.patch(runningJob.id, { state: 'running' });

    const future = Date.now() + 10 * HOUR_MS;
    await service.sweep(future);

    expect(store.get(doneJob.id)).toBeUndefined();
    expect(store.get(runningJob.id)).toBeDefined();
  });

  it('is a no-op when the data directories do not exist yet', async () => {
    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
