import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

export interface RunProcessOptions {
  /** Called per stdout line. Presence enables stall detection (see stallMs). */
  onLine?: (line: string) => void;
  /** Kill the process if no stdout line arrives within this window (ms). */
  stallMs?: number;
  /** Hard wall-clock cap (ms) regardless of output. */
  timeoutMs?: number;
}

export interface RunProcessResult {
  stdout: string;
}

export class ProcessStallError extends Error {
  constructor() {
    super('Process stalled (no output within the stall window)');
    this.name = 'ProcessStallError';
  }
}

export class ProcessTimeoutError extends Error {
  constructor() {
    super('Process exceeded its time limit');
    this.name = 'ProcessTimeoutError';
  }
}

export class ProcessExitError extends Error {
  constructor(
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(stderr || `Process exited with code ${code}`);
    this.name = 'ProcessExitError';
  }
}

/**
 * Spawns a process with two independent safety nets: a stall watchdog (reset on
 * every stdout line) and a hard timeout. Either one kills the child and rejects,
 * so a wedged download can never hold a worker slot forever. The stall watchdog
 * is the important one for streaming downloads — yt-dlp emits a progress line
 * roughly every second, so a long silence means the transfer is dead.
 */
export function runProcess(
  binary: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let overallTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = (): void => {
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      if (overallTimer) {
        clearTimeout(overallTimer);
      }
    };

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      action();
    };

    const kill = (): void => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Process already gone.
      }
    };

    const armStall = (): void => {
      if (!options.stallMs) {
        return;
      }
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      stallTimer = setTimeout(() => {
        kill();
        settle(() => reject(new ProcessStallError()));
      }, options.stallMs);
    };

    if (options.timeoutMs) {
      overallTimer = setTimeout(() => {
        kill();
        settle(() => reject(new ProcessTimeoutError()));
      }, options.timeoutMs);
    }
    armStall();

    if (options.onLine) {
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        armStall();
        options.onLine?.(line);
      });
    } else {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      // Section downloads transfer through ffmpeg, which reports progress on
      // stderr — treat any output as "still alive" so the watchdog only fires
      // on a genuine stall (no output on either stream).
      armStall();
    });

    child.on('error', (error) =>
      settle(() => reject(new ProcessExitError(null, error.message))),
    );
    child.on('close', (code) => {
      if (code === 0) {
        settle(() => resolve({ stdout }));
      } else {
        settle(() => reject(new ProcessExitError(code, stderr)));
      }
    });
  });
}
