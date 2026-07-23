import { describe, it, expect } from 'vitest';
import { buildCookieFlags } from './cookie-flags';

describe('buildCookieFlags', () => {
  it('prefers a browser cookie source when set', () => {
    expect(buildCookieFlags({ cookiesFromBrowser: 'chrome', cookiesFile: '/tmp/c.txt' })).toEqual({
      cookiesFromBrowser: 'chrome',
    });
  });

  it('passes through browser:profile syntax verbatim', () => {
    expect(buildCookieFlags({ cookiesFromBrowser: 'chrome:Default' })).toEqual({
      cookiesFromBrowser: 'chrome:Default',
    });
  });

  it('falls back to a cookie file when no browser is set', () => {
    expect(buildCookieFlags({ cookiesFile: '/tmp/cookies.txt' })).toEqual({
      cookies: '/tmp/cookies.txt',
    });
  });

  it('returns no flags when neither source is configured', () => {
    expect(buildCookieFlags({})).toEqual({});
    expect(buildCookieFlags({ cookiesFromBrowser: '', cookiesFile: '' })).toEqual({});
  });
});
