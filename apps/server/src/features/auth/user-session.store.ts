import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export type TokenSet = Record<string, unknown>;

export interface StoredUser {
  /** Stable identity for the account — the YouTube channel id. */
  userId: string;
  /** Channel title, shown in the UI ("Signed in as …"). */
  name: string;
  tokens: TokenSet;
}

interface AuthFile {
  sessions: Record<string, string>;
  users: Record<string, StoredUser>;
}

const FILE_MODE = 0o600;

/**
 * Persistent multi-user store: maps browser sessions to accounts and holds each
 * account's OAuth tokens. Backed by a single 0600 JSON file so signed-in users
 * survive a restart. Writes are synchronous — fine for a local, single-instance
 * tool and free of interleaving races.
 */
export class UserSessionStore {
  private data: AuthFile = { sessions: {}, users: {} };

  constructor(private readonly filePath: string) {
    this.load();
  }

  linkSession(sessionId: string, userId: string): void {
    this.data.sessions[sessionId] = userId;
    this.persist();
  }

  unlinkSession(sessionId: string): void {
    delete this.data.sessions[sessionId];
    this.persist();
  }

  userIdForSession(sessionId: string): string | undefined {
    return this.data.sessions[sessionId];
  }

  upsertUser(user: StoredUser): void {
    this.data.users[user.userId] = user;
    this.persist();
  }

  getUser(userId: string): StoredUser | undefined {
    return this.data.users[userId];
  }

  getUserBySession(sessionId: string): StoredUser | undefined {
    const userId = this.userIdForSession(sessionId);
    return userId ? this.data.users[userId] : undefined;
  }

  updateTokens(userId: string, tokens: TokenSet): void {
    const user = this.data.users[userId];
    if (!user) {
      return;
    }
    this.data.users[userId] = { ...user, tokens };
    this.persist();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AuthFile>;
      this.data = {
        sessions: parsed.sessions ?? {},
        users: parsed.users ?? {},
      };
    } catch {
      // No file yet — start empty.
    }
  }

  private persist(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), { mode: FILE_MODE });
  }
}
