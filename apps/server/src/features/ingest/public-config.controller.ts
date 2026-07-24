import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';

export interface PublicConfigDto {
  youtubeEnabled: boolean;
  maxUploadBytes: number;
  maxUploadDurationSec: number;
}

@Controller('config')
export class PublicConfigController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  get(): PublicConfigDto {
    return {
      youtubeEnabled: this.config.youtubeEnabled,
      maxUploadBytes: this.config.maxUploadBytes,
      maxUploadDurationSec: this.config.maxUploadDurationSec,
    };
  }
}
