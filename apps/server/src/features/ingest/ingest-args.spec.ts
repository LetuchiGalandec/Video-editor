import { describe, it, expect } from 'vitest';
import { isBrowserPlayable } from './ingest-args';

describe('isBrowserPlayable', () => {
  it('accepts h264 + aac in an mp4-family container', () => {
    expect(
      isBrowserPlayable({
        container: 'mov,mp4,m4a,3gp',
        videoCodec: 'h264',
        audioCodec: 'aac',
      }),
    ).toBe(true);
  });

  it('accepts h264 with no audio', () => {
    expect(
      isBrowserPlayable({
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: '',
      }),
    ).toBe(true);
  });

  it('rejects HEVC (iPhone default)', () => {
    expect(
      isBrowserPlayable({
        container: 'mov,mp4,m4a',
        videoCodec: 'hevc',
        audioCodec: 'aac',
      }),
    ).toBe(false);
  });

  it('rejects VP9 in webm', () => {
    expect(
      isBrowserPlayable({
        container: 'matroska,webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
      }),
    ).toBe(false);
  });

  it('rejects h264 with a non-aac audio codec', () => {
    expect(
      isBrowserPlayable({
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'mp3',
      }),
    ).toBe(false);
  });
});
