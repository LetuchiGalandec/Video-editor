/** Smallest allowed selection, mirrored by the server's clip validation. */
export const MIN_MARKER_GAP_SEC = 0.2;

export type MarkerKind = 'in' | 'out';

export interface TrackRect {
  left: number;
  width: number;
}

export interface MarkerContext {
  markIn: number;
  markOut: number;
  duration: number;
}

/** Projects a pointer position onto the track and returns the time it points at. */
export function clientXToSeconds(clientX: number, rect: TrackRect, duration: number): number {
  if (rect.width <= 0 || duration <= 0) {
    return 0;
  }
  const ratio = (clientX - rect.left) / rect.width;
  return Math.min(duration, Math.max(0, ratio * duration));
}

/** Clamps a proposed marker time so markers stay ordered and inside the video. */
export function clampMarker(kind: MarkerKind, seconds: number, ctx: MarkerContext): number {
  if (kind === 'in') {
    return Math.max(0, Math.min(seconds, ctx.markOut - MIN_MARKER_GAP_SEC));
  }
  return Math.min(ctx.duration, Math.max(seconds, ctx.markIn + MIN_MARKER_GAP_SEC));
}

/**
 * Holds the playhead inside the selection. The preview only ever shows frames
 * the exported clip will contain, so parking it in the dimmed region either
 * side would preview footage that gets cut.
 */
export function clampPlayhead(seconds: number, markIn: number, markOut: number): number {
  return Math.min(markOut, Math.max(markIn, seconds));
}

/** Arrow-key nudge size: ±0.1s, ±1s with Shift; null for unrelated keys. */
export function keyboardStep(key: string, shiftKey: boolean): number | null {
  const direction = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (direction === 0) {
    return null;
  }
  return direction * (shiftKey ? 1 : 0.1);
}
