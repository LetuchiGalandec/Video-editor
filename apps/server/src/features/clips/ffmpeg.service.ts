import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import { buildClipArgs, buildNormalizeArgs, parseFfmpegProgress } from './ffmpeg-args';
import type { ClipArgsInput, NormalizeArgsInput } from './ffmpeg-args';
import * as readline from 'node:readline';

const STDERR_TAIL_CHARS = 400;

@Injectable()
export class FfmpegService {
  private readonly binary = process.env.FFMPEG_PATH ?? ffmpegPath ?? 'ffmpeg';

  /** Runs the trim, reporting progress as a 0-100 percent of the clip duration. */
  cut(
    input: ClipArgsInput,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const clipDuration = input.endSec - input.startSec;
    const args = buildClipArgs(input);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        const seconds = parseFfmpegProgress(line);
        if (seconds !== null && clipDuration > 0) {
          onProgress(Math.min(99, (seconds / clipDuration) * 100));
        }
      });
      child.on('error', (error) =>
        reject(new Error(`ffmpeg failed to start: ${error.message}`)),
      );
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg exited with ${code}: ${stderr.slice(-STDERR_TAIL_CHARS)}`,
            ),
          );
        }
      });
    });
  }

  /** Normalize an uploaded file to a browser-playable mp4, reporting 0-99%. */
  normalize(
    input: NormalizeArgsInput,
    durationSec: number,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const args = buildNormalizeArgs(input);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        const seconds = parseFfmpegProgress(line);
        if (seconds !== null && durationSec > 0) {
          onProgress(Math.min(99, (seconds / durationSec) * 100));
        }
      });
      child.on('error', (error) =>
        reject(new Error(`ffmpeg failed to start: ${error.message}`)),
      );
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg exited with ${code}: ${stderr.slice(-STDERR_TAIL_CHARS)}`,
            ),
          );
        }
      });
    });
  }
}
