import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { ClipsModule } from '../clips/clips.module';
import { JobsModule } from '../jobs/jobs.module';
import { VideosModule } from '../videos/videos.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { PublicConfigController } from './public-config.controller';

@Module({
  imports: [
    JobsModule,
    VideosModule,
    ClipsModule,
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const tmpDir = join(config.dataDir, 'tmp');
        mkdirSync(tmpDir, { recursive: true });
        return {
          storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, tmpDir),
            filename: (_req, file, cb) =>
              cb(null, `${randomUUID()}${extname(file.originalname)}`),
          }),
          limits: { fileSize: config.maxUploadBytes },
          fileFilter: (
            _req: unknown,
            file: { mimetype: string },
            cb: (error: Error | null, acceptFile: boolean) => void,
          ) => {
            if (file.mimetype.startsWith('video/')) {
              cb(null, true);
            } else {
              cb(new BadRequestException('Please choose a video file.'), false);
            }
          },
        };
      },
    }),
  ],
  controllers: [IngestController, PublicConfigController],
  providers: [IngestService],
})
export class IngestModule {}
