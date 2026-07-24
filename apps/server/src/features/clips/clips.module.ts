import { Module } from '@nestjs/common';
import { FetchModule } from '../fetch/fetch.module';
import { JobsModule } from '../jobs/jobs.module';
import { VideosModule } from '../videos/videos.module';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { FfmpegService } from './ffmpeg.service';

@Module({
  imports: [JobsModule, VideosModule, FetchModule],
  controllers: [ClipsController],
  providers: [ClipsService, FfmpegService],
  exports: [ClipsService, FfmpegService],
})
export class ClipsModule {}
