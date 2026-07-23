export interface VideoProbe {
  videoId: string;
  title: string;
  durationSec: number;
  isLive: boolean;
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
  download(
    url: string,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo>;
}

export const VIDEO_FETCHER = 'VIDEO_FETCHER';
