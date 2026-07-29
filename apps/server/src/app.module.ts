import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { THROTTLER_OPTIONS, isThrottleExempt } from './throttler-config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './features/auth/auth.module';
import { ClipsModule } from './features/clips/clips.module';
import { FetchModule } from './features/fetch/fetch.module';
import { IngestModule } from './features/ingest/ingest.module';
import { JobsModule } from './features/jobs/jobs.module';
import { UploadModule } from './features/upload/upload.module';
import { VideosModule } from './features/videos/videos.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: THROTTLER_OPTIONS,
      // Progress polling, SSE and media streaming are cheap reads the UI runs
      // continuously; throttling them stalls progress bars and breaks seeking.
      skipIf: (context) =>
        isThrottleExempt(
          context
            .switchToHttp()
            .getRequest<{ originalUrl?: string; url: string }>().originalUrl ??
            context.switchToHttp().getRequest<{ url: string }>().url,
        ),
    }),
    ConfigModule,
    JobsModule,
    FetchModule,
    VideosModule,
    ClipsModule,
    AuthModule,
    UploadModule,
    IngestModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
