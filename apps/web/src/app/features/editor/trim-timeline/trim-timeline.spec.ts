import { Component, signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TrimTimeline } from './trim-timeline';
import { FRAME_SOURCE } from './frame-grabber';
import type { FrameSource } from './frame-grabber';

@Component({
  imports: [TrimTimeline],
  template: `<app-trim-timeline
    [duration]="duration()"
    [currentTime]="currentTime()"
    [(markIn)]="markIn"
    [(markOut)]="markOut"
    [previewSrc]="previewSrc()"
    (seek)="lastSeek = $event"
  />`,
})
class Host {
  readonly duration = signal(100);
  readonly currentTime = signal(25);
  readonly markIn = signal(10);
  readonly markOut = signal(60);
  readonly previewSrc = signal('');
  lastSeek: number | null = null;
}

/** Stands in for the detached <video>, which cannot decode under a test runner. */
class FakeFrames implements FrameSource {
  static last: FakeFrames | undefined;
  readonly requested: number[] = [];
  disposed = false;

  constructor(
    readonly src: string,
    private readonly onFrame: (dataUrl: string) => void,
  ) {
    FakeFrames.last = this;
  }

  request(seconds: number): void {
    this.requested.push(seconds);
  }

  /** Pretends the seek finished and a frame came back. */
  deliver(dataUrl = 'data:image/jpeg;base64,FRAME'): void {
    this.onFrame(dataUrl);
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('TrimTimeline', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const handle = (which: 'in' | 'out'): HTMLElement =>
    el().querySelector(`.handle-${which}`) as HTMLElement;
  const playhead = (): HTMLElement => el().querySelector('.playhead') as HTMLElement;

  /** A 200px-wide track over a 100s video: 1px === 0.5s, so 120px === 60s. */
  const track = (): HTMLElement => {
    const node = el().querySelector('.track') as HTMLElement;
    node.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }) as DOMRect;
    return node;
  };
  const pointer = (node: HTMLElement, type: string, clientX = 0): void => {
    node.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
  };

