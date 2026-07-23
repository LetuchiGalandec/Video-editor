import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config';
import type { AppConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  // Signed cookies carry the per-user session id (see SessionService).
  app.use(cookieParser(config.sessionSecret));
  app.setGlobalPrefix('api');
  await app.listen(config.port);
}
void bootstrap();
