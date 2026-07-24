# Own-Footage Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload their own video file, which the server normalizes to browser-playable MP4, then crop and download it — reusing the entire existing editor/clip/download pipeline.

**Architecture:** Add one ingest path (`POST /api/videos` multipart → probe → remux-or-transcode → `videos/<UUID>/source.mp4`) that produces the same on-disk shape a YouTube download produces, so `/edit/:videoId` → meta → stream → trim → ffmpeg cut → download all work unchanged. A `youtubeEnabled` config flag hides/disables the YouTube path for the public build. Upload progress is client-side (HTTP upload events); normalize progress reuses the existing JobStore/SSE machinery.

**Tech Stack:** NestJS 11, `@nestjs/platform-express` + `multer` (disk storage) for uploads, `ffmpeg-static`/`ffprobe-static`, Angular 22 (standalone, signals, zoneless), Vitest (both workspaces), Playwright e2e.

## Global Constraints

- **Server:** NestJS 11, feature-module layout under `apps/server/src/features/<feature>/`. Each feature has a `*.module.ts`; register it in `apps/server/src/app.module.ts` imports. Config is injected via `@Inject(APP_CONFIG)` (token from `apps/server/src/config/config.ts`), which is `@Global`.
- **Web:** Angular 22 standalone components, signals, `inject()`; no NgModules; `@if`/`@for` control flow; global API prefix is `/api` (proxied to `:3000`).
- **IDs & paths:** filesystem paths use only server-generated UUIDs (`assertJobId`) + fixed names (`source.mp4`, `info.json`). Never build a path from a user-supplied filename.
- **Job lifecycle:** `JobQueue.schedule(jobId, work)` sets `running`, then `done`/`100` on success or `error` on throw. Work functions only patch `progress` and `result` — never set terminal state themselves.
- **Env var names / defaults (exact):** `MAX_UPLOAD_BYTES` (default `2147483648` = 2 GiB), `MAX_UPLOAD_DURATION_SEC` (default `7200`), `YOUTUBE_ENABLED` (default `true`; the string `'false'` disables).
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit. Conventional-commit messages. No attribution trailer (disabled globally).
- **Test commands:** server `npm run test -w apps/server`; web `npm run test -w apps/web`; e2e `npm run e2e`.

---

## File Structure

**New (server):**
- `apps/server/src/features/ingest/ingest-args.ts` — `isBrowserPlayable()` predicate (pure).
- `apps/server/src/features/ingest/ingest-args.spec.ts`
- `apps/server/src/features/ingest/ingest.service.ts` — orchestrates probe → normalize → info.json.
- `apps/server/src/features/ingest/ingest.service.spec.ts`
- `apps/server/src/features/ingest/ingest.controller.ts` — `POST /api/videos`.
- `apps/server/src/features/ingest/public-config.controller.ts` — `GET /api/config`.
- `apps/server/src/features/ingest/multer-error.filter.ts` — maps multer size/format errors to 413/400.
- `apps/server/src/features/ingest/ingest.module.ts` — `MulterModule.registerAsync` + wiring.

**Modified (server):**
- `apps/server/src/config/config.ts` — `+maxUploadBytes, +maxUploadDurationSec, +youtubeEnabled`.
- `apps/server/src/config/config.spec.ts` — new/extended.
- `apps/server/src/features/videos/probe.service.ts` — `MediaProbe` gains `videoCodec/audioCodec/container`.
- `apps/server/src/features/videos/probe.service.spec.ts` — new/extended.
- `apps/server/src/features/clips/ffmpeg-args.ts` — `+NormalizeArgsInput, +buildNormalizeArgs`.
- `apps/server/src/features/clips/ffmpeg-args.spec.ts` — extended.
- `apps/server/src/features/clips/ffmpeg.service.ts` — `+normalize()`.
- `apps/server/src/features/clips/clips.module.ts` — export `FfmpegService`.
- `apps/server/src/features/jobs/job.model.ts` — `JobType` gains `'ingest'`.
- `apps/server/src/features/fetch/downloads.controller.ts` + `resolve.controller.ts` — gate on `youtubeEnabled`.
- `apps/server/src/app.module.ts` — import `IngestModule`.

**Modified (web):**
- `apps/web/src/app/core/api.models.ts` — `JobType` gains `'ingest'`.
- `apps/web/src/app/core/api.service.ts` — `+PublicConfig, +UploadEvent, +getConfig(), +uploadVideo()`.
- `apps/web/src/app/core/api.service.spec.ts` — new/extended.
- `apps/web/src/app/features/fetch/fetch-page.ts` — source toggle + upload flow.
- `apps/web/src/app/features/fetch/fetch-page.html` — upload UI.
- `apps/web/src/app/features/fetch/fetch-page.scss` — dropzone styles.
- `apps/web/src/app/features/fetch/fetch-page.spec.ts` — new/extended.

**New (e2e):**
- `e2e/tests/upload.spec.ts` — API + UI upload journeys.

---

## Task 1: Config fields for uploads + YouTube flag

**Files:**
- Modify: `apps/server/src/config/config.ts`
- Test: `apps/server/src/config/config.spec.ts`

**Interfaces:**
- Produces: `AppConfig.maxUploadBytes: number`, `AppConfig.maxUploadDurationSec: number`, `AppConfig.youtubeEnabled: boolean`.

- [ ] **Step 1: Write the failing test**

Create/extend `apps/server/src/config/config.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig upload/youtube settings', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults uploads to 2 GiB / 2 hours and YouTube enabled', () => {
    delete process.env.MAX_UPLOAD_BYTES;
    delete process.env.MAX_UPLOAD_DURATION_SEC;
    delete process.env.YOUTUBE_ENABLED;
    const config = loadConfig();
    expect(config.maxUploadBytes).toBe(2147483648);
    expect(config.maxUploadDurationSec).toBe(7200);
    expect(config.youtubeEnabled).toBe(true);
  });

  it('reads overrides and disables YouTube only on the string "false"', () => {
    process.env.MAX_UPLOAD_BYTES = '1048576';
    process.env.MAX_UPLOAD_DURATION_SEC = '600';
    process.env.YOUTUBE_ENABLED = 'false';
    const config = loadConfig();
    expect(config.maxUploadBytes).toBe(1048576);
    expect(config.maxUploadDurationSec).toBe(600);
    expect(config.youtubeEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server -- config.spec`
Expected: FAIL — `maxUploadBytes` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/server/src/config/config.ts`, add to the `AppConfig` interface:

```ts
  maxUploadBytes: number;
  maxUploadDurationSec: number;
  youtubeEnabled: boolean;
```

Add this constant near `FOUR_HOURS_SEC`:

```ts
const TWO_GIB = 2147483648;
const TWO_HOURS_SEC = 2 * 60 * 60;
```

Add to the object returned by `loadConfig()`:

```ts
    maxUploadBytes: intFromEnv(process.env.MAX_UPLOAD_BYTES, TWO_GIB),
    maxUploadDurationSec: intFromEnv(
      process.env.MAX_UPLOAD_DURATION_SEC,
      TWO_HOURS_SEC,
    ),
    youtubeEnabled: process.env.YOUTUBE_ENABLED !== 'false',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server -- config.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/config/config.ts apps/server/src/config/config.spec.ts