  beforeEach(async () => {
    FakeFrames.last = undefined;
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: FRAME_SOURCE,
          useValue: (src: string, onFrame: (d: string) => void) => new FakeFrames(src, onFrame),
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('positions handles, selection and playhead from the model', () => {
    expect(handle('in').style.left).toBe('10%');
    expect(handle('out').style.left).toBe('60%');
    const selection = el().querySelector('.selection') as HTMLElement;
    expect(selection.style.left).toBe('10%');
    expect(selection.style.width).toBe('50%');
    const playhead = el().querySelector('.playhead') as HTMLElement;
    expect(playhead.style.left).toBe('25%');
  });

  it('exposes slider semantics for accessibility', () => {
    const inHandle = handle('in');
    expect(inHandle.getAttribute('role')).toBe('slider');
    expect(inHandle.getAttribute('aria-valuenow')).toBe('10');
    expect(inHandle.getAttribute('aria-valuemin')).toBe('0');
    expect(inHandle.getAttribute('aria-valuemax')).toBe('100');
    expect(inHandle.getAttribute('aria-valuetext')).toContain('0:10.0');
  });

  it('moves markers with arrow keys and clamps at the gap', async () => {
    handle('in').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(host.markIn()).toBeCloseTo(10.1);

    handle('in').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    await fixture.whenStable();
    expect(host.markIn()).toBeCloseTo(11.1);

    host.markIn.set(59.9);
    await fixture.whenStable();
    handle('in').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    await fixture.whenStable();
    expect(host.markIn()).toBeLessThan(host.markOut());
  });

  it('jumps to bounds with Home and End', async () => {
    handle('in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await fixture.whenStable();
    expect(host.markIn()).toBe(0);

    handle('out').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(host.markOut()).toBe(100);
  });

  it('emits seek when the track itself is clicked', () => {
    pointer(track(), 'pointerdown', 100);
    expect(host.lastSeek).toBe(50);
  });

  it('keeps seeking while the pointer drags across the track', () => {
    const node = track();
    pointer(node, 'pointerdown', 40);
    expect(host.lastSeek).toBe(20);
    pointer(node, 'pointermove', 80);
    expect(host.lastSeek).toBe(40);
    pointer(node, 'pointermove', 110);
    expect(host.lastSeek).toBeCloseTo(55);
  });

  it('stops seeking once the pointer is released', () => {
    const node = track();
    pointer(node, 'pointerdown', 20);
    pointer(node, 'pointerup', 20);
    pointer(node, 'pointermove', 180);
    expect(host.lastSeek).toBe(10);
  });

  it('scrubs when the drag starts on the playhead itself', () => {
    const node = track();
    pointer(playhead(), 'pointerdown', 30);
    expect(host.lastSeek).toBe(15);
    pointer(node, 'pointermove', 90);
    expect(host.lastSeek).toBe(45);
  });

  it('renders the playhead under the pointer before the player reports back', async () => {
    // currentTime stays at 25 the whole time: a real player only echoes the new
    // position after the seek round-trips, and the embed player polls at 200ms.
    // Without a local scrub position the playhead would visibly lag the cursor.
    pointer(track(), 'pointerdown', 120);
    await fixture.whenStable();
    expect(playhead().style.left).toBe('60%');
    expect(host.currentTime()).toBe(25);
  });

  it('hands the playhead back to the player once the drag ends', async () => {
    const node = track();
    pointer(node, 'pointerdown', 120);
    pointer(node, 'pointerup', 120);
    await fixture.whenStable();
    expect(playhead().style.left).toBe('25%');
  });

  // The playhead may only sit on frames the clip will actually contain, so the
  // selection — not the video — bounds it.
  it('will not scrub past the start marker', () => {
    pointer(track(), 'pointerdown', 4); // 2s, well before markIn at 10s
    expect(host.lastSeek).toBe(10);
  });

  it('will not scrub past the end marker', () => {
    pointer(track(), 'pointerdown', 180); // 90s, well past markOut at 60s
    expect(host.lastSeek).toBe(60);
  });

  it('pins the rendered playhead to the selection when the player is outside it', async () => {
    host.currentTime.set(2);
    await fixture.whenStable();
    expect(playhead().style.left).toBe('10%');

    host.currentTime.set(90);
    await fixture.whenStable();
    expect(playhead().style.left).toBe('60%');
  });

  it('keeps arrow keys, Home and End inside the selection', async () => {
    const head = playhead();
    host.currentTime.set(10); // sitting on markIn
    await fixture.whenStable();
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(host.lastSeek).toBe(10);

    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(host.lastSeek).toBe(10);

    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(host.lastSeek).toBe(60);
  });

  it('pulls the playhead along when a marker is dragged past it', () => {
    // currentTime is 25s; dragging the in-marker to 40s strands the playhead
    // outside the selection, so it has to come with it.
    const component = fixture.debugElement.children[0].componentInstance as TrimTimeline;
    component.dragTo('in', 80, { left: 0, width: 200 });
    expect(host.markIn()).toBeCloseTo(40);
    expect(host.lastSeek).toBeCloseTo(40);
  });

  describe('scrub thumbnails', () => {
    const frameImg = (which: 'in' | 'out'): HTMLImageElement | null =>
      el().querySelector(`.handle-${which} .chip-frame`);

    /** Arms the feature. No video exists until a drag actually needs one. */
    const armPreview = async (src = '/api/videos/abc/stream'): Promise<void> => {
      host.previewSrc.set(src);
      await fixture.whenStable();
    };

    const grabHandle = async (which: 'in' | 'out', clientX: number): Promise<FakeFrames> => {
      pointer(handle(which), 'pointerdown', clientX);
      await fixture.whenStable();
      return FakeFrames.last!;
    };

    it('builds no video until a drag needs one', async () => {
      // Most visits never trim; an eager second <video> would refetch the file.
      await armPreview();
      expect(FakeFrames.last).toBeUndefined();

      await grabHandle('in', 20);
      expect(FakeFrames.last).toBeDefined();
    });

    it('asks for no frames at all without a preview source', async () => {
      // Quick mode plays through YouTube's iframe: unreadable, and the server
      // never downloaded the file, so there is nothing to grab.
      pointer(handle('in'), 'pointerdown', 40);
      await fixture.whenStable();
      expect(FakeFrames.last).toBeUndefined();
      expect(frameImg('in')).toBeNull();
    });

    it('previews the frame under the marker as it is dragged', async () => {
      await armPreview();
      const rect = { left: 0, width: 200 };
      const component = fixture.debugElement.children[0].componentInstance as TrimTimeline;

      const frames = await grabHandle('in', 20);
      component.dragTo('in', 60, rect);
      component.dragTo('in', 90, rect);
      await fixture.whenStable();

      // The grab itself previews the marker's current spot, then each move.
      expect(frames.requested).toEqual([10, 30, 45]);
    });

    it('previews where the marker landed, not where the pointer went', async () => {
      await armPreview();
      const frames = await grabHandle('in', 20);
      const component = fixture.debugElement.children[0].componentInstance as TrimTimeline;

      // 180px is 90s, past markOut at 60s, so the marker clamps below it.
      component.dragTo('in', 180, { left: 0, width: 200 });
      await fixture.whenStable();
      expect(frames.requested.at(-1)).toBe(host.markIn());
      expect(frames.requested.at(-1)).toBeLessThan(90);
    });

    it('shows the frame on the dragged handle only', async () => {
      await armPreview();
      const frames = await grabHandle('out', 120);
      frames.deliver();
      await fixture.whenStable();

      expect(frameImg('out')?.getAttribute('src')).toBe('data:image/jpeg;base64,FRAME');
      expect(frameImg('in')).toBeNull();
    });

    it('drops the thumbnail when the drag ends', async () => {
      await armPreview();
      const frames = await grabHandle('in', 40);
      frames.deliver();
      await fixture.whenStable();
      expect(frameImg('in')).not.toBeNull();

      handle('in').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      await fixture.whenStable();
      expect(frameImg('in')).toBeNull();
    });

    it('releases the old video when the source changes', async () => {
      await armPreview();
      const first = await grabHandle('in', 20);

      await armPreview('/api/videos/xyz/stream');
      expect(first.disposed).toBe(true);

      const second = await grabHandle('in', 20);
      expect(second).not.toBe(first);
      expect(second.src).toBe('/api/videos/xyz/stream');
    });
  });

  it('suppresses the focus ring for a mouse grab but restores it for the keyboard', async () => {
    pointer(track(), 'pointerdown', 120);
    await fixture.whenStable();
    expect(playhead().classList).toContain('pointer-focus');

    playhead().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(playhead().classList).not.toContain('pointer-focus');
  });

  it('does not scrub while a marker handle is being dragged', () => {
    pointer(handle('in'), 'pointerdown', 40);
    expect(host.lastSeek).toBeNull();
  });

  it('exposes the playhead as a slider bounded by the selection', () => {
    const head = playhead();
    expect(head.getAttribute('role')).toBe('slider');
    expect(head.getAttribute('aria-valuenow')).toBe('25');
    // The advertised range is the selection, not the whole video, so assistive
    // tech reports the same bounds the pointer and keyboard actually honour.
    expect(head.getAttribute('aria-valuemin')).toBe('10');
    expect(head.getAttribute('aria-valuemax')).toBe('60');

    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(host.lastSeek).toBeCloseTo(25.1);
  });

  it('drags the in-handle via pointer math without crossing the out-handle', () => {
    const component = fixture.debugElement.children[0].componentInstance as TrimTimeline;
    const trackRect = { left: 0, width: 200 };
    component.dragTo('in', 40, trackRect);
    expect(host.markIn()).toBeCloseTo(20);
    component.dragTo('in', 199, trackRect);
    expect(host.markIn()).toBeLessThan(host.markOut());
    component.dragTo('out', 300, trackRect);
    expect(host.markOut()).toBe(100);
  });
});
