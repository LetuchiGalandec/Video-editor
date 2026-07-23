import { describe, it, expect } from 'vitest';
import { secondsToTimestamp, timestampToSeconds } from './time-format';

describe('secondsToTimestamp', () => {
  it('formats sub-minute times with tenths', () => {
    expect(secondsToTimestamp(0)).toBe('0:00.0');
    expect(secondsToTimestamp(7.25)).toBe('0:07.2');
    expect(secondsToTimestamp(59.96)).toBe('0:59.9');
  });

  it('formats minutes and hours', () => {
    expect(secondsToTimestamp(83.45)).toBe('1:23.4');
    expect(secondsToTimestamp(600)).toBe('10:00.0');
    expect(secondsToTimestamp(3723.5)).toBe('1:02:03.5');
  });

  it('clamps negatives to zero', () => {
    expect(secondsToTimestamp(-3)).toBe('0:00.0');
  });
});

describe('timestampToSeconds', () => {
  it('parses m:ss and m:ss.t', () => {
    expect(timestampToSeconds('1:23.4')).toBeCloseTo(83.4);
    expect(timestampToSeconds('0:07')).toBeCloseTo(7);
    expect(timestampToSeconds('10:00.0')).toBeCloseTo(600);
  });

  it('parses h:mm:ss.t', () => {
    expect(timestampToSeconds('1:02:03.5')).toBeCloseTo(3723.5);
  });

  it('parses bare seconds', () => {
    expect(timestampToSeconds('42')).toBeCloseTo(42);
    expect(timestampToSeconds('42.7')).toBeCloseTo(42.7);
  });

  it('round-trips with secondsToTimestamp', () => {
    for (const value of [0, 7.2, 83.4, 600, 3723.5]) {
      expect(timestampToSeconds(secondsToTimestamp(value))).toBeCloseTo(value, 1);
    }
  });

  it('rejects garbage', () => {
    expect(timestampToSeconds('')).toBeNull();
    expect(timestampToSeconds('abc')).toBeNull();
    expect(timestampToSeconds('1:99')).toBeNull();
    expect(timestampToSeconds('-1:10')).toBeNull();
    expect(timestampToSeconds('1:2:3:4')).toBeNull();
  });
});
