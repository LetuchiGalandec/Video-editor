import { Module } from '@nestjs/common';
import { ProbeService } from './probe.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  controllers: [VideosController],
  providers: [ProbeService, VideosService],
  exports: [ProbeService, VideosService],
})
export class VideosModule {}
