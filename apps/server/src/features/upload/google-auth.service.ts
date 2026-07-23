import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { Credentials, OAuth2Client } from 'google-auth-library';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const TOKENS_FILE_MODE = 0o600;

export interface AuthStatus {
  configured: boolean;
  authorized: boolean;
}

/**
 * Owns the single-user Google OAuth flow: consent URL, code exchange, and
 * token persistence in DATA_DIR/tokens.json (chmod 600). Refresh-token
 * rotation is captured via the client's 'tokens' event.
 */
@Injectable()
export class GoogleAuthService {
  private client?: OAuth2Client;
  private readonly tokensPath: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.tokensPath = path.join(config.dataDir, 'tokens.json');
  }

  get configured(): boolean {
    return this.config.googleClientId !== '' && this.config.googleClientSecret !== '';
  }

  authUrl(state: string): string {
    return this.oauth2().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [UPLOAD_SCOPE],
      state,
    });
  }

  async handleCallback(code: string): Promise<void> {
    const client = this.oauth2();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    await this.persist(tokens);
  }

  async status(): Promise<AuthStatus> {
    if (!this.configured) {
      return { configured: false, authorized: false };
    }
    const client = await this.loadedClient();
    if (!client.credentials.refresh_token && !client.credentials.access_token) {
      return { configured: true, authorized: false };
    }
    try {
      // Round-trips to Google when the access token is stale, so this also
      // detects the 7-day testing-mode refresh-token expiry.
      await client.getAccessToken();
      return { configured: true, authorized: true };
    } catch {
      return { configured: true, authorized: false };
    }
  }

  /** The OAuth2 client with stored credentials, or null when not authorized. */
  async authorizedClient(): Promise<OAuth2Client | null> {
    if (!this.configured) {
      return null;
    }
    const client = await this.loadedClient();
    if (!client.credentials.refresh_token && !client.credentials.access_token) {
      return null;
    }
    return client;
  }

  private oauth2(): OAuth2Client {
    if (!this.client) {
      this.client = new google.auth.OAuth2(
        this.config.googleClientId,
        this.config.googleClientSecret,
        this.config.oauthRedirectUri,
      );
      this.client.on('tokens', (tokens) => {
        void this.persist({ ...this.client?.credentials, ...tokens });
      });
    }
    return this.client;
  }

  private async loadedClient(): Promise<OAuth2Client> {
    const client = this.oauth2();
    if (!client.credentials.refresh_token && !client.credentials.access_token) {
      try {
        const raw = await readFile(this.tokensPath, 'utf-8');
        client.setCredentials(JSON.parse(raw) as Credentials);
      } catch {
        // No stored tokens yet — stays unauthorized.
      }
    }
    return client;
  }

  private async persist(tokens: Credentials): Promise<void> {
    await writeFile(this.tokensPath, JSON.stringify(tokens, null, 2), {
      mode: TOKENS_FILE_MODE,
    });
  }
}
