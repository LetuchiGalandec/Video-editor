import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { JobsModule } from '../jobs/jobs.module';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { FakeFetcher } from './fake.fetcher';
import { VIDEO_FETCHER } from './video-fetcher';
import { YtDlpFetcher } from './yt-dlp.fetcher';

@Module({
  imports: [JobsModule],
  controllers: [DownloadsController],
  providers: [
    DownloadsService,
    {
      provide: VIDEO_FETCHER,
      useFactory: (config: AppConfig) =>
        config.fetcher === 'fake'
          ? new FakeFetcher(config.fixturePath)
          : new YtDlpFetcher({
              cookiesFromBrowser: config.ytCookiesFromBrowser,
              cookiesFile: config.ytCookiesFile,
              maxHeight: config.ytMaxHeight,
            }),
      inject: [APP_CONFIG],
    },
  ],
  exports: [DownloadsService],
})
export class FetchModule {}
