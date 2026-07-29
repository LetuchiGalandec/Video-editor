/** A tenth is the finest increment the timestamp fields render. */
const TENTH_SEC = 0.1;
const ONE_SEC = 1;
const PAGE_SEC = 10;

/**
 * Vertical nudge for a timestamp field: ±0.1s, ±1s with Shift, ±10s on the page
 * keys. Returns null for anything the field should keep — notably the
 * horizontal arrows, which still move the caret through the timestamp.
 */
export function markerKeyStep(key: string, shiftKey: boolean): number | null {
  if (key === 'PageUp') {
    return PAGE_SEC;
  }
  if (key === 'PageDown') {
    return -PAGE_SEC;
  }
  const direction = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
  if (direction === 0) {
    return null;
  }
  return direction * (shiftKey ? ONE_SEC : TENTH_SEC);
}

/**
 * Snaps to the tenth-of-a-second grid the field displays. Without it, holding
 * an arrow accumulates float error (0.1 + 0.2 === 0.30000000000000004) and the
 * marker drifts off the value the user can see.
 */
export function snapToTenth(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}
