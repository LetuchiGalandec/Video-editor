import { describe, it, expect, beforeEach } from 'vitest';
import { JobStore } from './job-store';
import { JobQueue } from './job-queue';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('JobQueue', () => {
  let store: JobStore;
  let queue: JobQueue;

  beforeEach(() => {
    store = new JobStore();
    queue = new JobQueue(store);
  });

  it('runs at most two jobs concurrently and starts queued work as slots free', async () => {
    const resolvers: Array<() => void> = [];
    const work = (): Promise<void> =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      });
    const a = store.create('download');
    const b = store.create('download');
    const c = store.create('download');
    queue.schedule(a.id, work);
    queue.schedule(b.id, work);
    queue.schedule(c.id, work);
    await tick();
    expect(store.get(a.id)?.state).toBe('running');
    expect(store.get(b.id)?.state).toBe('running');
    expect(store.get(c.id)?.state).toBe('queued');

    resolvers[0]();
    await tick();
    expect(store.get(a.id)?.state).toBe('done');
    expect(store.get(c.id)?.state).toBe('running');
  });

  it('marks a successful job done with progress 100', async () => {
    const job = store.create('clip');
    queue.schedule(job.id, async () => {});
    await tick();
    expect(store.get(job.id)?.state).toBe('done');
    expect(store.get(job.id)?.progress).toBe(100);
  });

  it('marks a failing job as error with the thrown message', async () => {
    const job = store.create('download');
    queue.schedule(job.id, async () => {
      throw new Error('boom');
    });
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
    expect(store.get(job.id)?.error).toBe('boom');
  });

  it('frees the slot after a failure so waiting work still runs', async () => {
    const blockers: Array<() => void> = [];
    const block = (): Promise<void> =>
      new Promise((resolve) => {
        blockers.push(resolve);
      });
    const a = store.create('download');
    const b = store.create('download');
    const c = store.create('download');
    queue.schedule(a.id, block);
    queue.schedule(b.id, async () => {
      throw new Error('dead');
    });
    queue.schedule(c.id, async () => {});
    await tick();
    expect(store.get(c.id)?.state).toBe('done');
    blockers[0]();
  });
});
