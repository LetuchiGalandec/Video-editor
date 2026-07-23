import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';
import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { DownloadProgressTracker, PROGRESS_TEMPLATE } from './ytdlp-progress';
import { FetchError } from './video-fetcher';
import type { FetchedVideo, VideoFetcher, VideoProbe } from './video-fetcher';

/** Prefers h264+aac ≤1080p so the merged mp4 plays in every native <video> element. */
const FORMAT_1080P =
  'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b';

// youtube-dl-exec exposes `args` and `constants` at runtime but omits them
// from its type declarations.
interface YtDlpModuleExtras {
  args: (flags: Record<string, unknown>) => string[];
  constants: { YOUTUBE_DL_PATH: string };
}
const ytdlpModule = youtubedl as unknown as YtDlpModuleExtras;

const YT_DLP_BINARY = process.env.YTDLP_PATH ?? ytdlpModule.constants.YOUTUBE_DL_PATH;

interface YtDlpInfo {
  id?: string;
  title?: string;
  duration?: number;
  is_live?: boolean;
}

const STDERR_PATTERNS: Array<[RegExp, () => FetchError]> = [
  [/private video/i, () => new FetchError('This video is private, so it cannot be fetched.', 'private')],
  [
    /sign in to confirm your age|age.restricted/i,
    () => new FetchError('This video is age-restricted, so it cannot be fetched.', 'age_restricted'),
  ],
  [
    /video unavailable|no longer available|has been removed/i,
    () => new FetchError('This video is unavailable on YouTube.', 'unavailable'),
  ],
  [
    /premium members|members-only|join this channel|drm/i,
    () => new FetchError('This video is members-only or DRM-protected, so it cannot be fetched.', 'drm'),
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

interface RunResult {
  stdout: string;
}

/**
 * Spawns yt-dlp directly with node:child_process instead of youtube-dl-exec's
 * runner, which mis-splits binary paths containing spaces on macOS/Linux.
 * youtube-dl-exec still supplies the pinned binary and the flag serializer.
 */
function runYtDlp(url: string, flags: Record<string, unknown>, onLine?: (line: string) => void): Promise<RunResult> {
  const argv = [url, ...ytdlpModule.args(flags)];
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP_BINARY, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    if (onLine) {
      readline.createInterface({ input: child.stdout }).on('line', onLine);
    } else {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }
    child.on('error', (error) => reject(mapYtDlpError(error.message)));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout });
      } else {
        reject(mapYtDlpError(stderr));
      }
    });
  });
}

export class YtDlpFetcher implements VideoFetcher {
  async probe(url: string): Promise<VideoProbe> {
    const { stdout } = await runYtDlp(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      skipDownload: true,
      noWarnings: true,
    });
    let info: YtDlpInfo;
    try {
      info = JSON.parse(stdout) as YtDlpInfo;
    } catch {
      throw new FetchError('yt-dlp returned unreadable video metadata.', 'fetch_failed');
    }
    return {
      videoId: info.id ?? 'unknown',
      title: info.title ?? 'Untitled video',
      durationSec: info.duration ?? 0,
      isLive: info.is_live === true,
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
        format: FORMAT_1080P,
        mergeOutputFormat: 'mp4',
        output: path.join(destDir, 'source.%(ext)s'),
        newline: true,
        progressTemplate: PROGRESS_TEMPLATE,
        noWarnings: true,
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
}
