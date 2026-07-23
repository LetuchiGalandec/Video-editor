import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VideosService } from './videos.service';
import type { VideoMeta } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get(':videoId/meta')
  meta(@Param('videoId') videoId: string): Promise<VideoMeta> {
    return this.videos.meta(videoId);
  }

  @Get(':videoId/stream')
  async stream(
    @Param('videoId') videoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.videos.sourcePathOrThrow(videoId);
    // res.sendFile implements Range/206, If-Range and Accept-Ranges for us.
    // dotfiles: 'allow' because the data dir is named `.data`, which the
    // default 'ignore' policy would 404.
    res.sendFile(filePath, {
      headers: { 'Content-Type': 'video/mp4' },
      acceptRanges: true,
      dotfiles: 'allow',
    });
  }
}
