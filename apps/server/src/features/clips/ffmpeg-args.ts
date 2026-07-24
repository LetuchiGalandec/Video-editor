export type ClipMode = 'accurate' | 'fast';

export interface ClipArgsInput {
  inputPath: string;
  outputPath: string;
  startSec: number;
  endSec: number;
  mode: ClipMode;
}

/**
 * Builds the ffmpeg argv for a trim.
 *
 * `-ss` goes BEFORE `-i` in both modes: that's a fast keyframe seek. In
 * accurate mode ffmpeg then decodes forward to the exact timestamp because we
 * re-encode, so the cut is frame-accurate AND fast. In fast mode (`-c copy`)
 * nothing is decoded, so the cut snaps to the keyframe at/before startSec.
 * We use `-t <duration>` instead of `-to` because input seeking resets
 * timestamps, which makes `-to` semantics version-dependent.
 */
export function buildClipArgs(input: ClipArgsInput): string[] {
  const duration = input.endSec - input.startSec;
  const codecArgs =
    input.mode === 'accurate'
      ? [
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '18',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
        ]
      : ['-c', 'copy', '-avoid_negative_ts', 'make_zero'];
  return [
    '-y',
    '-ss',
    String(input.startSec),
    '-i',
    input.inputPath,
    '-t',
    String(duration),
    ...codecArgs,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loglevel',
    'error',
    input.outputPath,
  ];
}

const OUT_TIME_CLOCK = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)$/;

/**
 * Parses one `-progress pipe:1` line into seconds of output produced, or null.
 * Note: ffmpeg's `out_time_ms` is actually MICROseconds (matching out_time_us).
 */
export function parseFfmpegProgress(line: string): number | null {
  const micros = /^out_time_(?:ms|us)=(\d+)$/.exec(line);
  if (micros) {
    return Number.parseInt(micros[1], 10) / 1_000_000;
  }
  const clock = OUT_TIME_CLOCK.exec(line);
  if (clock) {
    return (
      Number.parseInt(clock[1], 10) * 3600 +
      Number.parseInt(clock[2], 10) * 60 +
      Number.parseFloat(clock[3])
    );
  }
  return null;
}

export interface NormalizeArgsInput {
  inputPath: string;
  outputPath: string;
  transcode: boolean;
}

/**
 * ffmpeg argv to normalize an uploaded file into a browser-playable mp4.
 * transcode=false → stream copy (near-instant); true → re-encode to h264/aac.
 * Both write +faststart so the moov atom is at the front for seekable streaming.
 */
export function buildNormalizeArgs(input: NormalizeArgsInput): string[] {
  const codecArgs = input.transcode
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k']
    : ['-c', 'copy'];
  return [
    '-y',
    '-i',
    input.inputPath,
    ...codecArgs,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loglevel',
    'error',
    input.outputPath,
  ];
}
