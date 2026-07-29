import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { secondsToTimestamp } from '../../../core/time-format';
import { FRAME_SOURCE, THUMB_HEIGHT, THUMB_WIDTH } from './frame-grabber';
import type { FrameSource } from './frame-grabber';
import { clampMarker, clampPlayhead, clientXToSeconds, keyboardStep } from './trim-timeline-math';
import type { MarkerKind, TrackRect } from './trim-timeline-math';

/**
 * The dual-handle trim timeline: drag the kernel handles to set the selection,
 * drag the playhead (or anywhere on the track) to scrub, arrow keys for
 * frame-ish nudges. All px↔seconds math lives in trim-timeline-math.ts.
 */
@Component({
  selector: 'app-trim-timeline',
  templateUrl: './trim-timeline.html',
  styleUrl: './trim-timeline.scss',
})
export class TrimTimeline {
  readonly duration = input.required<number>();
  readonly currentTime = input(0);
  readonly markIn = model.required<number>();
  readonly markOut = model.required<number>();
  /**
   * Same-origin video to pull scrub thumbnails from. Empty disables them —
   * quick mode previews through YouTube's iframe, whose frames cannot be read
   * and whose source the server never downloaded.
   */
  readonly previewSrc = input('');
  readonly seek = output<number>();

  protected readonly thumbWidth = THUMB_WIDTH;
  protected readonly thumbHeight = THUMB_HEIGHT;

  private readonly trackRef = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly playheadRef = viewChild.required<ElementRef<HTMLElement>>('playhead');

  /**
   * Where the pointer is holding the playhead, or null when nobody is dragging.
   * A seek only reaches currentTime() after it round-trips through the player —
   * and the YouTube embed merely polls it every 200ms — so rendering the
   * reported time during a drag makes the playhead lag and stutter behind the
   * cursor. While scrubbing this wins; on release the player takes over again.
   */
  private readonly scrubTime = signal<number | null>(null);

  /**
   * True while the playhead holds focus only because a pointer grabbed it.
   * Chrome reports programmatic focus() as :focus-visible, so without this the
   * keyboard focus ring flashes up on every ordinary mouse scrub.
   */
  protected readonly pointerFocused = signal(false);

  /** Which marker the thumbnail belongs to; null when nothing is being dragged. */
  private readonly previewKind = signal<MarkerKind | null>(null);
  private readonly previewFrame = signal('');
  private readonly newFrameSource = inject(FRAME_SOURCE);
  private grabber: FrameSource | null = null;

  constructor() {
    effect(() => {
      // A new source invalidates the old video; the next drag builds a fresh one.
      this.previewSrc();
      this.releaseGrabber();
    });
    inject(DestroyRef).onDestroy(() => this.releaseGrabber());
  }

  /** The thumbnail for this handle, or '' when it is not the one being dragged. */
  protected frameFor(kind: MarkerKind): string {
    return this.previewKind() === kind ? this.previewFrame() : '';
  }

  private previewAt(kind: MarkerKind, seconds: number): void {
    const grabber = this.ensureGrabber();
    if (grabber === null) {
      return;
    }
    this.previewKind.set(kind);
    grabber.request(seconds);
  }

  /**
   * Built on the first drag rather than on mount: most visits never trim, and
   * an eager second <video> would fetch the file again for nothing.
   */
  private ensureGrabber(): FrameSource | null {
    const src = this.previewSrc();
    if (src === '') {
      return null;
    }
    this.grabber ??= this.newFrameSource(src, (frame) => this.previewFrame.set(frame));
    return this.grabber;
  }

  private releaseGrabber(): void {
    this.grabber?.dispose();
    this.grabber = null;
  }

  private endPreview(): void {
    this.previewKind.set(null);
    this.previewFrame.set('');
  }

  protected readonly inPct = computed(() => this.toPct(this.markIn()));
  protected readonly outPct = computed(() => this.toPct(this.markOut()));
  protected readonly playheadTime = computed(() =>
    this.clampToSelection(this.scrubTime() ?? this.currentTime()),
  );
  protected readonly playheadPct = computed(() => this.toPct(this.playheadTime()));
  protected readonly inLabel = computed(() => secondsToTimestamp(this.markIn()));
  protected readonly outLabel = computed(() => secondsToTimestamp(this.markOut()));
  protected readonly playheadLabel = computed(() => secondsToTimestamp(this.playheadTime()));

