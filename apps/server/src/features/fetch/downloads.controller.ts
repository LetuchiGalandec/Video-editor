import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DownloadsService } from './downloads.service';

interface StartDownloadDto {
  url?: unknown;
}

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Post()
  @HttpCode(202)
  start(@Body() body: StartDownloadDto): { jobId: string } {
    const url = typeof body?.url === 'string' ? body.url : '';
    const job = this.downloads.startDownload(url);
    return { jobId: job.id };
  }
}
