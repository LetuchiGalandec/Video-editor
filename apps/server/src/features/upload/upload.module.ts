import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClipsModule } from '../clips/clips.module';
import { JobsModule } from '../jobs/jobs.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { YoutubeController } from './youtube.controller';
import { YoutubePlaylistService } from './youtube-playlist.service';
import { YoutubeUploadService } from './youtube-upload.service';

@Module({
  imports: [JobsModule, ClipsModule, AuthModule],
  controllers: [UploadsController, YoutubeController],
  providers: [YoutubeUploadService, YoutubePlaylistService, UploadsService],
})
export class UploadModule {}
