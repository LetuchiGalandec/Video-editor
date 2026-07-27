import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { DownloadsService } from './downloads.service';
import { Throttle } from '@nestjs/throttler';
import { EXPENSIVE_THROTTLE } from '../../throttler-config';

interface StartDownloadDto {
  url?: unknown;
}

@Controller('downloads')
@Throttle({ default: EXPENSIVE_THROTTLE })
export class DownloadsController {
  constructor(
    private readonly downloads: DownloadsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(202)
  start(@Body() body: StartDownloadDto): { jobId: string } {
    if (!this.config.youtubeEnabled) {
      throw new NotFoundException('YouTube fetching is disabled.');
    }
    const url = typeof body?.url === 'string' ? body.url : '';
    const job = this.downloads.startDownload(url);
    return { jobId: job.id };
  }
}
