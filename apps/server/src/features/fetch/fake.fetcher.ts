import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { parseYoutubeVideoId } from './youtube-url';
import type { FetchedVideo, VideoFetcher, VideoProbe } from './video-fetcher';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];
const STEP_DELAY_MS = 40;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Test double for VideoFetcher: copies the committed fixture video instead of
 * touching YouTube, with a short synthetic progress ramp so progress UIs and
 * e2e tests exercise the same code paths as the real fetcher.
 */
export class FakeFetcher implements VideoFetcher {
  constructor(private readonly fixturePath: string) {}

  async probe(url: string): Promise<VideoProbe> {
    return {
      videoId: parseYoutubeVideoId(url) ?? 'fixture0000',
      title: 'Sample fixture video',
      durationSec: 4,
      isLive: false,
    };
  }

  async download(
    _url: string,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    await mkdir(destDir, { recursive: true });
    const filePath = path.join(destDir, 'source.mp4');
    for (const step of PROGRESS_STEPS) {
      await delay(STEP_DELAY_MS);
      onProgress(step * 0.98);
    }
    await copyFile(this.fixturePath, filePath);
    return { filePath };
  }
}
