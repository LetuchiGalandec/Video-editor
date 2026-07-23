import { Module } from '@nestjs/common';
import * as path from 'node:path';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { SessionService } from './session.service';
import { UserSessionStore } from './user-session.store';

@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    GoogleAuthService,
    {
      provide: UserSessionStore,
      useFactory: (config: AppConfig) =>
        new UserSessionStore(path.join(config.dataDir, 'auth.json')),
      inject: [APP_CONFIG],
    },
  ],
  exports: [GoogleAuthService, SessionService],
})
export class AuthModule {}
