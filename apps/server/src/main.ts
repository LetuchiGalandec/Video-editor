import 'dotenv/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config';
import type { AppConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  // Behind nginx/Cloudflare, req.ip is the proxy without this, which would
  // make the rate limiter bucket every visitor into one shared counter.
  app.set('trust proxy', 1);

  // This process serves JSON and media, never HTML, so the restrictive
  // defaults are safe. CSP belongs to whatever serves the SPA; setting one
  // here would only mislead.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Clips are played by a page on the web origin, a different port in
      // this deployment; the default 'same-origin' policy would block them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Signed cookies carry the per-user session id (see SessionService).
  app.use(cookieParser(config.sessionSecret));
  app.setGlobalPrefix('api');
  await app.listen(config.port);
}
void bootstrap();
