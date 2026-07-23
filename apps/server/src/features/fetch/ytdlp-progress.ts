// yt-dlp consumes the leading `download:` of the template as a progress-type
// SELECTOR and does not print it, so the emitted line starts with `CROPCORN|`.
const PROGRESS_LINE = /^CROPCORN\|\s*([\d.]+)%\|/;

/** The `--progress-template` value that produces lines parseProgressLine understands. */
export const PROGRESS_TEMPLATE =
  'download:CROPCORN|%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s';

export function parseProgressLine(line: string): number | null {
  const match = PROGRESS_LINE.exec(line);
  if (!match) {
    return null;
  }
  const percent = Number.parseFloat(match[1]);
  return Number.isFinite(percent) ? percent : null;
}

const PHASE_RESET_DROP = 50;
const VIDEO_PHASE_SPAN = 90;
const AUDIO_PHASE_START = 90;
const AUDIO_PHASE_SPAN = 8;

/**
 * Maps yt-dlp's per-stream progress (video then audio, each 0-100) onto a
 * single overall percentage: first stream 0-90, second stream 90-98. The final
 * merge step is accounted for by the job completing at 100.
 */
export class DownloadProgressTracker {
  private phase = 0;
  private lastPercent = 0;
  private highWaterMark = 0;

  onLine(line: string): number | null {
    const percent = parseProgressLine(line);
    if (percent === null) {
      return null;
    }
    if (percent < this.lastPercent - PHASE_RESET_DROP) {
      this.phase = Math.min(this.phase + 1, 1);
    }
    this.lastPercent = percent;
    const mapped =
      this.phase === 0
        ? (percent / 100) * VIDEO_PHASE_SPAN
        : AUDIO_PHASE_START + (percent / 100) * AUDIO_PHASE_SPAN;
    this.highWaterMark = Math.max(this.highWaterMark, mapped);
    return this.highWaterMark;
  }
}
