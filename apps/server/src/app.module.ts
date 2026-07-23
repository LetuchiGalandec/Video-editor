import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { FetchModule } from './features/fetch/fetch.module';
import { JobsModule } from './features/jobs/jobs.module';

@Module({
  imports: [ConfigModule, JobsModule, FetchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
