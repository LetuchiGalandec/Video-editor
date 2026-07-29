import { describe, it, expect, vi } from 'vitest';
import { LatestWins } from './frame-grabber';

describe('LatestWins', () => {
  it('runs the first request immediately', () => {
    const run = vi.fn();
    new LatestWins(run).request(5);
    expect(run).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('collapses everything requested mid-flight down to the newest', () => {
    // A drag emits a request per pointermove, but a seek takes far longer than
    // a mouse moves. Queueing them would leave the thumbnail chasing the
    // cursor through every stale position it already passed.
    const run = vi.fn();
    const queue = new LatestWins(run);
    queue.request(1);
    queue.request(2);
    queue.request(3);
    queue.request(4);
    expect(run).toHaveBeenCalledExactlyOnceWith(1);

    queue.settle();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(4);
  });

  it('goes idle once the backlog is drained', () => {
    const run = vi.fn();
    const queue = new LatestWins(run);
    queue.request(1);
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);

    // Nothing outstanding, so settling again must not re-run anything.
    queue.settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts flowing again after going idle', () => {
    const run = vi.fn();
    const queue = new LatestWins(run);
    queue.request(1);
    queue.settle();
    queue.request(9);
    expect(run).toHaveBeenLastCalledWith(9);
  });

  it('stops dispatching once cancelled', () => {
    const run = vi.fn();
    const queue = new LatestWins(run);
    queue.request(1);
    queue.cancel();
    queue.settle();
    queue.request(2);
    expect(run).toHaveBeenCalledExactlyOnceWith(1);
  });
});
