import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);

export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  container: string;
}

interface FfprobeOutput {
  format?: { duration?: string; format_name?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}

@Injectable()
export class ProbeService {
  private readonly ffprobePath = process.env.FFPROBE_PATH ?? ffprobeStatic.path;

  async probe(filePath: string): Promise<MediaProbe> {
    const { stdout } = await execFileAsync(this.ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name,width,height',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
    return {
      durationSec: Number.parseFloat(parsed.format?.duration ?? '0') || 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      videoCodec: video?.codec_name ?? '',
      audioCodec: audio?.codec_name ?? '',
      container: parsed.format?.format_name ?? '',
    };
  }
}
