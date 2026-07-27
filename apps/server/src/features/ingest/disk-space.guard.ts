import { statfs } from 'node:fs/promises';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';

/**
 * Never consumed by uploads. A disk that reaches 0 bytes takes the whole
 * server down — jobs, logs and OAuth token writes all fail — so the guard
 * refuses well before that point.
 */
export const DISK_HEADROOM_BYTES = 2 * 1024 ** 3;

/**
 * Trimming writes a re-encoded output alongside the source, so a stored
 * upload transiently costs roughly twice its own size.
 */
const WORKING_COPY_FACTOR = 2;

export interface DiskSpaceCheck {
  /** Free bytes on the data volume, or null when it could not be read. */
  freeBytes: number | null;
  /** Size of the incoming upload, or null when the client did not declare it. */
  incomingBytes: number | null;
}

/**
 * Whether an upload fits with room to process it. Fails closed: an unreadable
 * free-space figure is treated as "no room", because guessing wrong fills the
 * disk and takes the service down.
 */
export function hasRoomFor({
  freeBytes,
  incomingBytes,
}: DiskSpaceCheck): boolean {
  if (freeBytes === null) {
    return false;
  }
  const required =
    (incomingBytes ?? 0) * WORKING_COPY_FACTOR + DISK_HEADROOM_BYTES;
  return freeBytes > required;
}

/** Free bytes on the filesystem holding `dir`, or null if it cannot be read. */
export async function freeBytesFor(dir: string): Promise<number | null> {
  try {
    const stats = await statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

/**
 * Rejects uploads the data volume cannot absorb, with 507 Insufficient
 * Storage. Runs as a guard rather than inside the handler because guards
 * execute before interceptors — by the time FileInterceptor has run, multer
 * has already written the payload to disk, which is the thing being prevented.
 */
@Injectable()
export class DiskSpaceGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const declared = Number.parseInt(
      request.headers['content-length'] ?? '',
      10,
    );
    const incomingBytes = Number.isFinite(declared) ? declared : null;
    const freeBytes = await freeBytesFor(this.config.dataDir);

    if (!hasRoomFor({ freeBytes, incomingBytes })) {
      throw new HttpException(
        'The server is low on disk space, so this upload was refused. Please try again later.',
        HttpStatus.INSUFFICIENT_STORAGE,
      );
    }
    return true;
  }
}