git commit -m "feat(config): upload limits and youtubeEnabled flag"
```

---

## Task 2: Probe returns codec + container info

**Files:**
- Modify: `apps/server/src/features/videos/probe.service.ts`
- Test: `apps/server/src/features/videos/probe.service.spec.ts`

**Interfaces:**
- Produces: `MediaProbe` gains `videoCodec: string`, `audioCodec: string`, `container: string` (all `''` when absent). Existing `durationSec/width/height` unchanged.

- [ ] **Step 1: Write the failing test**

Create/extend `apps/server/src/features/videos/probe.service.spec.ts` (probes the committed fixture — offline, deterministic):

```ts
import { describe, it, expect } from 'vitest';
import { ProbeService } from './probe.service';
import { loadConfig } from '../../config/config';

describe('ProbeService codec info', () => {
  it('reports h264/aac and an mp4-family container for the sample fixture', async () => {
    const probe = new ProbeService();
    const media = await probe.probe(loadConfig().fixturePath);
    expect(media.videoCodec).toBe('h264');
    expect(media.audioCodec).toBe('aac');
    expect(media.container.toLowerCase()).toContain('mp4');
    expect(media.durationSec).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server -- probe.service`
Expected: FAIL — `videoCodec` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/server/src/features/videos/probe.service.ts`:

Extend `MediaProbe`:

```ts
export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  container: string;
}
```

Extend the internal ffprobe output type:

```ts
interface FfprobeOutput {
  format?: { duration?: string; format_name?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }>;
}
```

Change the `-show_entries` argument value to:

```ts
      'format=duration,format_name:stream=codec_type,codec_name,width,height',
```

Replace the `return` in `probe()`:

```ts
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
    return {
      durationSec: Number.parseFloat(parsed.format?.duration ?? '0') || 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      videoCodec: video?.codec_name ?? '',
      audioCodec: audio?.codec_name ?? '',
      container: parsed.format?.format_name ?? '',
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w apps/server -- probe.service`
Expected: PASS.

- [ ] **Step 5: Verify no existing probe consumer broke**

Run: `npm run test -w apps/server`
Expected: PASS (added fields are additive; `videos`/`clips` specs still green).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/videos/probe.service.ts apps/server/src/features/videos/probe.service.spec.ts
git commit -m "feat(probe): expose video/audio codec and container"
```

---

## Task 3: Normalize decision + ffmpeg arg builder (pure)

**Files:**
- Create: `apps/server/src/features/ingest/ingest-args.ts`
- Test: `apps/server/src/features/ingest/ingest-args.spec.ts`
- Modify: `apps/server/src/features/clips/ffmpeg-args.ts`
- Test: `apps/server/src/features/clips/ffmpeg-args.spec.ts`

**Interfaces:**
- Produces: `isBrowserPlayable(p: { container: string; videoCodec: string; audioCodec: string }): boolean` (from `ingest-args.ts`).
- Produces: `NormalizeArgsInput { inputPath: string; outputPath: string; transcode: boolean }` and `buildNormalizeArgs(input: NormalizeArgsInput): string[]` (from `clips/ffmpeg-args.ts`).

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/features/ingest/ingest-args.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isBrowserPlayable } from './ingest-args';

describe('isBrowserPlayable', () => {
  it('accepts h264 + aac in an mp4-family container', () => {
    expect(
      isBrowserPlayable({ container: 'mov,mp4,m4a,3gp', videoCodec: 'h264', audioCodec: 'aac' }),
    ).toBe(true);
  });

  it('accepts h264 with no audio', () => {
    expect(
      isBrowserPlayable({ container: 'mp4', videoCodec: 'h264', audioCodec: '' }),
    ).toBe(true);
  });

  it('rejects HEVC (iPhone default)', () => {
    expect(
      isBrowserPlayable({ container: 'mov,mp4,m4a', videoCodec: 'hevc', audioCodec: 'aac' }),
    ).toBe(false);
  });

  it('rejects VP9 in webm', () => {
    expect(
      isBrowserPlayable({ container: 'matroska,webm', videoCodec: 'vp9', audioCodec: 'opus' }),
    ).toBe(false);
  });

  it('rejects h264 with a non-aac audio codec', () => {
    expect(
      isBrowserPlayable({ container: 'mp4', videoCodec: 'h264', audioCodec: 'mp3' }),
    ).toBe(false);
  });
});
```

Extend `apps/server/src/features/clips/ffmpeg-args.spec.ts` with:

```ts
import { buildNormalizeArgs } from './ffmpeg-args';

describe('buildNormalizeArgs', () => {
  it('remuxes with stream copy when transcode is false', () => {
    const args = buildNormalizeArgs({ inputPath: 'in.mkv', outputPath: 'out.mp4', transcode: false });
    expect(args).toEqual([
      '-y', '-i', 'in.mkv',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats', '-loglevel', 'error',
      'out.mp4',
    ]);
  });

  it('re-encodes to h264/aac when transcode is true', () => {
    const args = buildNormalizeArgs({ inputPath: 'in.mov', outputPath: 'out.mp4', transcode: true });
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args.slice(0, 3)).toEqual(['-y', '-i', 'in.mov']);
    expect(args).toContain('+faststart');
    expect(args).toContain('pipe:1');
    expect(args[args.length - 1]).toBe('out.mp4');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w apps/server -- ingest-args ffmpeg-args`
Expected: FAIL — `isBrowserPlayable`/`buildNormalizeArgs` not defined.

- [ ] **Step 3: Implement `ingest-args.ts`**

Create `apps/server/src/features/ingest/ingest-args.ts`:

```ts
const MP4_FAMILY = ['mp4', 'mov', 'm4a', 'm4v'];
const H264_CODECS = ['h264', 'avc1'];
const AAC_CODECS = ['aac', 'mp4a'];

/**
 * True when a `<video>` tag can reliably play the file as-is (so we only need a
 * fast stream-copy remux). Cross-browser that means H.264 video in an
 * mp4/mov-family container, with either no audio or AAC audio. Everything else
 * (iPhone HEVC, VP9/webm, mp3-in-mp4, …) must be transcoded.
 */
export function isBrowserPlayable(p: {
  container: string;
  videoCodec: string;
  audioCodec: string;
}): boolean {
  const container = p.container.toLowerCase();
  const containerOk = MP4_FAMILY.some((c) => container.includes(c));
  const videoOk = H264_CODECS.includes(p.videoCodec.toLowerCase());
  const audioOk =
    p.audioCodec === '' || AAC_CODECS.includes(p.audioCodec.toLowerCase());
  return containerOk && videoOk && audioOk;
}
```

- [ ] **Step 4: Implement `buildNormalizeArgs`**

In `apps/server/src/features/clips/ffmpeg-args.ts`, append:

```ts
export interface NormalizeArgsInput {
  inputPath: string;
  outputPath: string;
  transcode: boolean;
}

/**
 * ffmpeg argv to normalize an uploaded file into a browser-playable mp4.
 * transcode=false → stream copy (near-instant); true → re-encode to h264/aac.
 * Both write +faststart so the moov atom is at the front for seekable streaming.
 */
export function buildNormalizeArgs(input: NormalizeArgsInput): string[] {
  const codecArgs = input.transcode
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k']
    : ['-c', 'copy'];
  return [
    '-y',
    '-i',
    input.inputPath,
    ...codecArgs,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-loglevel',
    'error',
    input.outputPath,
  ];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -w apps/server -- ingest-args ffmpeg-args`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/ingest/ingest-args.ts apps/server/src/features/ingest/ingest-args.spec.ts apps/server/src/features/clips/ffmpeg-args.ts apps/server/src/features/clips/ffmpeg-args.spec.ts
git commit -m "feat(ingest): normalize decision and ffmpeg arg builder"
```

---

## Task 4: FfmpegService.normalize + export FfmpegService

**Files:**
- Modify: `apps/server/src/features/clips/ffmpeg.service.ts`
- Modify: `apps/server/src/features/clips/clips.module.ts`
- Test: `apps/server/src/features/clips/ffmpeg.service.spec.ts`

**Interfaces:**
- Consumes: `buildNormalizeArgs`, `NormalizeArgsInput`, `parseFfmpegProgress` (from `./ffmpeg-args`).
- Produces: `FfmpegService.normalize(input: NormalizeArgsInput, durationSec: number, onProgress: (percent: number) => void): Promise<void>`; `FfmpegService` exported from `ClipsModule`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/features/clips/ffmpeg.service.spec.ts` (real ffmpeg on the tiny fixture — offline, fast):

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FfmpegService } from './ffmpeg.service';
import { loadConfig } from '../../config/config';

describe('FfmpegService.normalize', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('remuxes the sample fixture into a non-empty mp4', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cropcorn-normalize-'));
    const out = join(dir, 'source.mp4');
    const ffmpeg = new FfmpegService();
    await ffmpeg.normalize(
      { inputPath: loadConfig().fixturePath, outputPath: out, transcode: false },
      4,
      () => undefined,
    );
    expect((await stat(out)).size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server -- ffmpeg.service`
Expected: FAIL — `normalize` is not a function.

- [ ] **Step 3: Implement `normalize()`**

In `apps/server/src/features/clips/ffmpeg.service.ts`, update the import line and add the method.

Change:

```ts
import { buildClipArgs, parseFfmpegProgress } from './ffmpeg-args';
import type { ClipArgsInput } from './ffmpeg-args';
```

to:

```ts
import { buildClipArgs, buildNormalizeArgs, parseFfmpegProgress } from './ffmpeg-args';
import type { ClipArgsInput, NormalizeArgsInput } from './ffmpeg-args';
```

Add inside the class (after `cut`):

```ts
  /** Normalize an uploaded file to a browser-playable mp4, reporting 0-99%. */
  normalize(
    input: NormalizeArgsInput,
    durationSec: number,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const args = buildNormalizeArgs(input);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        const seconds = parseFfmpegProgress(line);
        if (seconds !== null && durationSec > 0) {
          onProgress(Math.min(99, (seconds / durationSec) * 100));
        }
      });
      child.on('error', (error) =>
        reject(new Error(`ffmpeg failed to start: ${error.message}`)),
      );
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `ffmpeg exited with ${code}: ${stderr.slice(-STDERR_TAIL_CHARS)}`,
            ),
          );
        }
      });
    });
  }
