import { describe, it, expect, beforeEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { JobStore } from './job-store';
import type { Job } from './job.model';

describe('JobStore', () => {
  let store: JobStore;

  beforeEach(() => {
    store = new JobStore();
  });

  it('creates a queued job with zero progress', () => {
    const job = store.create('download');
    expect(job.state).toBe('queued');
    expect(job.progress).toBe(0);
    expect(job.type).toBe('download');
    expect(store.get(job.id)).toEqual(job);
  });

  it('patches state and progress immutably', () => {
    const job = store.create('download');
    const updated = store.patch(job.id, { state: 'running', progress: 40 });
    expect(updated.state).toBe('running');
    expect(updated.progress).toBe(40);
    expect(job.progress).toBe(0);
  });

  it('clamps progress to 0..100', () => {
    const job = store.create('clip');
    expect(store.patch(job.id, { progress: 150 }).progress).toBe(100);
    expect(store.patch(job.id, { progress: -5 }).progress).toBe(0);
  });

  it('rejects transitions out of terminal states', () => {
    const job = store.create('download');
    store.patch(job.id, { state: 'done' });
    expect(() => store.patch(job.id, { state: 'running' })).toThrow();
  });

  it('throws when patching an unknown job id', () => {
    expect(() => store.patch('nope', { progress: 1 })).toThrow();
    expect(store.get('nope')).toBeUndefined();
  });

  it('watch replays the latest state to new subscribers', async () => {
    const job = store.create('download');
    store.patch(job.id, { state: 'running', progress: 10 });
    const first = await firstValueFrom(store.watch(job.id));
    expect(first.progress).toBe(10);
  });

  it('watch completes when the job reaches a terminal state', async () => {
    const job = store.create('download');
    const events: Job[] = [];
    const completion = new Promise<void>((resolve) => {
      store.watch(job.id).subscribe({
        next: (j) => events.push(j),
        complete: () => resolve(),
      });
    });
    store.patch(job.id, { state: 'running', progress: 50 });
    store.patch(job.id, { state: 'done', progress: 100 });
    await completion;
    expect(events.at(-1)?.state).toBe('done');
  });

  it('lists all jobs and removes a job with its subject', () => {
    const a = store.create('download');
    const b = store.create('clip');
    expect(store.list().map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    store.remove(a.id);
    expect(store.get(a.id)).toBeUndefined();
    expect(store.list()).toHaveLength(1);
  });
});
