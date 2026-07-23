import { Module } from '@nestjs/common';
import { ClipsModule } from '../clips/clips.module';
import { JobsModule } from '../jobs/jobs.module';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { YoutubeUploadService } from './youtube-upload.service';

@Module({
  imports: [JobsModule, ClipsModule],
  controllers: [AuthController, UploadsController],
  providers: [GoogleAuthService, YoutubeUploadService, UploadsService],
})
export class UploadModule {}
