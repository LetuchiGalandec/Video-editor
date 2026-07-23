const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

/**
 * Extracts the 11-character YouTube video id from a URL, or returns null when
 * the URL is not a single-video YouTube link. Playlist-only links are rejected.
 */
export function parseYoutubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === 'youtu.be') {
    return asVideoId(url.pathname.slice(1).split('/')[0]);
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (url.pathname === '/watch') {
    return asVideoId(url.searchParams.get('v'));
  }

  for (const prefix of PATH_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      return asVideoId(url.pathname.slice(prefix.length).split('/')[0]);
    }
  }

  return null;
}

function asVideoId(candidate: string | null | undefined): string | null {
  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
}
