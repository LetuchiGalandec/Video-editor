import { readdir, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { JobStore } from './job-store';
import { isTerminal } from './job.model';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const DATA_KINDS = ['videos', 'clips'] as const;

/**
 * Disk lifecycle: every 10 minutes, deletes fetched videos, clips (including
 * any stray yt-dlp .part files inside their directories) and finished job
 * records older than TTL_MINUTES.
 */
@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly store: JobStore,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async sweep(now: number = Date.now()): Promise<void> {
    const cutoff = now - this.config.ttlMinutes * 60 * 1000;

    for (const kind of DATA_KINDS) {
      const baseDir = path.join(this.config.dataDir, kind);
      const entries = await readdir(baseDir, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const dir = path.join(baseDir, entry.name);
        try {
          const info = await stat(dir);
          if (info.mtimeMs < cutoff) {
            await rm(dir, { recursive: true, force: true });
            this.logger.log(`Swept expired ${kind.slice(0, -1)} ${entry.name}`);
          }
        } catch {
          // Directory vanished mid-sweep — nothing to do.
        }
      }
    }

    for (const job of this.store.list()) {
      if (isTerminal(job.state) && job.updatedAt < cutoff) {
        this.store.remove(job.id);
      }
    }
  }
}
