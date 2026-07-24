const MP4_FAMILY = ['mp4', 'mov', 'm4a', 'm4v'];
const H264_CODECS = ['h264', 'avc1'];
const AAC_CODECS = ['aac', 'mp4a'];

/**
 * True when a `<video>` tag can reliably play the file as-is (so we only need a
 * fast stream-copy remux). Cross-browser that means H.264 video in an
 * mp4/mov-family container, with either no audio or AAC audio. Everything else
 * (iPhone HEVC, VP9/webm, mp3-in-mp4, …) must be transcoded.
 */
export function isBrowserPlayable(p: {
  container: string;
  videoCodec: string;
  audioCodec: string;
}): boolean {
  const container = p.container.toLowerCase();
  const containerOk = MP4_FAMILY.some((c) => container.includes(c));
  const videoOk = H264_CODECS.includes(p.videoCodec.toLowerCase());
  const audioOk =
    p.audioCodec === '' || AAC_CODECS.includes(p.audioCodec.toLowerCase());
  return containerOk && videoOk && audioOk;
}
