import { Module } from '@nestjs/common';
import { JobQueue } from './job-queue';
import { JobStore } from './job-store';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [JobStore, JobQueue],
  exports: [JobStore, JobQueue],
})
export class JobsModule {}
