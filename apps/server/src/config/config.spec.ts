import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig upload/youtube settings', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults uploads to 2 GiB / 2 hours and YouTube enabled', () => {
    delete process.env.MAX_UPLOAD_BYTES;
    delete process.env.MAX_UPLOAD_DURATION_SEC;
    delete process.env.YOUTUBE_ENABLED;
    const config = loadConfig();
    expect(config.maxUploadBytes).toBe(2147483648);
    expect(config.maxUploadDurationSec).toBe(7200);
    expect(config.youtubeEnabled).toBe(true);
  });

  it('reads overrides and disables YouTube only on the string "false"', () => {
    process.env.MAX_UPLOAD_BYTES = '1048576';
    process.env.MAX_UPLOAD_DURATION_SEC = '600';
    process.env.YOUTUBE_ENABLED = 'false';
    const config = loadConfig();
    expect(config.maxUploadBytes).toBe(1048576);
    expect(config.maxUploadDurationSec).toBe(600);
    expect(config.youtubeEnabled).toBe(false);
  });
});
