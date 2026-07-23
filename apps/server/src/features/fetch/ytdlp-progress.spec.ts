import { describe, it, expect } from 'vitest';
import { parseProgressLine, DownloadProgressTracker } from './ytdlp-progress';

describe('parseProgressLine', () => {
  it('parses the percent from a CROPCORN template line', () => {
    expect(
      parseProgressLine('CROPCORN|  1.2%|12345|9999999'),
    ).toBeCloseTo(1.2);
    expect(
      parseProgressLine('CROPCORN|100.0%|9999999|9999999'),
    ).toBeCloseTo(100);
    expect(parseProgressLine('CROPCORN|  0.0%|0|NA')).toBeCloseTo(0);
  });

  it('returns null for non-progress lines', () => {
    expect(
      parseProgressLine('[youtube] dQw4w9WgXcQ: Downloading webpage'),
    ).toBeNull();
    expect(
      parseProgressLine('[Merger] Merging formats into "source.mp4"'),
    ).toBeNull();
    expect(parseProgressLine('')).toBeNull();
    expect(parseProgressLine('CROPCORN|garbage|x|y')).toBeNull();
  });
});

describe('DownloadProgressTracker', () => {
  it('maps a single stream 0-100 to 0-90 overall', () => {
    const tracker = new DownloadProgressTracker();
    expect(tracker.onLine('CROPCORN|  0.0%|0|100')).toBeCloseTo(0);
    expect(tracker.onLine('CROPCORN| 50.0%|50|100')).toBeCloseTo(45);
    expect(tracker.onLine('CROPCORN|100.0%|100|100')).toBeCloseTo(90);
  });

  it('detects a second stream (percent reset) and maps it to 90-98', () => {
    const tracker = new DownloadProgressTracker();
    tracker.onLine('CROPCORN|100.0%|100|100');
    expect(tracker.onLine('CROPCORN|  0.0%|0|50')).toBeCloseTo(90);
    expect(tracker.onLine('CROPCORN| 50.0%|25|50')).toBeCloseTo(94);
    expect(tracker.onLine('CROPCORN|100.0%|50|50')).toBeCloseTo(98);
  });

  it('ignores non-progress lines and never goes backwards within a phase', () => {
    const tracker = new DownloadProgressTracker();
    tracker.onLine('CROPCORN| 60.0%|60|100');
    expect(tracker.onLine('[info] something')).toBeNull();
    expect(tracker.onLine('CROPCORN| 55.0%|55|100')).toBeCloseTo(54);
  });
});
