import { Controller, Get, NotFoundException, Param, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { JobStore } from './job-store';
import type { Job } from './job.model';

@Controller('jobs')
export class JobsController {
  constructor(private readonly store: JobStore) {}

  @Get(':id')
  get(@Param('id') id: string): Job {
    const job = this.store.get(id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    if (!this.store.get(id)) {
      throw new NotFoundException('Job not found');
    }
    return this.store.watch(id).pipe(map((job) => ({ data: job })));
  }
}