  private toPct(seconds: number): number {
    const duration = this.duration();
    return duration > 0 ? (seconds / duration) * 100 : 0;
  }

  /** Moves a marker toward the given clientX; exposed for tests. */
  dragTo(kind: MarkerKind, clientX: number, rect: TrackRect): void {
    const seconds = clientXToSeconds(clientX, rect, this.duration());
    this.setMarker(kind, seconds);
    // Preview where the marker actually landed, not where the pointer is: the
    // two differ once the marker clamps against its neighbour.
    this.previewAt(kind, kind === 'in' ? this.markIn() : this.markOut());
  }

  private setMarker(kind: MarkerKind, seconds: number): void {
    const clamped = clampMarker(kind, seconds, {
      markIn: this.markIn(),
      markOut: this.markOut(),
      duration: this.duration(),
    });
    if (kind === 'in') {
      this.markIn.set(clamped);
    } else {
      this.markOut.set(clamped);
    }
    this.keepPlayheadInSelection();
  }

  private clampToSelection(seconds: number): number {
    return clampPlayhead(seconds, this.markIn(), this.markOut());
  }

  /**
   * Dragging a marker over the playhead would strand it in the dimmed region,
   * so the playhead follows the marker that swept past it.
   */
  private keepPlayheadInSelection(): void {
    const current = this.currentTime();
    const clamped = this.clampToSelection(current);
    if (clamped !== current) {
      this.seek.emit(clamped);
    }
  }

  protected onHandlePointerDown(kind: MarkerKind, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const rect = this.trackRect();
    handle.setPointerCapture?.(event.pointerId);
    // Show the frame the marker already sits on, before the pointer moves.
    this.previewAt(kind, kind === 'in' ? this.markIn() : this.markOut());
    const onMove = (move: PointerEvent): void => this.dragTo(kind, move.clientX, rect);
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      this.endPreview();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  /**
   * Starts a scrub. Fires for the playhead too: it sits inside the track, so
   * grabbing it lands here and needs no separate drag path.
   */
  protected onTrackPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.handle')) {
      return;
    }
    // Without this a drag selects the surrounding time chips instead.
    event.preventDefault();
    const track = this.trackRef().nativeElement;
    const rect = this.trackRect();
    if (typeof event.pointerId === 'number') {
      // Keeps the drag alive once the cursor leaves the track.
      track.setPointerCapture?.(event.pointerId);
    }
    // preventDefault suppressed the implicit focus; move it by hand so the
    // arrow keys nudge the playhead straight after a grab.
    this.pointerFocused.set(true);
    this.playheadRef().nativeElement.focus();
    this.scrubTo(event.clientX, rect);

    const onMove = (move: PointerEvent): void => this.scrubTo(move.clientX, rect);
    const onUp = (): void => {
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
      this.scrubTime.set(null);
    };
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
  }

  private scrubTo(clientX: number, rect: TrackRect): void {
    const seconds = this.clampToSelection(clientXToSeconds(clientX, rect, this.duration()));
    this.scrubTime.set(seconds);
    this.seek.emit(seconds);
  }

  protected onPlayheadKeydown(event: KeyboardEvent): void {
    // Touching the keyboard makes the ring wanted again.
    this.pointerFocused.set(false);
    // Home/End mean the ends of the selection, not of the video.
    if (event.key === 'Home') {
      event.preventDefault();
      this.seek.emit(this.markIn());
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.seek.emit(this.markOut());
      return;
    }
    const step = keyboardStep(event.key, event.shiftKey);
    if (step !== null) {
      event.preventDefault();
      this.seek.emit(this.clampToSelection(this.playheadTime() + step));
    }
  }

  protected onHandleKeydown(kind: MarkerKind, event: KeyboardEvent): void {
    const current = kind === 'in' ? this.markIn() : this.markOut();
    if (event.key === 'Home') {
      event.preventDefault();
      this.setMarker(kind, 0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      this.setMarker(kind, this.duration());
      return;
    }
    const step = keyboardStep(event.key, event.shiftKey);
    if (step !== null) {
      event.preventDefault();
      this.setMarker(kind, current + step);
    }
  }

  private trackRect(): TrackRect {
    const rect = this.trackRef().nativeElement.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }
}
