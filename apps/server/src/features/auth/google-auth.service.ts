import { Inject, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { UserSessionStore } from './user-session.store';
import type { TokenSet } from './user-session.store';

// Derive OAuth types from the constructor googleapis actually uses — avoids the
// duplicate google-auth-library copies clashing.
export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type Credentials = OAuth2Client['credentials'];

// youtube.upload = insert videos; youtube = manage playlists + read the channel.
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

export interface AuthUser {
  name: string;
}

export interface AuthStatus {
  configured: boolean;
  authorized: boolean;
  user?: AuthUser;
}

/**
 * Multi-user Google OAuth. Every sign-in is scoped to a browser session and
 * resolves to that account's own YouTube channel — a video can only ever be
 * inserted on the channel whose token performed the request.
 */
@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly store: UserSessionStore,
  ) {}

  get configured(): boolean {
    return this.config.googleClientId !== '' && this.config.googleClientSecret !== '';
  }

  authUrl(state: string): string {
    return this.newClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
  }

  /** Exchanges the code, identifies the channel, and binds it to this session. */
  async handleCallback(code: string, sessionId: string): Promise<void> {
    const client = this.newClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: client });
    const channels = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = channels.data.items?.[0];
    const userId = channel?.id ?? `unknown-${sessionId}`;
    const name = channel?.snippet?.title ?? 'YouTube account';

    // Preserve an earlier refresh_token if Google omits it on a repeat consent.
    const existing = this.store.getUser(userId);
    const mergedTokens = { ...(existing?.tokens ?? {}), ...tokens } as TokenSet;
    this.store.upsertUser({ userId, name, tokens: mergedTokens });
    this.store.linkSession(sessionId, userId);
  }

  async statusForSession(sessionId: string): Promise<AuthStatus> {
    if (!this.configured) {
      return { configured: false, authorized: false };
    }
    const user = this.store.getUserBySession(sessionId);
    const client = user ? this.clientFor(user.userId) : null;
    if (!user || !client) {
      return { configured: true, authorized: false };
    }
    try {
      await client.getAccessToken();
      return { configured: true, authorized: true, user: { name: user.name } };
    } catch {
      return { configured: true, authorized: false };
    }
  }

  async clientForSession(sessionId: string): Promise<OAuth2Client | null> {
    const userId = this.store.userIdForSession(sessionId);
    return userId ? this.clientFor(userId) : null;
  }

  signOut(sessionId: string): void {
    this.store.unlinkSession(sessionId);
  }

  private clientFor(userId: string): OAuth2Client | null {
    const user = this.store.getUser(userId);
    if (!user) {
      return null;
    }
    const client = this.newClient();
    client.setCredentials(user.tokens as Credentials);
    client.on('tokens', (rotated) => {
      const current = this.store.getUser(userId);
      this.store.updateTokens(userId, { ...(current?.tokens ?? {}), ...rotated });
    });
    return client;
  }

  private newClient(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.googleClientId,
      this.config.googleClientSecret,
      this.config.oauthRedirectUri,
    );
  }
}
