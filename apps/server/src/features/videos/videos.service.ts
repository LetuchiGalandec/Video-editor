import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { ProbeService } from './probe.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VideoMeta {
  videoId: string;
  title: string;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

interface InfoFile {
  title?: string;
  durationSec?: number;
  sourceUrl?: string;
}

/** Throws 400 unless the id is one of our server-generated UUIDs — the only
 * values ever used to build filesystem paths. */
export function assertJobId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException('Invalid id');
  }
}

@Injectable()
export class VideosService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly probe: ProbeService,
  ) {}

  sourcePath(videoId: string): string {
    assertJobId(videoId);
    return path.join(this.config.dataDir, 'videos', videoId, 'source.mp4');
  }

  async sourcePathOrThrow(videoId: string): Promise<string> {
    const filePath = this.sourcePath(videoId);
    try {
      await stat(filePath);
    } catch {
      throw new NotFoundException('Video not found');
    }
    return filePath;
  }

  async meta(videoId: string): Promise<VideoMeta> {
    const filePath = await this.sourcePathOrThrow(videoId);
    const [fileStat, media, info] = await Promise.all([
      stat(filePath),
      this.probe.probe(filePath),
      this.readInfo(videoId),
    ]);
    return {
      videoId,
      title: info.title ?? 'Untitled video',
      durationSec: media.durationSec,
      width: media.width,
      height: media.height,
      sizeBytes: fileStat.size,
    };
  }

  private async readInfo(videoId: string): Promise<InfoFile> {
    try {
      const raw = await readFile(
        path.join(this.config.dataDir, 'videos', videoId, 'info.json'),
        'utf-8',
      );
      return JSON.parse(raw) as InfoFile;
    } catch {
      return {};
    }
  }
}