```

- [ ] **Step 4: Export FfmpegService from ClipsModule**

In `apps/server/src/features/clips/clips.module.ts`, change the exports line:

```ts
  exports: [ClipsService, FfmpegService],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server -- ffmpeg.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/clips/ffmpeg.service.ts apps/server/src/features/clips/ffmpeg.service.spec.ts apps/server/src/features/clips/clips.module.ts
git commit -m "feat(ffmpeg): normalize method and export service"
```

---

## Task 5: IngestService (orchestration) + `'ingest'` job type

**Files:**
- Modify: `apps/server/src/features/jobs/job.model.ts`
- Create: `apps/server/src/features/ingest/ingest.service.ts`
- Test: `apps/server/src/features/ingest/ingest.service.spec.ts`

**Interfaces:**
- Consumes: `JobStore`, `JobQueue`, `ProbeService`, `FfmpegService`, `isBrowserPlayable`, `APP_CONFIG`.
- Produces: `IngestService.ingest(tempPath: string, originalName: string): Promise<Job>` — creates an `'ingest'` job, returns it immediately; on completion the job's `result.videoId === job.id` and `videos/<id>/source.mp4` + `info.json` exist.

- [ ] **Step 1: Add the `'ingest'` job type**

In `apps/server/src/features/jobs/job.model.ts`, change:

```ts
export type JobType = 'download' | 'clip' | 'upload' | 'ingest';
```

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/features/ingest/ingest.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../jobs/job-store';
import { JobQueue } from '../jobs/job-queue';
import { IngestService } from './ingest.service';
import { loadConfig } from '../../config/config';
import type { ProbeService } from '../videos/probe.service';
import type { FfmpegService } from '../clips/ffmpeg.service';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe('IngestService', () => {
  let dataDir: string;
  let store: JobStore;
  let queue: JobQueue;
  let probe: { probe: ReturnType<typeof vi.fn> };
  let ffmpeg: { normalize: ReturnType<typeof vi.fn> };
  let service: IngestService;

  const playable = { durationSec: 5, width: 640, height: 360, videoCodec: 'h264', audioCodec: 'aac', container: 'mov,mp4,m4a' };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cropcorn-ingest-'));
    store = new JobStore();
    queue = new JobQueue(store);
    probe = { probe: vi.fn() };
    ffmpeg = { normalize: vi.fn().mockResolvedValue(undefined) };
    service = new IngestService(
      { ...loadConfig(), dataDir, maxUploadDurationSec: 60 },
      store,
      queue,
      probe as unknown as ProbeService,
      ffmpeg as unknown as FfmpegService,
    );
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  const makeTemp = async (name: string): Promise<string> => {
    const p = join(dataDir, name);
    await writeFile(p, 'x');
    return p;
  };

  it('remuxes a playable file, writes info.json, sets result.videoId, cleans temp', async () => {
    probe.probe.mockResolvedValue(playable);
    const temp = await makeTemp('in.mp4');
    const job = await service.ingest(temp, 'My Clip.mp4');
    await tick();
    expect(ffmpeg.normalize).toHaveBeenCalledWith(
      expect.objectContaining({ transcode: false }),
      5,
      expect.any(Function),
    );
    expect(store.get(job.id)?.state).toBe('done');
    expect(store.get(job.id)?.result?.videoId).toBe(job.id);
    const info = JSON.parse(await readFile(join(dataDir, 'videos', job.id, 'info.json'), 'utf-8'));
    expect(info.title).toBe('My Clip');
    await expect(stat(temp)).rejects.toThrow();
  });

  it('transcodes an HEVC file', async () => {
    probe.probe.mockResolvedValue({ ...playable, videoCodec: 'hevc' });
    const temp = await makeTemp('in.mov');
    await service.ingest(temp, 'iphone.mov');
    await tick();
    expect(ffmpeg.normalize).toHaveBeenCalledWith(
      expect.objectContaining({ transcode: true }),
      5,
      expect.any(Function),
    );
  });

  it('errors the job when the video is longer than the cap', async () => {
    probe.probe.mockResolvedValue({ ...playable, durationSec: 999 });
    const temp = await makeTemp('long.mp4');
    const job = await service.ingest(temp, 'long.mp4');
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
    expect(ffmpeg.normalize).not.toHaveBeenCalled();
  });

  it('errors the job when there is no video stream', async () => {
    probe.probe.mockResolvedValue({ durationSec: 0, width: 0, height: 0, videoCodec: '', audioCodec: '', container: '' });
    const temp = await makeTemp('note.bin');
    const job = await service.ingest(temp, 'note.bin');
    await tick();
    expect(store.get(job.id)?.state).toBe('error');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/server -- ingest.service`
