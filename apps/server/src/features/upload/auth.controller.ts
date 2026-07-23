import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { GoogleAuthService } from './google-auth.service';
import type { AuthStatus } from './google-auth.service';

/** Only ever bounce back to app-internal paths, never attacker-supplied URLs. */
const SAFE_RETURN_PATH = /^\/[a-zA-Z0-9/_-]*$/;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: GoogleAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('google')
  start(
    @Query('return') returnPath: string | undefined,
    @Res() res: Response,
  ): void {
    if (!this.auth.configured) {
      throw new BadRequestException(
        'Google OAuth is not configured — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/server/.env.',
      );
    }
    const state = SAFE_RETURN_PATH.test(returnPath ?? '')
      ? (returnPath as string)
      : '/';
    res.redirect(this.auth.authUrl(state));
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const returnPath = SAFE_RETURN_PATH.test(state ?? '')
      ? (state as string)
      : '/';
    if (!code) {
      res.redirect(`${this.config.webOrigin}${returnPath}?auth=denied`);
      return;
    }
    await this.auth.handleCallback(code);
    res.redirect(`${this.config.webOrigin}${returnPath}?auth=ok`);
  }

  @Get('status')
  status(): Promise<AuthStatus> {
    return this.auth.status();
  }
}
