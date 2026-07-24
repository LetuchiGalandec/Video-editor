import { describe, it, expect } from 'vitest';
import { buildSectionArgs } from './section-args';

describe('buildSectionArgs', () => {
  it('builds a time-range download-sections value', () => {
    expect(buildSectionArgs(2.5, 8, 'fast')).toEqual({
      downloadSections: '*2.5-8',
    });
  });

  it('forces keyframes at cuts only for accurate mode', () => {
    expect(buildSectionArgs(10, 12.75, 'accurate')).toEqual({
      downloadSections: '*10-12.75',
      forceKeyframesAtCuts: true,
    });
    expect(buildSectionArgs(10, 12.75, 'fast')).not.toHaveProperty(
      'forceKeyframesAtCuts',
    );
  });

  it('always uses the "*" time-range prefix (not a chapter name)', () => {
    expect(buildSectionArgs(0, 5, 'fast').downloadSections).toMatch(/^\*/);
  });
});
