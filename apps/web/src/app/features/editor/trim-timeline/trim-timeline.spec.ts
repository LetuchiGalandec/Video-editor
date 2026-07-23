import { Component, signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TrimTimeline } from './trim-timeline';

@Component({
  imports: [TrimTimeline],
  template: `<app-trim-timeline
    [duration]="duration()"
    [currentTime]="currentTime()"
    [(markIn)]="markIn"
    [(markOut)]="markOut"
    (seek)="lastSeek = $event"
  />`,
})
class Host {
  readonly duration = signal(100);
  readonly currentTime = signal(25);
  readonly markIn = signal(10);
  readonly markOut = signal(60);
  lastSeek: number | null = null;
}

describe('TrimTimeline', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const handle = (which: 'in' | 'out'): HTMLElement =>
    el().querySelector(`.handle-${which}`) as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
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
    const track = el().querySelector('.track') as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }) as DOMRect;
    track.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
    expect(host.lastSeek).toBe(50);
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
