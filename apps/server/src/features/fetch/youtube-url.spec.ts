import { describe, it, expect } from 'vitest';
import { parseYoutubeVideoId } from './youtube-url';

describe('parseYoutubeVideoId', () => {
  const accepted: Array<[string, string]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&ab_channel=x', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['http://www.youtube.com/watch?v=a_b-c123XYZ', 'a_b-c123XYZ'],
    ['www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ];

  it.each(accepted)('accepts %s', (url, id) => {
    expect(parseYoutubeVideoId(url)).toBe(id);
  });

  const rejected: string[] = [
    '',
    'not a url',
    'https://vimeo.com/12345678',
    'https://www.youtube.com/playlist?list=PL123456789',
    'https://www.youtube.com/watch?list=PL123456789',
    'https://www.youtube.com/watch?v=tooShort',
    'https://www.youtube.com/watch?v=waaaay_too_long_for_an_id',
    'https://www.youtube.com/watch?v=bad!chars@@@',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
  ];

  it.each(rejected)('rejects %s', (url) => {
    expect(parseYoutubeVideoId(url)).toBeNull();
  });
});
