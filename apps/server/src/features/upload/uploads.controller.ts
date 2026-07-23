import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { UploadsService } from './uploads.service';

interface CreateUploadDto {
  clipId?: unknown;
  title?: unknown;
  description?: unknown;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: CreateUploadDto): Promise<{ jobId: string }> {
    const job = await this.uploads.startUpload({
      clipId: typeof body?.clipId === 'string' ? body.clipId : '',
      title: typeof body?.title === 'string' ? body.title : '',
      description: typeof body?.description === 'string' ? body.description : '',
    });
    return { jobId: job.id };
  }
}
