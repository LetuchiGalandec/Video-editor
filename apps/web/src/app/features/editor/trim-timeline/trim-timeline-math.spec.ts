import { describe, it, expect } from 'vitest';
import { clientXToSeconds, clampMarker, keyboardStep, MIN_MARKER_GAP_SEC } from './trim-timeline-math';

const rect = { left: 100, width: 400 };

describe('clientXToSeconds', () => {
  it('maps pixels linearly onto the duration', () => {
    expect(clientXToSeconds(100, rect, 100)).toBe(0);
    expect(clientXToSeconds(300, rect, 100)).toBe(50);
    expect(clientXToSeconds(500, rect, 100)).toBe(100);
  });

  it('clamps outside the track', () => {
    expect(clientXToSeconds(0, rect, 100)).toBe(0);
    expect(clientXToSeconds(900, rect, 100)).toBe(100);
  });

  it('is safe for degenerate rects and durations', () => {
    expect(clientXToSeconds(300, { left: 0, width: 0 }, 100)).toBe(0);
    expect(clientXToSeconds(300, rect, 0)).toBe(0);
  });
});

describe('clampMarker', () => {
  it('keeps the in-marker between 0 and markOut minus the gap', () => {
    expect(clampMarker('in', -5, { markIn: 0, markOut: 10, duration: 20 })).toBe(0);
    expect(clampMarker('in', 4, { markIn: 0, markOut: 10, duration: 20 })).toBe(4);
    expect(clampMarker('in', 9.99, { markIn: 0, markOut: 10, duration: 20 })).toBe(
      10 - MIN_MARKER_GAP_SEC,
    );
  });

  it('keeps the out-marker between markIn plus the gap and duration', () => {
    expect(clampMarker('out', 25, { markIn: 5, markOut: 10, duration: 20 })).toBe(20);
    expect(clampMarker('out', 12, { markIn: 5, markOut: 10, duration: 20 })).toBe(12);
    expect(clampMarker('out', 5.01, { markIn: 5, markOut: 10, duration: 20 })).toBe(
      5 + MIN_MARKER_GAP_SEC,
    );
  });
});

describe('keyboardStep', () => {
  it('steps a tenth of a second with plain arrows', () => {
    expect(keyboardStep('ArrowRight', false)).toBeCloseTo(0.1);
    expect(keyboardStep('ArrowLeft', false)).toBeCloseTo(-0.1);
  });

  it('steps a whole second with shift', () => {
    expect(keyboardStep('ArrowRight', true)).toBe(1);
    expect(keyboardStep('ArrowLeft', true)).toBe(-1);
  });

  it('ignores other keys', () => {
    expect(keyboardStep('Enter', false)).toBeNull();
    expect(keyboardStep('a', true)).toBeNull();
  });
});
