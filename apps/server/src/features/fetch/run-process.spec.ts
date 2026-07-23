import { describe, it, expect } from 'vitest';
import {
  runProcess,
  ProcessStallError,
  ProcessTimeoutError,
  ProcessExitError,
} from './run-process';

describe('runProcess', () => {
  it('resolves with stdout on success', async () => {
    const result = await runProcess('sh', ['-c', 'echo hello']);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('rejects with ProcessExitError (code + stderr) on non-zero exit', async () => {
    await expect(
      runProcess('sh', ['-c', 'echo boom >&2; exit 3']),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ProcessExitError &&
        error.code === 3 &&
        error.stderr.includes('boom'),
    );
  });

  it('kills and rejects with ProcessStallError when no output arrives within stallMs', async () => {
    const start = Date.now();
    await expect(
      runProcess('sh', ['-c', 'sleep 10'], { onLine: () => {}, stallMs: 150 }),
    ).rejects.toBeInstanceOf(ProcessStallError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('resets the stall timer while output keeps coming', async () => {
    const lines: string[] = [];
    // Emits a line every ~50ms for ~250ms; stall window is 200ms so it must finish cleanly.
    const result = await runProcess(
      'sh',
      ['-c', 'for i in 1 2 3 4 5; do echo line$i; sleep 0.05; done'],
      { onLine: (l) => lines.push(l), stallMs: 200 },
    );
    expect(lines.length).toBe(5);
    expect(result.stdout).toBe('');
  });

  it('treats stderr output as alive (ffmpeg-style progress resets the stall timer)', async () => {
    // Emits only on stderr every ~50ms for ~250ms; stall window 200ms → must finish.
    const result = await runProcess(
      'sh',
      ['-c', 'for i in 1 2 3 4 5; do echo e$i >&2; sleep 0.05; done'],
      { onLine: () => {}, stallMs: 200 },
    );
    expect(result.stdout).toBe('');
  });

  it('kills and rejects with ProcessTimeoutError past the hard cap', async () => {
    const start = Date.now();
    await expect(
      runProcess('sh', ['-c', 'sleep 10'], { timeoutMs: 150 }),
    ).rejects.toBeInstanceOf(ProcessTimeoutError);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
