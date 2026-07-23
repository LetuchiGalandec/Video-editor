import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'cropcorn_sid';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Issues and reads the per-browser session id via a signed, HttpOnly cookie.
 * The session id is the single source of truth for "who is this browser" — it
 * ties a visitor to their stored Google account without exposing anything in
 * URLs.
 */
@Injectable()
export class SessionService {
  /** Returns the existing session id, minting and setting a cookie if absent. */
  getOrCreate(req: Request, res: Response): string {
    const existing = this.peek(req);
    if (existing) {
      return existing;
    }
    const sessionId = randomUUID();
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      signed: true,
      maxAge: ONE_YEAR_MS,
      path: '/',
    });
    return sessionId;
  }

  /** Reads the session id without creating one. */
  peek(req: Request): string | undefined {
    const value = req.signedCookies?.[COOKIE_NAME] ?? req.cookies?.[COOKIE_NAME];
    return typeof value === 'string' ? value : undefined;
  }

  clear(res: Response): void {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }
}
