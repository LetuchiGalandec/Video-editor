import { InjectionToken } from '@angular/core';

/** Widest edge of a scrub thumbnail, in CSS pixels. */
export const THUMB_WIDTH = 160;
/** Thumbnails are boxed 16:9 and cropped, so the chip never changes size. */
export const THUMB_HEIGHT = 90;

const JPEG_QUALITY = 0.7;
const HAVE_METADATA = 1;

/**
 * Runs one job at a time and remembers only the most recent request made while
 * that job is in flight. Seeking a video takes far longer than a mouse moves,
 * so a queue would leave the thumbnail crawling through positions the cursor
 * left long ago; dropping the intermediate ones keeps it on the pointer.
 */
export class LatestWins {
  private pending: number | null = null;
  private busy = false;
  private cancelled = false;

  constructor(private readonly run: (value: number) => void) {}

  request(value: number): void {
    if (this.cancelled) {
      return;
    }
    this.pending = value;
    this.drain();
  }

  /** Marks the in-flight job finished, releasing whatever queued behind it. */
  settle(): void {
    this.busy = false;
    this.drain();
  }

  cancel(): void {
    this.cancelled = true;
    this.pending = null;
  }

  private drain(): void {
    if (this.cancelled || this.busy || this.pending === null) {
      return;
    }
    const next = this.pending;
    this.pending = null;
    this.busy = true;
    this.run(next);
  }
}

/** What the timeline needs from a thumbnail source; lets tests swap the media. */
export interface FrameSource {
  request(seconds: number): void;
  dispose(): void;
}

export type FrameSourceFactory = (src: string, onFrame: (dataUrl: string) => void) => FrameSource;

export const FRAME_SOURCE = new InjectionToken<FrameSourceFactory>('FrameSource', {
  providedIn: 'root',
  factory: () => (src, onFrame) => new FrameGrabber(src, onFrame),
});

/**
 * Pulls still frames out of a video for the trim timeline, using a detached
 * <video> so the real player keeps its own position while you drag a marker.
 *
 * The source must be same-origin — it is served from /api/videos/:id/stream —
 * or reading the canvas back throws a security error.
 */
export class FrameGrabber implements FrameSource {
  private readonly video = document.createElement('video');
  private readonly canvas = document.createElement('canvas');
  private readonly queue = new LatestWins((seconds) => this.seek(seconds));
  private disposed = false;

  constructor(
    src: string,
    private readonly onFrame: (dataUrl: string) => void,
  ) {
    this.video.src = src;
    // 'metadata', not 'auto': seeking range-requests the bytes it needs, while
    // 'auto' would pull the entire file down a second time alongside the
    // player's own stream.
    this.video.preload = 'metadata';
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.addEventListener('seeked', this.onSeeked);
    // A frame can be asked for before the metadata lands; retry once it does.
    this.video.addEventListener('loadedmetadata', this.onSeeked);
    this.video.addEventListener('error', this.onError);
  }

  request(seconds: number): void {
    if (!this.disposed) {
      this.queue.request(seconds);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue.cancel();
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('loadedmetadata', this.onSeeked);
    this.video.removeEventListener('error', this.onError);
    // Releases the connection; without it the download runs to completion.
    this.video.removeAttribute('src');
    this.video.load();
  }

  private seek(seconds: number): void {
    if (this.video.readyState < HAVE_METADATA) {
      // Not seekable yet. loadedmetadata will settle the queue and retry.
      return;
    }
    this.video.currentTime = seconds;
  }

  private readonly onSeeked = (): void => {
    if (this.disposed) {
      return;
    }
    this.paint();
    this.queue.settle();
  };

  // A dead source must not wedge the queue; let later requests through.
  private readonly onError = (): void => this.queue.settle();

  private paint(): void {
    const { videoWidth, videoHeight } = this.video;
    if (videoWidth === 0 || videoHeight === 0) {
      return;
    }
    this.canvas.width = THUMB_WIDTH;
    this.canvas.height = THUMB_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    // Cover the fixed box, cropping the overflowing axis, so the chip keeps a
    // constant size whatever the source aspect ratio is.
    const scale = Math.max(THUMB_WIDTH / videoWidth, THUMB_HEIGHT / videoHeight);
    const width = videoWidth * scale;
    const height = videoHeight * scale;
    ctx.drawImage(
      this.video,
      (THUMB_WIDTH - width) / 2,
      (THUMB_HEIGHT - height) / 2,
      width,
      height,
    );
    try {
      this.onFrame(this.canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    } catch {
      // Tainted canvas (a cross-origin source): drop the preview rather than
      // take the whole drag down with it.
      this.dispose();
    }
  }
}
