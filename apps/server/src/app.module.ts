import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { ClipsModule } from './features/clips/clips.module';
import { FetchModule } from './features/fetch/fetch.module';
import { JobsModule } from './features/jobs/jobs.module';
import { UploadModule } from './features/upload/upload.module';
import { VideosModule } from './features/videos/videos.module';

@Module({
  imports: [ConfigModule, JobsModule, FetchModule, VideosModule, ClipsModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
