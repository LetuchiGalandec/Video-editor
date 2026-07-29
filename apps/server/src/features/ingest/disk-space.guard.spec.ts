import { describe, expect, it } from 'vitest';
import { hasRoomFor, DISK_HEADROOM_BYTES } from './disk-space.guard';

const GIB = 1024 ** 3;

describe('hasRoomFor', () => {
  it('allows an upload when free space comfortably exceeds it', () => {
    expect(hasRoomFor({ freeBytes: 50 * GIB, incomingBytes: 1 * GIB })).toBe(
      true,
    );
  });

  it('rejects an upload larger than the free space', () => {
    expect(hasRoomFor({ freeBytes: 1 * GIB, incomingBytes: 5 * GIB })).toBe(
      false,
    );
  });

  it('reserves headroom rather than filling the disk exactly', () => {
    // Trimming writes a re-encoded copy alongside the source, and a full disk
    // takes the whole server down, so the guard must refuse the last bytes.
    const freeBytes = 4 * GIB;
    expect(hasRoomFor({ freeBytes, incomingBytes: freeBytes })).toBe(false);
  });

  it('accounts for the working copy the trim produces', () => {
    // An upload needs room for itself plus roughly another copy while ffmpeg
    // writes the output, on top of the reserved headroom.
    const incomingBytes = 1 * GIB;
    const justEnough = incomingBytes * 2 + DISK_HEADROOM_BYTES;
    expect(hasRoomFor({ freeBytes: justEnough + 1, incomingBytes })).toBe(true);
    expect(hasRoomFor({ freeBytes: justEnough - 1, incomingBytes })).toBe(
      false,
    );
  });

  it('rejects when free space cannot be determined', () => {
    // Failing closed is correct: guessing wrong fills the disk.
    expect(hasRoomFor({ freeBytes: null, incomingBytes: 1 * GIB })).toBe(false);
  });

  it('treats an unknown upload size as needing headroom only', () => {
    expect(hasRoomFor({ freeBytes: 50 * GIB, incomingBytes: null })).toBe(true);
    expect(
      hasRoomFor({ freeBytes: DISK_HEADROOM_BYTES - 1, incomingBytes: null }),
    ).toBe(false);
  });
});
