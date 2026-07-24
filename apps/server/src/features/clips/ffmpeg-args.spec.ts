import { describe, it, expect } from 'vitest';
import {
  buildClipArgs,
  parseFfmpegProgress,
  buildNormalizeArgs,
} from './ffmpeg-args';

const base = {
  inputPath: '/data/videos/abc/source.mp4',
  outputPath: '/data/clips/def/clip.mp4',
  startSec: 2.5,
  endSec: 8,
};

describe('buildClipArgs', () => {
  it('builds a frame-accurate re-encode command', () => {
    const args = buildClipArgs({ ...base, mode: 'accurate' });
    expect(args).toEqual([
      '-y',
      '-ss',
      '2.5',
      '-i',
      '/data/videos/abc/source.mp4',
      '-t',
      '5.5',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      '-loglevel',
      'error',
      '/data/clips/def/clip.mp4',
    ]);
  });

  it('builds a stream-copy fast cut command', () => {
    const args = buildClipArgs({ ...base, mode: 'fast' });
    expect(args).toContain('copy');
    expect(args).toContain('-avoid_negative_ts');
    expect(args).not.toContain('libx264');
  });

  it('always seeks before the input (fast input seeking)', () => {
    for (const mode of ['accurate', 'fast'] as const) {
      const args = buildClipArgs({ ...base, mode });
      expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    }
  });

  it('encodes the selection as an explicit duration', () => {
    const args = buildClipArgs({
      ...base,
      mode: 'accurate',
      startSec: 10,
      endSec: 12.75,
    });
    const tIndex = args.indexOf('-t');
    expect(args[tIndex + 1]).toBe('2.75');
    expect(args).not.toContain('-to');
  });
});

describe('parseFfmpegProgress', () => {
  it('reads out_time_ms (microseconds despite the name)', () => {
    expect(parseFfmpegProgress('out_time_ms=5500000')).toBeCloseTo(5.5);
  });

  it('reads out_time_us', () => {
    expect(parseFfmpegProgress('out_time_us=1250000')).toBeCloseTo(1.25);
  });

  it('reads the hh:mm:ss form of out_time', () => {
    expect(parseFfmpegProgress('out_time=00:00:05.500000')).toBeCloseTo(5.5);
  });

  it('ignores unrelated lines', () => {
    expect(parseFfmpegProgress('frame=132')).toBeNull();
    expect(parseFfmpegProgress('progress=end')).toBeNull();
    expect(parseFfmpegProgress('out_time_ms=N/A')).toBeNull();
  });
});

describe('buildNormalizeArgs', () => {
  it('remuxes with stream copy when transcode is false', () => {
    const args = buildNormalizeArgs({
      inputPath: 'in.mkv',
      outputPath: 'out.mp4',
      transcode: false,
    });
    expect(args).toEqual([
      '-y',
      '-i',
      'in.mkv',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      '-loglevel',
      'error',
      'out.mp4',
    ]);
  });

  it('re-encodes to h264/aac when transcode is true', () => {
    const args = buildNormalizeArgs({
      inputPath: 'in.mov',
      outputPath: 'out.mp4',
      transcode: true,
    });
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args.slice(0, 3)).toEqual(['-y', '-i', 'in.mov']);
    expect(args).toContain('+faststart');
    expect(args).toContain('pipe:1');
    expect(args[args.length - 1]).toBe('out.mp4');
  });
});
