import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { UserSessionStore } from './user-session.store';

describe('UserSessionStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cropcorn-auth-'));
    filePath = path.join(dir, 'auth.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('links a session to a user and resolves the user back', () => {
    const store = new UserSessionStore(filePath);
    store.upsertUser({
      userId: 'u1',
      name: 'Alice TV',
      tokens: { refresh_token: 'r1' },
    });
    store.linkSession('sid-1', 'u1');

    expect(store.userIdForSession('sid-1')).toBe('u1');
    expect(store.getUserBySession('sid-1')?.name).toBe('Alice TV');
  });

  it('keeps sessions isolated between users', () => {
    const store = new UserSessionStore(filePath);
    store.upsertUser({
      userId: 'u1',
      name: 'Alice',
      tokens: { refresh_token: 'a' },
    });
    store.upsertUser({
      userId: 'u2',
      name: 'Bob',
      tokens: { refresh_token: 'b' },
    });
    store.linkSession('sid-a', 'u1');
    store.linkSession('sid-b', 'u2');

    expect(store.getUserBySession('sid-a')?.name).toBe('Alice');
    expect(store.getUserBySession('sid-b')?.name).toBe('Bob');
  });

  it('persists across reloads (tokens survive a restart)', () => {
    const first = new UserSessionStore(filePath);
    first.upsertUser({
      userId: 'u1',
      name: 'Alice',
      tokens: { refresh_token: 'r1' },
    });
    first.linkSession('sid-1', 'u1');

    const reloaded = new UserSessionStore(filePath);
    expect(reloaded.getUserBySession('sid-1')?.tokens).toEqual({
      refresh_token: 'r1',
    });
  });

  it('updates tokens for a user without disturbing the session link', () => {
    const store = new UserSessionStore(filePath);
    store.upsertUser({
      userId: 'u1',
      name: 'Alice',
      tokens: { refresh_token: 'r1' },
    });
    store.linkSession('sid-1', 'u1');

    store.updateTokens('u1', { refresh_token: 'r1', access_token: 'a2' });
    expect(store.getUserBySession('sid-1')?.tokens).toEqual({
      refresh_token: 'r1',
      access_token: 'a2',
    });
  });

  it('unlinks a session on sign out but keeps the stored user', () => {
    const store = new UserSessionStore(filePath);
    store.upsertUser({
      userId: 'u1',
      name: 'Alice',
      tokens: { refresh_token: 'r1' },
    });
    store.linkSession('sid-1', 'u1');

    store.unlinkSession('sid-1');
    expect(store.userIdForSession('sid-1')).toBeUndefined();
    expect(store.getUserBySession('sid-1')).toBeUndefined();
  });

  it('returns undefined for unknown sessions', () => {
    const store = new UserSessionStore(filePath);
    expect(store.userIdForSession('nope')).toBeUndefined();
    expect(store.getUserBySession('nope')).toBeUndefined();
  });
});
