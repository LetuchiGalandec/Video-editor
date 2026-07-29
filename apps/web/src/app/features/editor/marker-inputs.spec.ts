import { TestBed, ComponentFixture } from '@angular/core/testing';
import { MarkerInputs } from './marker-inputs';
import { EditorStore } from './editor-store';

describe('MarkerInputs', () => {
  let fixture: ComponentFixture<MarkerInputs>;
  let store: EditorStore;

  const field = (which: 'in' | 'out'): HTMLInputElement =>
    (fixture.nativeElement as HTMLElement).querySelector(`#mark-${which}`) as HTMLInputElement;

  const press = (el: HTMLInputElement, key: string, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkerInputs],
      providers: [EditorStore],
    }).compileComponents();
    fixture = TestBed.createComponent(MarkerInputs);
    store = TestBed.inject(EditorStore);
    store.duration.set(100);
    store.markIn.set(10);
    store.markOut.set(60);
    await fixture.whenStable();
  });

  it('steps a tenth of a second with the up and down arrows', async () => {
    press(field('in'), 'ArrowUp');
    await fixture.whenStable();
    expect(store.markIn()).toBeCloseTo(10.1);
    expect(field('in').value).toBe('0:10.1');

    press(field('in'), 'ArrowDown');
    press(field('in'), 'ArrowDown');
    await fixture.whenStable();
    expect(store.markIn()).toBeCloseTo(9.9);
  });

  it('steps a whole second with shift', async () => {
    press(field('out'), 'ArrowUp', true);
    await fixture.whenStable();
    expect(store.markOut()).toBeCloseTo(61);
  });

  it('drives the shared store, so the timeline and length follow along', async () => {
    const length = (): string =>
      (
        (fixture.nativeElement as HTMLElement).querySelector('.length-value') as HTMLElement
      ).textContent!.trim();
    expect(length()).toBe('0:50.0');

    press(field('in'), 'ArrowUp', true); // start 10 -> 11
    await fixture.whenStable();
    // The field, the store and everything computed from it stay in step; the
    // timeline draws the handles from these same signals.
    expect(store.markIn()).toBeCloseTo(11);
    expect(field('in').value).toBe('0:11.0');
    expect(length()).toBe('0:49.0');
  });

  it('jumps ten seconds with the page keys', async () => {
    press(field('out'), 'PageDown');
    await fixture.whenStable();
    expect(store.markOut()).toBeCloseTo(50);
  });

  it('swallows the keystroke so the caret does not jump', () => {
    expect(press(field('in'), 'ArrowUp').defaultPrevented).toBe(true);
    // Horizontal arrows still belong to the field.
    expect(press(field('in'), 'ArrowLeft').defaultPrevented).toBe(false);
  });

  it('refuses to step the start past the end', async () => {
    store.markIn.set(59.9);
    await fixture.whenStable();
    press(field('in'), 'ArrowUp', true); // +1s would cross markOut
    await fixture.whenStable();
    expect(store.markIn()).toBeLessThan(store.markOut());
  });

  it('refuses to step below zero', async () => {
    store.markIn.set(0.1);
    await fixture.whenStable();
    press(field('in'), 'ArrowDown', true);
    await fixture.whenStable();
    expect(store.markIn()).toBe(0);
  });

  it('steps from what is typed in the field, not the stale model', async () => {
    const el = field('in');
    el.value = '0:30.0'; // typed but not yet committed
    press(el, 'ArrowUp');
    await fixture.whenStable();
    expect(store.markIn()).toBeCloseTo(30.1);
  });

  it('restores the committed value on Escape', async () => {
    const el = field('in');
    el.value = 'nonsense';
    press(el, 'Escape');
    await fixture.whenStable();
    expect(el.value).toBe('0:10.0');
    expect(store.markIn()).toBe(10);
  });
});
