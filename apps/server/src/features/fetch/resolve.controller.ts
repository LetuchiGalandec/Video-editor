import { Body, Controller, Post } from '@nestjs/common';
import { DownloadsService } from './downloads.service';
import type { ResolveResult } from './downloads.service';

interface ResolveDto {
  url?: unknown;
}

@Controller('resolve')
export class ResolveController {
  constructor(private readonly downloads: DownloadsService) {}

  @Post()
  resolve(@Body() body: ResolveDto): Promise<ResolveResult> {
    const url = typeof body?.url === 'string' ? body.url : '';
    return this.downloads.resolve(url);
  }
}
