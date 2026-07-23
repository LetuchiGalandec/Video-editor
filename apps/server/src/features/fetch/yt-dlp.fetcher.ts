import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { DownloadProgressTracker, PROGRESS_TEMPLATE } from './ytdlp-progress';
import { buildCookieFlags } from './cookie-flags';
import type { CookieFlags, CookieOptions } from './cookie-flags';
import { buildSectionArgs } from './section-args';
import type { CutMode } from './section-args';
import {
  runProcess,
  ProcessExitError,
  ProcessStallError,
  ProcessTimeoutError,
} from './run-process';
import { FetchError } from './video-fetcher';
import type { FetchedVideo, VideoFetcher, VideoProbe } from './video-fetcher';

/** Prefers h264+aac so the merged mp4 plays in every native <video> element. */
const buildFormat = (maxHeight: number): string =>
  `bv*[height<=${maxHeight}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]/b`;

// - socketTimeout/retries: give up on dead sockets fast, retry a bounded number
//   of times, so a stall fails fast instead of hanging.
// - jsRuntimes: let yt-dlp use the Node binary already running this server to
//   solve YouTube's signature/throttling params. Without it, section downloads
//   (ffmpeg range requests) get HTTP 403 Forbidden.
const RESILIENCE_FLAGS = {
  socketTimeout: 30,
  retries: 3,
  fragmentRetries: 3,
  jsRuntimes: `node:${process.execPath}`,
};

const PROBE_TIMEOUT_MS = 90_000;
// A healthy download prints a progress line ~every second; this much silence
// means the transfer is dead, so the watchdog kills it and frees the slot.
const DOWNLOAD_STALL_MS = 90_000;

// youtube-dl-exec exposes `args` and `constants` at runtime but omits them
// from its type declarations.
interface YtDlpModuleExtras {
  args: (flags: Record<string, unknown>) => string[];
  constants: { YOUTUBE_DL_PATH: string };
}
const ytdlpModule = youtubedl as unknown as YtDlpModuleExtras;

const YT_DLP_BINARY =
  process.env.YTDLP_PATH ?? ytdlpModule.constants.YOUTUBE_DL_PATH;

export interface FetcherOptions extends CookieOptions {
  /** Highest video height to fetch (default 1080). Lower = smaller/faster. */
  maxHeight?: number;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  duration?: number;
  is_live?: boolean;
  playable_in_embed?: boolean;
  age_limit?: number;
}

const STDERR_PATTERNS: Array<[RegExp, () => FetchError]> = [
  [
    /private video/i,
    () =>
      new FetchError(
        'This video is private, so it cannot be fetched.',
        'private',
      ),
  ],
  [
    /sign in to confirm your age|age.restricted|confirm your age/i,
    () =>
      new FetchError(
        'This video is age-restricted. Set YT_COOKIES_FROM_BROWSER (e.g. "chrome" or "safari") in apps/server/.env so Cropcorn can use your signed-in YouTube session, then try again.',
        'age_restricted',
      ),
  ],
  [
    /video unavailable|no longer available|has been removed/i,
    () =>
      new FetchError('This video is unavailable on YouTube.', 'unavailable'),
  ],
  [
    /premium members|members-only|join this channel|drm/i,
    () =>
      new FetchError(
        'This video is members-only or DRM-protected, so it cannot be fetched.',
        'drm',
      ),
  ],
];

export function mapYtDlpError(stderr: string): FetchError {
  for (const [pattern, makeError] of STDERR_PATTERNS) {
    if (pattern.test(stderr)) {
      return makeError();
    }
  }
  return new FetchError(
    'Fetching failed. YouTube may have changed something — try updating yt-dlp with `npm update youtube-dl-exec`.',
    'fetch_failed',
  );
}

/**
 * Runs yt-dlp under runProcess so a stalled download can never hold a worker
 * slot forever. Spawns the binary directly (not youtube-dl-exec's runner, which
 * mis-splits paths containing spaces); youtube-dl-exec still supplies the pinned
 * binary and the flag serializer.
 */
