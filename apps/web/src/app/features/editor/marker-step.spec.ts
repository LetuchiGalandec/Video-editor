import { describe, it, expect } from 'vitest';
import { markerKeyStep, snapToTenth } from './marker-step';

describe('markerKeyStep', () => {
  it('nudges a tenth of a second with plain arrows', () => {
    expect(markerKeyStep('ArrowUp', false)).toBeCloseTo(0.1);
    expect(markerKeyStep('ArrowDown', false)).toBeCloseTo(-0.1);
  });

  it('nudges a whole second with shift', () => {
    expect(markerKeyStep('ArrowUp', true)).toBe(1);
    expect(markerKeyStep('ArrowDown', true)).toBe(-1);
  });

  it('jumps ten seconds on the page keys', () => {
    expect(markerKeyStep('PageUp', false)).toBe(10);
    expect(markerKeyStep('PageDown', false)).toBe(-10);
  });

  it('leaves other keys to the field', () => {
    // Left/Right must still move the caret through the timestamp.
    expect(markerKeyStep('ArrowLeft', false)).toBeNull();
    expect(markerKeyStep('ArrowRight', false)).toBeNull();
    expect(markerKeyStep('Enter', false)).toBeNull();
    expect(markerKeyStep('5', false)).toBeNull();
  });
});

describe('snapToTenth', () => {
  it('rounds to the precision the field displays', () => {
    expect(snapToTenth(12.33)).toBeCloseTo(12.3);
    expect(snapToTenth(12.37)).toBeCloseTo(12.4);
  });

  it('absorbs floating-point drift from repeated stepping', () => {
    // 0.1 + 0.2 === 0.30000000000000004 without this.
    expect(snapToTenth(0.1 + 0.2)).toBe(0.3);
  });
});
