export type CutMode = 'accurate' | 'fast';

export interface SectionArgs {
  downloadSections: string;
  forceKeyframesAtCuts?: true;
}

/**
 * yt-dlp flags to download only a time range. The `*` prefix marks a time range
 * (vs a chapter name). Accurate mode adds --force-keyframes-at-cuts, which
 * re-encodes around the boundaries so the clip starts/ends on the exact frame
 * (slower); fast mode cuts at the nearest keyframe.
 */
export function buildSectionArgs(startSec: number, endSec: number, cut: CutMode): SectionArgs {
  const args: SectionArgs = { downloadSections: `*${startSec}-${endSec}` };
  if (cut === 'accurate') {
    args.forceKeyframesAtCuts = true;
  }
  return args;
}
