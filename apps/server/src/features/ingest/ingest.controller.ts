import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestService } from './ingest.service';
import { MulterErrorFilter } from './multer-error.filter';

@Controller('videos')
@UseFilters(MulterErrorFilter)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ jobId: string }> {
    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }
    const job = await this.ingest.ingest(file.path, file.originalname);
    return { jobId: job.id };
  }
}
