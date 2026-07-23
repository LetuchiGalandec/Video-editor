import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { GoogleAuthService } from './google-auth.service';
import type { AuthStatus } from './google-auth.service';
import { SessionService } from './session.service';

/** Only ever bounce back to app-internal paths, never attacker-supplied URLs. */
const SAFE_RETURN_PATH = /^\/[a-zA-Z0-9/_-]*$/;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: GoogleAuthService,
    private readonly session: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('google')
  start(
    @Query('return') returnPath: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    if (!this.auth.configured) {
      throw new BadRequestException(
        'Google OAuth is not configured — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/server/.env.',
      );
    }
    // Establish (or reuse) this browser's session before leaving for Google, so
    // the cookie is the same one presented on the callback and later requests.
    this.session.getOrCreate(req, res);
    const state = SAFE_RETURN_PATH.test(returnPath ?? '')
      ? (returnPath as string)
      : '/';
    res.redirect(this.auth.authUrl(state));
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const returnPath = SAFE_RETURN_PATH.test(state ?? '')
      ? (state as string)
      : '/';
    const sessionId = this.session.getOrCreate(req, res);
    if (!code) {
      res.redirect(`${this.config.webOrigin}${returnPath}?auth=denied`);
      return;
    }
    await this.auth.handleCallback(code, sessionId);
    res.redirect(`${this.config.webOrigin}${returnPath}?auth=ok`);
  }

  @Get('status')
  status(@Req() req: Request): Promise<AuthStatus> {
    const sessionId = this.session.peek(req);
    if (!sessionId) {
      return Promise.resolve({
        configured: this.auth.configured,
        authorized: false,
      });
    }
    return this.auth.statusForSession(sessionId);
  }

  @Post('signout')
  @HttpCode(204)
  signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): void {
    const sessionId = this.session.peek(req);
    if (sessionId) {
      this.auth.signOut(sessionId);
    }
    this.session.clear(res);
  }
}
