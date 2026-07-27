import type { ThrottlerOptions } from '@nestjs/throttler';

const ONE_MINUTE_MS = 60_000;

/**
 * Global bucket. Generous enough that normal use never trips it — a single
 * trim session issues a burst of reads — but low enough that one caller
 * cannot hammer the box indefinitely.
 */
export const THROTTLER_OPTIONS: ThrottlerOptions[] = [
  { name: 'default', ttl: ONE_MINUTE_MS, limit: 120 },
];

/**
 * For endpoints that spawn yt-dlp or ffmpeg. Each such request can occupy a
 * CPU core for minutes and write hundreds of MB, so the cap is per-minute and
 * deliberately small; the global bucket alone would still allow a trivial
 * denial of service.
 */
export const EXPENSIVE_THROTTLE = { ttl: ONE_MINUTE_MS, limit: 10 };

// Progress polling, SSE, and media streaming are cheap reads the UI performs
// continuously — throttling them would stall progress bars and break seeking
// in the player, without protecting anything meaningful.
const EXEMPT_PATTERNS: RegExp[] = [
  /^\/api\/jobs\/[^/]+\/events\/?$/,
  /^\/api\/jobs\/[^/]+\/?$/,
  /^\/api\/videos\/[^/]+\/(stream|meta)\/?$/,
  /^\/api\/clips\/[^/]+\/(stream|file|meta)\/?$/,
  /^\/api\/health\/?$/,
  /^\/api\/config\/?$/,
];

/** True when the path is a cheap read that must not be rate limited. */
export function isThrottleExempt(path: string): boolean {
  const [pathname] = path.split('?');
  return EXEMPT_PATTERNS.some((pattern) => pattern.test(pathname));
}
