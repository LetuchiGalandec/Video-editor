import * as path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  fetcher: 'ytdlp' | 'fake';
  fixturePath: string;
  maxDurationSec: number;
  ttlMinutes: number;
  googleClientId: string;
  googleClientSecret: string;
  oauthRedirectUri: string;
  webOrigin: string;
  ytCookiesFromBrowser: string;
  ytCookiesFile: string;
}

export const APP_CONFIG = 'APP_CONFIG';

const intFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const FOUR_HOURS_SEC = 4 * 60 * 60;
const SIX_HOURS_MIN = 6 * 60;

// Anchor defaults to this file's location (src/config or dist/config), not the
// process cwd, so the server behaves the same however it is launched.
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..', '..');

export function loadConfig(): AppConfig {
  return {
    port: intFromEnv(process.env.PORT, 3000),
    dataDir: process.env.DATA_DIR ?? path.join(SERVER_ROOT, '.data'),
    fetcher: process.env.FETCHER === 'fake' ? 'fake' : 'ytdlp',
    fixturePath:
      process.env.FIXTURE_PATH ??
      path.join(REPO_ROOT, 'fixtures', 'sample.mp4'),
    maxDurationSec: intFromEnv(process.env.MAX_DURATION_SEC, FOUR_HOURS_SEC),
    ttlMinutes: intFromEnv(process.env.TTL_MINUTES, SIX_HOURS_MIN),
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    oauthRedirectUri:
      process.env.OAUTH_REDIRECT_URI ??
      'http://localhost:3000/api/auth/google/callback',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4200',
    ytCookiesFromBrowser: process.env.YT_COOKIES_FROM_BROWSER ?? '',
    ytCookiesFile: process.env.YT_COOKIES_FILE ?? '',
  };
}
