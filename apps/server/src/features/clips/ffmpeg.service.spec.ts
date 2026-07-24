import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FfmpegService } from './ffmpeg.service';
import { loadConfig } from '../../config/config';

describe('FfmpegService.normalize', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('remuxes the sample fixture into a non-empty mp4', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cropcorn-normalize-'));
    const out = join(dir, 'source.mp4');
    const ffmpeg = new FfmpegService();
    await ffmpeg.normalize(
      { inputPath: loadConfig().fixturePath, outputPath: out, transcode: false },
      4,
      () => undefined,
    );
    expect((await stat(out)).size).toBeGreaterThan(0);
  });
});
