import { describe, expect, it } from 'vitest';
import {
  EXPENSIVE_THROTTLE,
  THROTTLER_OPTIONS,
  isThrottleExempt,
} from './throttler-config';

describe('THROTTLER_OPTIONS', () => {
  it('defines a global default bucket', () => {
    const names = THROTTLER_OPTIONS.map((option) => option.name);
    expect(names).toContain('default');
  });

  it('allows a workable burst but bounds sustained traffic', () => {
    const [{ limit, ttl }] = THROTTLER_OPTIONS;
    expect(limit).toBeGreaterThan(0);
    expect(ttl).toBeGreaterThan(0);
  });
});

describe('EXPENSIVE_THROTTLE', () => {
  // Fetching and re-encoding spawn yt-dlp/ffmpeg, so these must be far
  // stricter than the global bucket or a handful of callers can saturate
  // the box's CPU and disk.
  it('is much tighter than the global default', () => {
    const [globalBucket] = THROTTLER_OPTIONS;
    expect(EXPENSIVE_THROTTLE.limit).toBeLessThan(globalBucket.limit);
  });

  it('permits at least one request so the app stays usable', () => {
    expect(EXPENSIVE_THROTTLE.limit).toBeGreaterThan(0);
  });
});

describe('isThrottleExempt', () => {
  it.each([
    '/api/jobs/abc-123/events',
    '/api/videos/xyz/stream',
    '/api/clips/xyz/stream',
    '/api/clips/xyz/file',
  ])('exempts %s', (path) => {
    // Polling a job and streaming/downloading a result are cheap reads the UI
    // performs constantly; rate limiting them breaks progress and playback.
    expect(isThrottleExempt(path)).toBe(true);
  });

  it.each(['/api/resolve', '/api/clips', '/api/downloads', '/api/videos'])(
    'does not exempt %s',
    (path) => {
      expect(isThrottleExempt(path)).toBe(false);
    },
  );

  it('does not exempt a path merely containing an exempt word', () => {
    expect(isThrottleExempt('/api/streamers')).toBe(false);
  });
});
