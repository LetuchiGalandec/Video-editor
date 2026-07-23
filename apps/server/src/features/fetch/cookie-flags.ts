export interface CookieOptions {
  /** yt-dlp `--cookies-from-browser` value, e.g. "chrome", "safari", "chrome:Default". */
  cookiesFromBrowser?: string;
  /** Path to an exported Netscape-format cookies.txt for `--cookies`. */
  cookiesFile?: string;
}

export interface CookieFlags {
  cookiesFromBrowser?: string;
  cookies?: string;
}

/**
 * Turns cookie config into yt-dlp flags. Cookies let yt-dlp authenticate as the
 * signed-in user, which is what unlocks age-restricted (and other login-gated)
 * videos. A live browser source wins over a static file when both are set.
 */
export function buildCookieFlags(options: CookieOptions): CookieFlags {
  if (options.cookiesFromBrowser) {
    return { cookiesFromBrowser: options.cookiesFromBrowser };
  }
  if (options.cookiesFile) {
    return { cookies: options.cookiesFile };
  }
  return {};
}
