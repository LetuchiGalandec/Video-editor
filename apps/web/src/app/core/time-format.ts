/**
 * Formats seconds as `m:ss.t` (or `h:mm:ss.t` past an hour), tenths precision —
 * the display format used across the editor and marker inputs.
 */
export function secondsToTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  // Round to tenths first so 59.96 renders as 0:59.9, not 0:60.0.
  const tenths = Math.floor(safe * 10) / 10;
  const hours = Math.floor(tenths / 3600);
  const minutes = Math.floor((tenths % 3600) / 60);
  const seconds = tenths % 60;
  const secondsPart = seconds.toFixed(1).padStart(4, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secondsPart}`;
  }
  return `${minutes}:${secondsPart}`;
}

const TIMESTAMP_PATTERN = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/;

/** Parses `sss`, `m:ss(.t)` or `h:mm:ss(.t)` back to seconds; null when invalid. */
export function timestampToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  const match = TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, first, second, last] = match;
  const seconds = Number.parseFloat(last);
  if (!Number.isFinite(seconds)) {
    return null;
  }
  if (first !== undefined && second !== undefined) {
    const hours = Number.parseInt(first, 10);
    const minutes = Number.parseInt(second, 10);
    if (minutes >= 60 || seconds >= 60) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (first !== undefined) {
    const minutes = Number.parseInt(first, 10);
    if (seconds >= 60) {
      return null;
    }
    return minutes * 60 + seconds;
  }
  return seconds;
}
