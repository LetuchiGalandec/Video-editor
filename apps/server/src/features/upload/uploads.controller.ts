import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../auth/session.service';
import { UploadsService } from './uploads.service';

interface CreateUploadDto {
  clipId?: unknown;
  title?: unknown;
  description?: unknown;
  playlistId?: unknown;
  newPlaylistTitle?: unknown;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly session: SessionService,
  ) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: CreateUploadDto, @Req() req: Request): Promise<{ jobId: string }> {
    const sessionId = this.session.peek(req);
    if (!sessionId) {
      throw new UnauthorizedException('Connect your Google account first.');
    }
    const job = await this.uploads.startUpload(sessionId, {
      clipId: asString(body?.clipId),
      title: asString(body?.title),
      description: asString(body?.description),
      playlistId: asString(body?.playlistId),
      newPlaylistTitle: asString(body?.newPlaylistTitle),
    });
    return { jobId: job.id };
  }
}
