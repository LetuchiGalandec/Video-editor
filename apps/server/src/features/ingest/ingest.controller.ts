import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestService } from './ingest.service';

// No custom exception filter needed here: FileInterceptor already runs
// multer's errors through Nest's transformException(), which maps
// LIMIT_FILE_SIZE -> PayloadTooLargeException (413) and every other
// MulterError -> BadRequestException (400) before it ever reaches a filter.
@Controller('videos')
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