Expected: FAIL — cannot find `./ingest.service`.

- [ ] **Step 4: Implement `ingest.service.ts`**

Create `apps/server/src/features/ingest/ingest.service.ts`:

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { FfmpegService } from '../clips/ffmpeg.service';
import { JobQueue } from '../jobs/job-queue';
import { JobStore } from '../jobs/job-store';
import type { Job } from '../jobs/job.model';
import { ProbeService } from '../videos/probe.service';
import { isBrowserPlayable } from './ingest-args';

const MAX_TITLE_LEN = 200;

/** Derive a display title from the upload's filename — never used as a path. */
function cleanTitle(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '');
  const cleaned = base.replace(/[\r\n\t]+/g, ' ').trim();
  return (cleaned || 'Uploaded video').slice(0, MAX_TITLE_LEN);
}

@Injectable()
export class IngestService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly store: JobStore,
    private readonly queue: JobQueue,
    private readonly probe: ProbeService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async ingest(tempPath: string, originalName: string): Promise<Job> {
    const job = this.store.create('ingest');
    const videoDir = path.join(this.config.dataDir, 'videos', job.id);
    this.queue.schedule(job.id, async () => {
      try {
        await mkdir(videoDir, { recursive: true });
        const media = await this.probe.probe(tempPath);
        if (media.width === 0 || media.height === 0 || media.durationSec === 0) {
          throw new BadRequestException(
            'That file has no playable video stream.',
          );
        }
        if (media.durationSec > this.config.maxUploadDurationSec) {
          const minutes = Math.round(this.config.maxUploadDurationSec / 60);
          throw new BadRequestException(
            `That video is longer than the ${minutes}-minute limit.`,
          );
        }
        const outputPath = path.join(videoDir, 'source.mp4');
        const transcode = !isBrowserPlayable(media);
        await this.ffmpeg.normalize(
          { inputPath: tempPath, outputPath, transcode },
          media.durationSec,
          (percent) => this.store.patch(job.id, { progress: percent }),
        );
        await writeFile(
          path.join(videoDir, 'info.json'),
          JSON.stringify(
            { title: cleanTitle(originalName), durationSec: media.durationSec },
            null,
            2,
          ),
        );
        this.store.patch(job.id, { result: { videoId: job.id } });
      } catch (error) {
        await rm(videoDir, { recursive: true, force: true });
        throw error;
      } finally {
        await rm(tempPath, { force: true });
      }
    });
    return job;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server -- ingest.service`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/jobs/job.model.ts apps/server/src/features/ingest/ingest.service.ts apps/server/src/features/ingest/ingest.service.spec.ts
git commit -m "feat(ingest): probe-and-normalize orchestration service"
```

---

## Task 6: Upload endpoint, config endpoint, module wiring

**Files:**
- Add dependency: `multer`, `@types/multer` to `apps/server`.
- Create: `apps/server/src/features/ingest/multer-error.filter.ts`
- Create: `apps/server/src/features/ingest/ingest.controller.ts`
- Create: `apps/server/src/features/ingest/public-config.controller.ts`
- Create: `apps/server/src/features/ingest/ingest.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Test: `e2e/tests/upload.spec.ts` (API portion)

**Interfaces:**
- Produces: `POST /api/videos` (multipart field `file`) → `202 { jobId }`; `413` oversize; `400` non-video/no-file. `GET /api/config` → `{ youtubeEnabled, maxUploadBytes, maxUploadDurationSec }`.

- [ ] **Step 1: Add the multer dependency**

Run:

```bash
npm install multer @types/multer -w apps/server
```

Expected: both appear in `apps/server/package.json`.

- [ ] **Step 2: Write the failing test (API upload journey)**

Create `e2e/tests/upload.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'http://localhost:3000';
const FIXTURE = join(__dirname, '..', '..', 'fixtures', 'sample.mp4');

test('GET /api/config returns upload settings', async ({ request }) => {
  const res = await request.get(`${API}/api/config`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.youtubeEnabled).toBe('boolean');
  expect(body.maxUploadBytes).toBeGreaterThan(0);
  expect(body.maxUploadDurationSec).toBeGreaterThan(0);
});

test('POST /api/videos ingests an uploaded file into a playable source', async ({ request }) => {
  const upload = await request.post(`${API}/api/videos`, {
    multipart: {
      file: { name: 'sample.mp4', mimeType: 'video/mp4', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(upload.status()).toBe(202);
  const { jobId } = await upload.json();
  expect(jobId).toBeTruthy();

  // Poll the job to completion.
  let state = 'queued';
  for (let i = 0; i < 40 && state !== 'done' && state !== 'error'; i++) {
    const job = await (await request.get(`${API}/api/jobs/${jobId}`)).json();
    state = job.state;
    if (state === 'done' || state === 'error') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(state).toBe('done');

  const meta = await request.get(`${API}/api/videos/${jobId}/meta`);
  expect(meta.status()).toBe(200);
  expect((await meta.json()).durationSec).toBeGreaterThan(0);
});

test('POST /api/videos rejects a non-video upload with 400', async ({ request }) => {
  const res = await request.post(`${API}/api/videos`, {
    multipart: {
      file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    },
  });
  expect(res.status()).toBe(400);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run e2e -- upload.spec`
Expected: FAIL — `GET /api/config` 404, `POST /api/videos` 404 (routes don't exist yet).

- [ ] **Step 4: Implement the multer error filter**

Create `apps/server/src/features/ingest/multer-error.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

/** Maps multer's own errors to friendly HTTP codes (size → 413, else → 400). */
@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const tooBig = exception.code === 'LIMIT_FILE_SIZE';
    const status = tooBig
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.BAD_REQUEST;
    res.status(status).json({
      statusCode: status,
      message: tooBig
        ? 'That file is larger than the upload limit.'
        : `Upload failed: ${exception.message}`,
    });
  }
}
```

- [ ] **Step 5: Implement the controllers**

Create `apps/server/src/features/ingest/ingest.controller.ts`:

```ts
import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestService } from './ingest.service';
import { MulterErrorFilter } from './multer-error.filter';

@Controller('videos')
@UseFilters(MulterErrorFilter)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ jobId: string }> {
    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }
    const job = await this.ingest.ingest(file.path, file.originalname);
    return { jobId: job.id };
  }
}
```

Create `apps/server/src/features/ingest/public-config.controller.ts`:

```ts
import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';

export interface PublicConfigDto {
  youtubeEnabled: boolean;
  maxUploadBytes: number;
  maxUploadDurationSec: number;
}

@Controller('config')
export class PublicConfigController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  get(): PublicConfigDto {
    return {
      youtubeEnabled: this.config.youtubeEnabled,
      maxUploadBytes: this.config.maxUploadBytes,
      maxUploadDurationSec: this.config.maxUploadDurationSec,
    };
  }
}
```

- [ ] **Step 6: Implement the module (DI-driven multer config)**

Create `apps/server/src/features/ingest/ingest.module.ts`:

```ts
import { BadRequestException, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { ClipsModule } from '../clips/clips.module';
import { JobsModule } from '../jobs/jobs.module';
import { VideosModule } from '../videos/videos.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { PublicConfigController } from './public-config.controller';

@Module({
  imports: [
    JobsModule,
    VideosModule,
    ClipsModule,
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const tmpDir = join(config.dataDir, 'tmp');
        mkdirSync(tmpDir, { recursive: true });
        return {
          storage: diskStorage({
            destination: (_req, _file, cb) => cb(null, tmpDir),
            filename: (_req, file, cb) =>
              cb(null, `${randomUUID()}${extname(file.originalname)}`),
          }),
          limits: { fileSize: config.maxUploadBytes },
          fileFilter: (
            _req: unknown,
            file: { mimetype: string },
            cb: (error: Error | null, acceptFile: boolean) => void,
          ) => {
            if (file.mimetype.startsWith('video/')) {
              cb(null, true);
            } else {
              cb(new BadRequestException('Please choose a video file.'), false);
            }
          },
        };
      },
    }),
  ],
  controllers: [IngestController, PublicConfigController],
  providers: [IngestService],
})
export class IngestModule {}
```

- [ ] **Step 7: Register the module**

In `apps/server/src/app.module.ts`, add the import and list it:

```ts
import { IngestModule } from './features/ingest/ingest.module';
```

Add `IngestModule` to the `imports` array (after `UploadModule`).

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run e2e -- upload.spec`
Expected: PASS (3 tests) — config shape, upload→done→meta, non-video 400.

