import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestService } from './ingest.service';
import { DiskSpaceGuard } from './disk-space.guard';
import { Throttle } from '@nestjs/throttler';
import { EXPENSIVE_THROTTLE } from '../../throttler-config';

// No custom exception filter needed here: FileInterceptor already runs
// multer's errors through Nest's transformException(), which maps
// LIMIT_FILE_SIZE -> PayloadTooLargeException (413) and every other
// MulterError -> BadRequestException (400) before it ever reaches a filter.
@Controller('videos')
@Throttle({ default: EXPENSIVE_THROTTLE })
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @HttpCode(202)
  // Ordering matters: the guard runs before the interceptor, so a refused
  // upload never reaches disk.
  @UseGuards(DiskSpaceGuard)
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
