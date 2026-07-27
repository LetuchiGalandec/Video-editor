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
import type { ResolveResult } from './downloads.service';
import { Throttle } from '@nestjs/throttler';
import { EXPENSIVE_THROTTLE } from '../../throttler-config';

interface ResolveDto {
  url?: unknown;
}

@Controller('resolve')
@Throttle({ default: EXPENSIVE_THROTTLE })
export class ResolveController {
  constructor(
    private readonly downloads: DownloadsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(200)
  async resolve(@Body() body: ResolveDto): Promise<ResolveResult> {
    if (!this.config.youtubeEnabled) {
      throw new NotFoundException('YouTube fetching is disabled.');
    }
    const url = typeof body?.url === 'string' ? body.url : '';
    return this.downloads.resolve(url);
  }
}
