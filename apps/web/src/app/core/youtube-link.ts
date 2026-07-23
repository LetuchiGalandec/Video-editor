const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

/** Client-side mirror of the server's YouTube URL validation, used to enable
 * the fetch button before the request is ever sent. */
export function isYoutubeVideoUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    return VIDEO_ID_PATTERN.test(url.pathname.slice(1).split('/')[0] ?? '');
  }
  if (!YOUTUBE_HOSTS.has(host)) {
    return false;
  }
  if (url.pathname === '/watch') {
    return VIDEO_ID_PATTERN.test(url.searchParams.get('v') ?? '');
  }
  return PATH_PREFIXES.some(
    (prefix) =>
      url.pathname.startsWith(prefix) &&
      VIDEO_ID_PATTERN.test(url.pathname.slice(prefix.length).split('/')[0] ?? ''),
  );
}
