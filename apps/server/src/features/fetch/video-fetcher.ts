import type { CutMode } from './section-args';

export interface VideoProbe {
  videoId: string;
  title: string;
  durationSec: number;
  isLive: boolean;
  /** Whether YouTube allows this video in an embedded player (Quick preview). */
  playableInEmbed: boolean;
  /** 0 for unrestricted; >0 means age-gated. */
  ageLimit: number;
}

export interface FetchedVideo {
  filePath: string;
}

export type FetchErrorCode =
  | 'private'
  | 'age_restricted'
  | 'unavailable'
  | 'live'
  | 'too_long'
  | 'drm'
  | 'fetch_failed';

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code: FetchErrorCode,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * The seam between Cropcorn and the outside world: yt-dlp today, potentially a
 * hosted vendor API later, and a fixture-copying fake in tests.
 */
export interface VideoFetcher {
  probe(url: string): Promise<VideoProbe>;
  /** Full download into destDir (Precise mode). */
  download(
    url: string,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo>;
  /** Download only [startSec, endSec] straight to a clip (Quick mode). */
  downloadSection(
    url: string,
    startSec: number,
    endSec: number,
    cut: CutMode,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo>;
}

export const VIDEO_FETCHER = 'VIDEO_FETCHER';
