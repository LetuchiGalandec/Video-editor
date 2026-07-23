import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { parseYoutubeVideoId } from './youtube-url';
import type { CutMode } from './section-args';
import type { FetchedVideo, VideoFetcher, VideoProbe } from './video-fetcher';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];
const STEP_DELAY_MS = 40;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
      playableInEmbed: true,
      ageLimit: 0,
    };
  }

  async download(
    _url: string,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    return this.copyFixture(destDir, 'source.mp4', onProgress);
  }

  async downloadSection(
    _url: string,
    _startSec: number,
    _endSec: number,
    _cut: CutMode,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    // The fixture already stands in for "the clip"; e2e only needs a playable
    // mp4 at the end of the section-download path.
    return this.copyFixture(destDir, 'clip.mp4', onProgress);
  }

  private async copyFixture(
    destDir: string,
    fileName: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    await mkdir(destDir, { recursive: true });
    const filePath = path.join(destDir, fileName);
    for (const step of PROGRESS_STEPS) {
      await delay(STEP_DELAY_MS);
      onProgress(step * 0.98);
    }
    await copyFile(this.fixturePath, filePath);
    return { filePath };
  }
}