- [ ] **Step 9: Commit**

```bash
git add apps/server/package.json package-lock.json apps/server/src/features/ingest/ apps/server/src/app.module.ts e2e/tests/upload.spec.ts
git commit -m "feat(ingest): POST /api/videos upload + GET /api/config"
```

---

## Task 7: Gate YouTube endpoints behind `youtubeEnabled`

**Files:**
- Modify: `apps/server/src/features/fetch/downloads.controller.ts`
- Modify: `apps/server/src/features/fetch/resolve.controller.ts`
- Test: `apps/server/src/features/fetch/youtube-gating.spec.ts`

**Interfaces:**
- Consumes: `APP_CONFIG.youtubeEnabled`.
- Produces: `POST /api/downloads` and `POST /api/resolve` throw `NotFoundException` when `youtubeEnabled` is false.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/features/fetch/youtube-gating.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DownloadsController } from './downloads.controller';
import { ResolveController } from './resolve.controller';
import type { DownloadsService } from './downloads.service';
import { loadConfig } from '../../config/config';

const fakeService = {
  startDownload: () => ({ id: 'j' }),
  resolve: async () => ({ youtubeId: 'x', title: 't', durationSec: 1, playableInEmbed: true }),
} as unknown as DownloadsService;

describe('YouTube endpoints gating', () => {
  const disabled = { ...loadConfig(), youtubeEnabled: false };
  const enabled = { ...loadConfig(), youtubeEnabled: true };

  it('downloads: 404 when disabled', () => {
    const controller = new DownloadsController(fakeService, disabled);
    expect(() => controller.start({ url: 'https://youtu.be/x' })).toThrow(NotFoundException);
  });

  it('downloads: works when enabled', () => {
    const controller = new DownloadsController(fakeService, enabled);
    expect(controller.start({ url: 'https://youtu.be/x' })).toEqual({ jobId: 'j' });
  });

  it('resolve: 404 when disabled', async () => {
    const controller = new ResolveController(fakeService, disabled);
    await expect(controller.resolve({ url: 'https://youtu.be/x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/server -- youtube-gating`
Expected: FAIL — controllers take one constructor arg, not two.

- [ ] **Step 3: Implement gating in DownloadsController**

Replace `apps/server/src/features/fetch/downloads.controller.ts` with:

```ts
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { DownloadsService } from './downloads.service';

interface StartDownloadDto {
  url?: unknown;
}

@Controller('downloads')
export class DownloadsController {
  constructor(
    private readonly downloads: DownloadsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(202)
  start(@Body() body: StartDownloadDto): { jobId: string } {
    if (!this.config.youtubeEnabled) {
      throw new NotFoundException('YouTube fetching is disabled.');
    }
    const url = typeof body?.url === 'string' ? body.url : '';
    const job = this.downloads.startDownload(url);
    return { jobId: job.id };
  }
}
```

- [ ] **Step 4: Implement gating in ResolveController**

Replace `apps/server/src/features/fetch/resolve.controller.ts` with:

```ts
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { DownloadsService } from './downloads.service';
import type { ResolveResult } from './downloads.service';

interface ResolveDto {
  url?: unknown;
}

@Controller('resolve')
export class ResolveController {
  constructor(
    private readonly downloads: DownloadsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(200)
  resolve(@Body() body: ResolveDto): Promise<ResolveResult> {
    if (!this.config.youtubeEnabled) {
      throw new NotFoundException('YouTube fetching is disabled.');
    }
    const url = typeof body?.url === 'string' ? body.url : '';
    return this.downloads.resolve(url);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/server -- youtube-gating`
Expected: PASS. Then `npm run test -w apps/server` — all green.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/fetch/downloads.controller.ts apps/server/src/features/fetch/resolve.controller.ts apps/server/src/features/fetch/youtube-gating.spec.ts
git commit -m "feat(fetch): gate YouTube endpoints behind youtubeEnabled"
```

---

## Task 8: Frontend API — getConfig + uploadVideo

**Files:**
- Modify: `apps/web/src/app/core/api.models.ts`
- Modify: `apps/web/src/app/core/api.service.ts`
- Test: `apps/web/src/app/core/api.service.spec.ts`

**Interfaces:**
- Produces: `PublicConfig { youtubeEnabled: boolean; maxUploadBytes: number; maxUploadDurationSec: number }`; `UploadEvent = { kind: 'progress'; percent: number } | { kind: 'uploaded'; jobId: string }`; `ApiService.getConfig(): Observable<PublicConfig>`; `ApiService.uploadVideo(file: File): Observable<UploadEvent>`.

- [ ] **Step 1: Add `'ingest'` to the web JobType**

In `apps/web/src/app/core/api.models.ts`, change:

```ts
export type JobType = 'download' | 'clip' | 'upload' | 'ingest';
```

- [ ] **Step 2: Write the failing test**

Create/extend `apps/web/src/app/core/api.service.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { ApiService } from './api.service';
import type { UploadEvent } from './api.service';

describe('ApiService uploads', () => {
  let api: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getConfig GETs /api/config', () => {
    let result: unknown;
    api.getConfig().subscribe((c) => (result = c));
    const req = httpMock.expectOne('/api/config');
    expect(req.request.method).toBe('GET');
    req.flush({ youtubeEnabled: true, maxUploadBytes: 10, maxUploadDurationSec: 20 });
    expect(result).toEqual({ youtubeEnabled: true, maxUploadBytes: 10, maxUploadDurationSec: 20 });
  });

  it('uploadVideo posts FormData and maps progress then uploaded', () => {
    const events: UploadEvent[] = [];
    const file = new File(['abc'], 'clip.mp4', { type: 'video/mp4' });
    api.uploadVideo(file).subscribe((e) => events.push(e));

    const req = httpMock.expectOne('/api/videos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    req.event(new HttpResponse({ body: { jobId: 'job-1' } }));

    expect(events).toContainEqual({ kind: 'progress', percent: 50 });
    expect(events).toContainEqual({ kind: 'uploaded', jobId: 'job-1' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w apps/web -- api.service`
Expected: FAIL — `getConfig`/`uploadVideo` not defined.

- [ ] **Step 4: Implement**

In `apps/web/src/app/core/api.service.ts`, update imports:

```ts
import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { ClipMode, Job, VideoMeta } from './api.models';
```

Add these exported types (near `ResolveResult`):

```ts
export interface PublicConfig {
  youtubeEnabled: boolean;
  maxUploadBytes: number;
  maxUploadDurationSec: number;
}

export type UploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'uploaded'; jobId: string };
```

Add these methods inside `ApiService`:

```ts
  getConfig(): Observable<PublicConfig> {
    return this.http.get<PublicConfig>('/api/config');
  }

  /** Upload a local file; emits transfer progress, then the created job id. */
  uploadVideo(file: File): Observable<UploadEvent> {
    const form = new FormData();
    form.append('file', file);
    const req = new HttpRequest('POST', '/api/videos', form, {
      reportProgress: true,
    });
    return this.http.request<{ jobId: string }>(req).pipe(
      map((event): UploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent = event.total
            ? Math.round((event.loaded / event.total) * 100)
            : 0;
          return { kind: 'progress', percent };
        }
        if (event instanceof HttpResponse) {
          return { kind: 'uploaded', jobId: event.body?.jobId ?? '' };
        }
        return null;
      }),
      filter((e): e is UploadEvent => e !== null),
    );
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w apps/web -- api.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/core/api.models.ts apps/web/src/app/core/api.service.ts apps/web/src/app/core/api.service.spec.ts
git commit -m "feat(web): getConfig and uploadVideo API methods"
```

---

## Task 9: Fetch page — source toggle + upload flow

**Files:**
- Modify: `apps/web/src/app/features/fetch/fetch-page.ts`
- Modify: `apps/web/src/app/features/fetch/fetch-page.html`
- Modify: `apps/web/src/app/features/fetch/fetch-page.scss`
- Test: `apps/web/src/app/features/fetch/fetch-page.spec.ts`

**Interfaces:**
- Consumes: `ApiService.getConfig()`, `ApiService.uploadVideo()`, `JobEventsService.watch()`.
- Produces: a landing page whose `data-testid="source-upload"` toggle reveals a `data-testid="file-input"`; selecting a valid file uploads then routes to `/edit/:videoId`. When `youtubeEnabled` is false, the YouTube form is not rendered.

- [ ] **Step 1: Write the failing test**

Create/extend `apps/web/src/app/features/fetch/fetch-page.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { provideRouter } from '@angular/router';
import { FetchPage } from './fetch-page';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { UploadEvent } from '../../core/api.service';

function setup(youtubeEnabled: boolean, upload$: Subject<UploadEvent>) {
  const api = {
    getConfig: vi.fn().mockReturnValue(of({ youtubeEnabled, maxUploadBytes: 1_000_000, maxUploadDurationSec: 60 })),
    uploadVideo: vi.fn().mockReturnValue(upload$.asObservable()),
    resolve: vi.fn(),
    startDownload: vi.fn(),
  };
  const jobEvents = { watch: vi.fn().mockReturnValue({ job: () => undefined, dispose: () => undefined }) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: JobEventsService, useValue: jobEvents },
    ],
  });
  const fixture = TestBed.createComponent(FetchPage);
  fixture.detectChanges();
  return { fixture, api };
}

describe('FetchPage upload mode', () => {
  it('hides the YouTube form when youtubeEnabled is false', () => {
    const { fixture } = setup(false, new Subject());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="yt-url"]')).toBeNull();
    expect(el.querySelector('[data-testid="file-input"]')).not.toBeNull();
  });

  it('uploads a selected file and starts watching the returned job', () => {
    const upload$ = new Subject<UploadEvent>();
    const { fixture, api } = setup(true, upload$);
    const component = fixture.componentInstance as unknown as {
      onFileSelected: (f: File) => void;
    };
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    component.onFileSelected(file);
    expect(api.uploadVideo).toHaveBeenCalledWith(file);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/web -- fetch-page`
Expected: FAIL — `onFileSelected` not defined / no `file-input` element.

- [ ] **Step 3: Implement the component**

Replace `apps/web/src/app/features/fetch/fetch-page.ts` with:

```ts
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { JobEventsService } from '../../core/job-events.service';
import type { JobWatch } from '../../core/job-events.service';
import { isTerminal } from '../../core/api.models';
import { isYoutubeVideoUrl } from '../../core/youtube-link';
import { ProgressCard } from '../../shared/progress-card';

type FetchMode = 'quick' | 'precise';
type Source = 'youtube' | 'upload';

@Component({
  selector: 'app-fetch-page',
  imports: [ProgressCard],
  templateUrl: './fetch-page.html',
  styleUrl: './fetch-page.scss',
})
export class FetchPage {
  private readonly api = inject(ApiService);
  private readonly jobEvents = inject(JobEventsService);
  private readonly router = inject(Router);

  protected readonly url = signal('');
  protected readonly mode = signal<FetchMode>('quick');
  protected readonly source = signal<Source>('youtube');
  protected readonly youtubeEnabled = signal(true);
  protected readonly maxUploadBytes = signal(0);
  protected readonly requestError = signal('');
  protected readonly fallbackNote = signal('');
  protected readonly resolving = signal(false);
  protected readonly uploadPercent = signal<number | null>(null);
  private readonly watch = signal<JobWatch | undefined>(undefined);

  protected readonly job = computed(() => this.watch()?.job());
  protected readonly isValidUrl = computed(() => isYoutubeVideoUrl(this.url()));
  protected readonly uploading = computed(() => this.uploadPercent() !== null);
  protected readonly busy = computed(() => {
    if (this.resolving() || this.uploading()) {
      return true;
    }
    const job = this.job();
    return job !== undefined && !isTerminal(job.state);
  });
  protected readonly errorText = computed(() => {
    const job = this.job();
    return (
      this.requestError() || (job?.state === 'error' ? (job.error ?? 'Something went wrong.') : '')
    );
  });

  constructor() {
    this.api.getConfig().subscribe({
      next: (config) => {
        this.youtubeEnabled.set(config.youtubeEnabled);
        this.maxUploadBytes.set(config.maxUploadBytes);
        this.source.set(config.youtubeEnabled ? 'youtube' : 'upload');
      },
      error: () => undefined,
    });

    // Both the full-download job and the ingest job report result.videoId when
    // done — either way, head to the native editor.
    effect(() => {
      const job = this.job();
      if (job?.state === 'done' && job.result?.videoId) {
        void this.router.navigate(['/edit', job.result.videoId]);
      }
    });
  }

  protected setSource(source: Source): void {
    if (source === 'youtube' && !this.youtubeEnabled()) {
      return;
    }
    this.source.set(source);
    this.requestError.set('');
    this.fallbackNote.set('');
  }

  protected onInput(value: string): void {
    this.url.set(value);
    this.requestError.set('');
    this.fallbackNote.set('');
  }

  protected setMode(mode: FetchMode): void {
    this.mode.set(mode);
  }

  protected submit(): void {
    if (!this.isValidUrl() || this.busy()) {
      return;
    }
    this.requestError.set('');
    this.fallbackNote.set('');
    this.watch()?.dispose();
    if (this.mode() === 'quick') {
      this.startQuick();
    } else {
      this.startPrecise();
    }
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(file);
    }
    input.value = '';
  }

  protected onFileSelected(file: File): void {
    if (this.busy()) {
      return;
    }
    this.requestError.set('');
    if (!file.type.startsWith('video/')) {
      this.requestError.set('Please choose a video file.');
      return;
    }
    const cap = this.maxUploadBytes();
    if (cap > 0 && file.size > cap) {
      const mb = Math.round(cap / (1024 * 1024));
      this.requestError.set(`That file is larger than the ${mb} MB limit.`);
      return;
    }
    this.watch()?.dispose();
    this.uploadPercent.set(0);
    this.api.uploadVideo(file).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.uploadPercent.set(event.percent);
        } else {
          // Transfer done → watch the server-side normalize job.
          this.uploadPercent.set(null);
          this.watch.set(this.jobEvents.watch(event.jobId));
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploadPercent.set(null);
        this.requestError.set(err.error?.message ?? 'Upload failed. Please try again.');
      },
    });
  }

  private startQuick(): void {
    this.resolving.set(true);
    this.api.resolve(this.url()).subscribe({
      next: (result) => {
        this.resolving.set(false);
        if (!result.playableInEmbed) {
          this.fallbackNote.set("This video can't be previewed inline — downloading it instead.");
          this.startPrecise();
          return;
        }
        void this.router.navigate(['/preview', result.youtubeId], {
          state: { title: result.title, durationSec: result.durationSec },
        });
      },
      error: (err: { error?: { message?: string } }) => {
        this.resolving.set(false);
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.');
      },
    });
  }

  private startPrecise(): void {
    this.api.startDownload(this.url()).subscribe({
      next: ({ jobId }) => this.watch.set(this.jobEvents.watch(jobId)),
      error: (err: { error?: { message?: string } }) =>
        this.requestError.set(err.error?.message ?? 'Could not reach the Cropcorn server.'),
    });
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `apps/web/src/app/features/fetch/fetch-page.html` with:

```html
<section class="hero">
  <div class="hero-copy">
    <h1 class="headline">
      Crop the <span class="butter-word">good&nbsp;part</span>.
    </h1>
    <p class="lede">
      Upload your own video, trim exactly the seconds you want, and download just
      that clip.
    </p>
  </div>

  @if (youtubeEnabled()) {
    <div class="source-picker" role="radiogroup" aria-label="Video source">
      <button
        type="button"
        class="source-chip"
        role="radio"
        data-testid="source-youtube"
        [attr.aria-checked]="source() === 'youtube'"
        [class.active]="source() === 'youtube'"
        (click)="setSource('youtube')"
        [disabled]="busy()"
      >
        🔗 YouTube link
      </button>
      <button
        type="button"
        class="source-chip"
        role="radio"
        data-testid="source-upload"
        [attr.aria-checked]="source() === 'upload'"
        [class.active]="source() === 'upload'"
        (click)="setSource('upload')"
        [disabled]="busy()"
      >
        ⬆️ Upload a video
      </button>
    </div>
  }

  @if (youtubeEnabled() && source() === 'youtube') {
    <form class="ticket" (submit)="$event.preventDefault(); submit()">
      <label class="ticket-label" for="yt-url">YouTube link</label>
      <div class="ticket-row">
        <input
          id="yt-url"
          data-testid="yt-url"
          class="ticket-input"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          autocomplete="off"
          spellcheck="false"
          [value]="url()"
          (input)="onInput($any($event.target).value)"
          [disabled]="busy()"
        />
        <button class="btn btn-butter" type="submit" [disabled]="!isValidUrl() || busy()">
          {{ busy() ? 'Working…' : mode() === 'quick' ? 'Preview it' : 'Fetch it' }}
          <span aria-hidden="true">🍿</span>
        </button>
      </div>
      @if (url() && !isValidUrl() && !busy()) {
        <p class="hint">Hmm, that doesn't look like a YouTube video link yet.</p>
      }

      <div class="mode-picker" role="radiogroup" aria-label="How to load the video">
        <button
          type="button"
          class="mode-chip"
          role="radio"
          [attr.aria-checked]="mode() === 'quick'"
          [class.active]="mode() === 'quick'"
          (click)="setMode('quick')"
          [disabled]="busy()"
        >
          <span class="chip-name">⚡ Quick preview</span>
          <span class="chip-hint">instant — downloads only your clip</span>
        </button>
        <button
          type="button"
          class="mode-chip"
          role="radio"
          [attr.aria-checked]="mode() === 'precise'"
          [class.active]="mode() === 'precise'"
          (click)="setMode('precise')"
          [disabled]="busy()"
        >
          <span class="chip-name">🎯 Precise</span>
          <span class="chip-hint">downloads full video, frame-perfect trim</span>
        </button>
      </div>
    </form>
  }

  @if (source() === 'upload') {
    <label
      class="dropzone"
      data-testid="upload-dropzone"
      [class.disabled]="busy()"
    >
      <input
        type="file"
        accept="video/*"
        class="file-input"
        data-testid="file-input"
        (change)="onFileInput($event)"
        [disabled]="busy()"
      />
      <span class="dropzone-icon" aria-hidden="true">🎬</span>
      <span class="dropzone-title">Choose a video to crop</span>
      <span class="dropzone-hint">MP4, MOV, MKV, WebM — up to your configured limit</span>
    </label>
  }

  @if (uploading()) {
    <div class="progress-card" role="status" aria-live="polite">
      <span class="stage">Uploading… {{ uploadPercent() }}%</span>
    </div>
  }

  @if (resolving()) {
    <div class="progress-card" role="status" aria-live="polite">
      <span class="stage">Reading the video…</span>
    </div>
  }

  @if (fallbackNote()) {
    <p class="fallback-note">{{ fallbackNote() }}</p>
  }

  @if (job(); as j) {
    <app-progress-card [job]="j" />
  }

  @if (errorText()) {
    <div class="error-banner" role="alert">
      <strong>Un-poppable.</strong>
      <span>{{ errorText() }}</span>
    </div>
  }
</section>
```

- [ ] **Step 5: Add dropzone styles**

Append to `apps/web/src/app/features/fetch/fetch-page.scss`:

```scss
.source-picker {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.source-chip {
  flex: 1;
  padding: 0.6rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.75rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;

  &.active {
    border-color: var(--butter, #f5c451);
    background: rgba(245, 196, 81, 0.12);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: clamp(1.5rem, 4vw, 3rem);
  border: 2px dashed rgba(255, 255, 255, 0.25);
  border-radius: 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;

  &:hover {
    border-color: var(--butter, #f5c451);
    background: rgba(245, 196, 81, 0.06);
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.dropzone-icon {
  font-size: 2rem;
}

.dropzone-title {
  font-weight: 600;
}

.dropzone-hint {
  font-size: 0.85rem;
  opacity: 0.7;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -w apps/web -- fetch-page`
Expected: PASS. Then `npm run test -w apps/web` — all green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/features/fetch/
git commit -m "feat(web): upload source with two-phase progress on the landing page"
```

---

## Task 10: End-to-end UI upload journey

**Files:**
- Modify: `e2e/tests/upload.spec.ts` (add the UI test)

**Interfaces:**
- Consumes: the landing page `data-testid` hooks, `/edit/:videoId`, existing clip/download flow.

- [ ] **Step 1: Write the failing test**

Append to `e2e/tests/upload.spec.ts`:

```ts
test('UI: upload a file, reach the editor, generate and download a clip', async ({ page }) => {
  await page.goto('/');

  // Switch to the upload source if the YouTube option is present.
  const uploadToggle = page.getByTestId('source-upload');
  if (await uploadToggle.count()) {
    await uploadToggle.click();
  }

  await page.getByTestId('file-input').setInputFiles(FIXTURE);

  // Two-phase progress → lands on the native editor.
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await expect(page.locator('video')).toBeVisible();

  // Generate a clip using the existing editor controls, then download.
  await page.getByRole('button', { name: /generate/i }).click();
  await page.waitForURL(/\/result\//, { timeout: 30_000 });

  const downloadLink = page.getByRole('link', { name: /download/i });
  const href = await downloadLink.getAttribute('href');
  expect(href).toContain('/file');
  const res = await page.request.get(`http://localhost:3000${href}`);
  expect(res.status()).toBe(200);
  expect(Number(res.headers()['content-length'])).toBeGreaterThan(0);
});
```

> Note: if the editor's Generate button or result Download link uses different accessible text in this codebase, adjust the `getByRole` selectors to match the actual labels (check `editor-page.html` / `result-page.html`). The `FIXTURE` constant and `API` are already defined at the top of this file from Task 6.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `npm run e2e -- upload.spec`
Expected: the new UI test drives upload → editor → result → 200 download. If a selector mismatches, fix it to the real label and re-run until PASS.

- [ ] **Step 3: Run the whole e2e suite (no regressions)**

Run: `npm run e2e`
Expected: existing YouTube journeys + the new upload journeys all PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/upload.spec.ts
git commit -m "test(e2e): upload-to-download UI journey"
```

---

## Task 11: Docs — env vars + upload mode

**Files:**
- Modify: `README.md` (or the repo's main setup doc)
- Modify: `apps/server/.env.example` (create if absent)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Document the new env vars**

Add to `apps/server/.env.example` (create it if it doesn't exist), without real secrets:

```bash
# Uploads (own-footage editor)
MAX_UPLOAD_BYTES=2147483648
MAX_UPLOAD_DURATION_SEC=7200

# Set to false to run the public "upload only" build (hides + disables YouTube)
YOUTUBE_ENABLED=true
```

- [ ] **Step 2: Add a README section**

Add a short "Upload your own video" section to `README.md` explaining: drag/drop or pick a file; the server normalizes non-H.264 files (iPhone HEVC, mkv, webm) to MP4; `YOUTUBE_ENABLED=false` produces the public upload-only build; the two limit env vars.

- [ ] **Step 3: Full verification sweep**

Run, expecting all green:

```bash
npm run test -w apps/server
npm run test -w apps/web
npm run e2e
```

- [ ] **Step 4: Commit**

```bash
git add README.md apps/server/.env.example
git commit -m "docs: own-footage upload mode and env vars"
```

---

## Self-Review

**Spec coverage:**
- Two-phase flow → Tasks 6 (upload endpoint/202) + 8 (upload progress) + 9 (UI phases). ✓
- `features/ingest/` (controller/service/args) → Tasks 3, 5, 6. ✓
- Smart normalize (remux vs transcode) → Tasks 3 (`isBrowserPlayable`, `buildNormalizeArgs`) + 4 (`normalize`) + 5 (decision). ✓
- ProbeService codecs → Task 2. ✓
- Config (`maxUploadBytes`, `maxUploadDurationSec`, `youtubeEnabled`) + `/api/config` → Tasks 1 + 6. ✓
- `youtubeEnabled` enforced server-side → Task 7. ✓
- Security (double type-check, size 413, duration 400, UUID paths, filename only in info.json, temp cleanup) → Tasks 5 (duration/no-stream/cleanup/filename) + 6 (mime filter, size limit, disk storage). ✓
- Frontend (`getConfig`, `uploadVideo`, source toggle, gating) → Tasks 8 + 9. ✓
- Testing (unit predicate/args/service, e2e offline via `fixtures/sample.mp4`) → Tasks 3, 5, 6, 10. ✓
- Multer dependency + tmp dir → Task 6. ✓
- Docs → Task 11. ✓

**Placeholder scan:** none — every code step contains full code; no "TBD"/"similar to".

**Type consistency:** `MediaProbe` fields (Task 2) match `isBrowserPlayable`'s param shape (Task 3) and the ingest test mocks (Task 5). `NormalizeArgsInput` defined in Task 3, consumed in Tasks 4/5. `normalize(input, durationSec, onProgress)` signature identical across Tasks 4 and 5. `UploadEvent`/`PublicConfig` identical across Tasks 8 and 9. `result.videoId` (Task 5) matches the existing fetch-page effect reused in Task 9. `POST /api/videos` 202 / `GET /api/config` consistent across Tasks 6, 8, 10. ✓

---

## Execution Handoff

See the assistant message accompanying this plan for the two execution options.