async function runYtDlp(
  url: string,
  flags: Record<string, unknown>,
  onLine?: (line: string) => void,
): Promise<{ stdout: string }> {
  const argv = [url, ...ytdlpModule.args(flags)];
  const isDownload = Boolean(onLine);
  try {
    return await runProcess(YT_DLP_BINARY, argv, {
      onLine,
      stallMs: isDownload ? DOWNLOAD_STALL_MS : undefined,
      timeoutMs: isDownload ? undefined : PROBE_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof ProcessStallError) {
      throw new FetchError(
        'The download stalled — YouTube may be throttling this video. Please try again.',
        'fetch_failed',
      );
    }
    if (error instanceof ProcessTimeoutError) {
      throw new FetchError(
        'Fetching took too long and was stopped. Please try again.',
        'fetch_failed',
      );
    }
    if (error instanceof ProcessExitError) {
      throw mapYtDlpError(error.stderr || error.message);
    }
    throw mapYtDlpError(error instanceof Error ? error.message : String(error));
  }
}

export class YtDlpFetcher implements VideoFetcher {
  private readonly cookieFlags: CookieFlags;
  private readonly format: string;

  constructor(options: FetcherOptions = {}) {
    this.cookieFlags = buildCookieFlags(options);
    this.format = buildFormat(
      options.maxHeight && options.maxHeight > 0 ? options.maxHeight : 1080,
    );
  }

  async probe(url: string): Promise<VideoProbe> {
    const { stdout } = await runYtDlp(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      skipDownload: true,
      noWarnings: true,
      ...RESILIENCE_FLAGS,
      ...this.cookieFlags,
    });
    let info: YtDlpInfo;
    try {
      info = JSON.parse(stdout) as YtDlpInfo;
    } catch {
      throw new FetchError(
        'yt-dlp returned unreadable video metadata.',
        'fetch_failed',
      );
    }
    return {
      videoId: info.id ?? 'unknown',
      title: info.title ?? 'Untitled video',
      durationSec: info.duration ?? 0,
      isLive: info.is_live === true,
      playableInEmbed: info.playable_in_embed !== false,
      ageLimit: info.age_limit ?? 0,
    };
  }

  async download(
    url: string,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    await mkdir(destDir, { recursive: true });
    const tracker = new DownloadProgressTracker();
    await runYtDlp(
      url,
      {
        noPlaylist: true,
        format: this.format,
        mergeOutputFormat: 'mp4',
        output: path.join(destDir, 'source.%(ext)s'),
        newline: true,
        progressTemplate: PROGRESS_TEMPLATE,
        noWarnings: true,
        ...RESILIENCE_FLAGS,
        ...this.cookieFlags,
        ...(ffmpegPath ? { ffmpegLocation: ffmpegPath } : {}),
      },
      (line) => {
        const percent = tracker.onLine(line);
        if (percent !== null) {
          onProgress(percent);
        }
      },
    );
    return { filePath: path.join(destDir, 'source.mp4') };
  }

  async downloadSection(
    url: string,
    startSec: number,
    endSec: number,
    cut: CutMode,
    destDir: string,
    onProgress: (percent: number) => void,
  ): Promise<FetchedVideo> {
    await mkdir(destDir, { recursive: true });
    const tracker = new DownloadProgressTracker();
    await runYtDlp(
      url,
      {
        noPlaylist: true,
        format: this.format,
        mergeOutputFormat: 'mp4',
        output: path.join(destDir, 'clip.%(ext)s'),
        newline: true,
        progressTemplate: PROGRESS_TEMPLATE,
        noWarnings: true,
        ...buildSectionArgs(startSec, endSec, cut),
        ...RESILIENCE_FLAGS,
        ...this.cookieFlags,
        ...(ffmpegPath ? { ffmpegLocation: ffmpegPath } : {}),
      },
      (line) => {
        const percent = tracker.onLine(line);
        if (percent !== null) {
          onProgress(percent);
        }
      },
    );
    return { filePath: path.join(destDir, 'clip.mp4') };
  }
}
