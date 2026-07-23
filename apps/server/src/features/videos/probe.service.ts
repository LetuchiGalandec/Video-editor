import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);

export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
}

@Injectable()
export class ProbeService {
  private readonly ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path;

  async probe(filePath: string): Promise<MediaProbe> {
    const { stdout } = await execFileAsync(this.ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    return {
      durationSec: Number.parseFloat(parsed.format?.duration ?? '0') || 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
    };
  }
}
