import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClipsService } from './clips.service';
import type { ClipMeta, CreateClipInput } from './clips.service';
import type { ClipMode } from './ffmpeg-args';
import { Throttle } from '@nestjs/throttler';
import { EXPENSIVE_THROTTLE } from '../../throttler-config';

interface CreateClipDto {
  source?: unknown;
  videoId?: unknown;
  youtubeId?: unknown;
  title?: unknown;
  startSec?: unknown;
  endSec?: unknown;
  mode?: unknown;
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

@Controller('clips')
@Throttle({ default: EXPENSIVE_THROTTLE })
export class ClipsController {
  constructor(private readonly clips: ClipsService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: CreateClipDto): Promise<{ jobId: string }> {
    const common = {
      startSec: Number(body?.startSec),
      endSec: Number(body?.endSec),
      mode: body?.mode as ClipMode,
    };
    const input: CreateClipInput =
      body?.source === 'youtube'
        ? {
            source: 'youtube',
            youtubeId: asString(body?.youtubeId),
            title: asString(body?.title),
            ...common,
          }
        : { source: 'downloaded', videoId: asString(body?.videoId), ...common };
    const job = await this.clips.createClip(input);
    return { jobId: job.id };
  }

  @Get(':clipId/meta')
  meta(@Param('clipId') clipId: string): Promise<ClipMeta> {
    return this.clips.meta(clipId);
  }

  @Get(':clipId/stream')
  async stream(
    @Param('clipId') clipId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.clips.clipPathOrThrow(clipId);
    res.sendFile(filePath, {
      headers: { 'Content-Type': 'video/mp4' },
      acceptRanges: true,
      dotfiles: 'allow',
    });
  }

  @Get(':clipId/file')
  async file(
    @Param('clipId') clipId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.clips.clipPathOrThrow(clipId);
    res.sendFile(filePath, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="cropcorn-clip.mp4"',
      },
      acceptRanges: true,
      dotfiles: 'allow',
    });
  }
}
