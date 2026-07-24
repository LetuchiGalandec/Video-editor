# Own-Footage Editor — Design Spec

- **Date:** 2026-07-24
- **Status:** Approved (brainstorming complete) → ready for implementation plan
- **Branch:** `feat/own-footage-editor`
- **Feature:** Let users upload their **own** video file, crop a range, and download the result — no YouTube scraping. Adds a second ingest path to the existing Cropcorn app.

---

## 1. Context & Goal

Cropcorn today fetches a YouTube video (full download → native player, or embed → section download), lets the user trim it, and produces an `.mp4` (download or upload-to-YouTube). Running YouTube downloading as a **public** service is legally and operationally untenable (ToS, DMCA, datacenter-IP blocking, OAuth verification, quota). The chosen public-viable direction is an **own-footage editor**: users upload files they own and crop them.

The key enabler already exists: **everything downstream of "a `source.mp4` exists in `<dataDir>/videos/<UUID>/`" is source-agnostic** — probe, meta, Range streaming, the trim editor, the ffmpeg cut (`clips` `source:'downloaded'`), the result/download page, and TTL cleanup all work unchanged. This feature adds only the **ingest** (upload → normalize → `source.mp4`) plus a landing-page mode.

## 2. Decisions (from brainstorming)

1. **App shape:** Add upload as a **second mode in one codebase**. A config flag (`youtubeEnabled`) hides the YouTube path for the public build; YouTube stays available locally.
2. **Format handling:** **Smart normalize.** Probe on ingest; if the file is already H.264/AAC MP4, remux (copy) — near-instant; otherwise transcode to H.264/AAC MP4 (progress-tracked).
3. **Upload limits (defaults, env-configurable):** **~2 GB** max file size, **~2 h** (7200 s) max duration.
4. **This cycle's scope:** Build the feature end-to-end **locally**. Containerization / public hosting / rate-limiting are a **separate follow-up cycle**.

## 3. Non-Goals (this cycle)

- Docker/hosting/deploy config and public-scale rate-limiting or disk quotas.
- Changing the clip→YouTube upload feature (it keeps working when signed in; uploading *your own* footage is cleaner anyway).
- Generating non-H.264 test fixtures (the transcode branch is covered by unit tests, not e2e).

## 4. User Flow (two progress phases)

```
Landing → "Upload a video" → pick / drag-drop file
  │
  ├─ Phase 1 (client): browser streams bytes → POST /api/videos     "Uploading NN%"   (HttpClient upload progress)
  │
  ├─ server streams file to temp, creates ingest job, returns 202 {jobId}
  │
  ├─ Phase 2 (server job): probe → remux OR transcode → source.mp4  "Processing NN%"  (existing SSE job progress)
  │
  └─ job done → route to /edit/:videoId → existing Precise editor (native <video>), unchanged
```

Two phases are required: a 2 GB transfer and a possible 2-hour transcode cannot share one blocking HTTP request. Phase 1 is the multipart transfer; Phase 2 reuses the existing JobStore / JobQueue / SSE progress machinery.

## 5. Backend Design

### 5.1 New feature: `apps/server/src/features/ingest/`

Named `ingest` to avoid colliding with the existing `features/upload/` (which is YouTube upload).

- **`ingest.controller.ts`** — `POST /api/videos` (multipart, field `file`).
  - Uses `@nestjs/platform-express` `FileInterceptor` with **multer disk storage** → streams the upload to `<dataDir>/tmp/<random>.<ext>` (never buffers 2 GB in memory).
  - multer `limits.fileSize = config.maxUploadBytes` → oversize aborts (mapped to **413**).
  - multer `fileFilter` rejects non-`video/*` MIME (mapped to **400**).
  - Handler: create ingest job, hand the temp path to `IngestService`, return `202 {jobId}`.
- **`ingest.service.ts`** — the queued normalize task:
  1. `mkdir <dataDir>/videos/<jobId>/`.
  2. Probe the temp file (extended `ProbeService`). If **no video stream** → fail job (400-class), delete temp.
  3. If `durationSec > config.maxUploadDurationSec` → fail job, delete temp.
  4. Decide via `isBrowserPlayable(probe)`:
     - **playable →** remux `-c copy -movflags +faststart` → `source.mp4`.
     - **not playable →** transcode `libx264/aac -movflags +faststart` → `source.mp4`.
  5. Write `info.json` `{ title, durationSec }` (title = sanitized original filename, minus extension, truncated).
  6. Delete the temp file; set job `result = { videoId: jobId }`.
  - Progress patched from ffmpeg `-progress pipe:1` (same plumbing as `FfmpegService.cut`).
- **`ingest-args.ts`** — pure, unit-tested:
  - `isBrowserPlayable(probe): boolean`
  - `buildNormalizeArgs({ inputPath, outputPath, transcode }): string[]`

### 5.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/videos` | multipart `file`; `202 {jobId}`; `413` oversize; `400` non-video |
| GET | `/api/config` | `{ youtubeEnabled, maxUploadBytes, maxUploadDurationSec }` (public, for the frontend) |

Reused unchanged: `GET /api/videos/:id/meta`, `GET /api/videos/:id/stream`, `GET /api/jobs/:id` + `/events` (SSE), `POST /api/clips`, `GET /api/clips/:id/file`.

`Job` type union gains `'ingest'`.

### 5.3 Extended services

- **`ProbeService`** — add `codec_name` to `-show_entries` (`stream=codec_type,codec_name,width,height`) and `format=duration,format_name`. `MediaProbe` gains `videoCodec: string`, `audioCodec: string` (`''` if none), `container: string`. Existing callers unaffected (additive).
- **`FfmpegService`** — add `normalize(input, output, transcode, onProgress)` mirroring `cut()`; spawns via the existing `runProcess`/`-progress` pipeline.

### 5.4 Config additions

Add to `AppConfig` / `loadConfig()` (same `intFromEnv` pattern):

- `maxUploadBytes: number` — env `MAX_UPLOAD_BYTES`, default `2 * 1024**3`.
- `maxUploadDurationSec: number` — env `MAX_UPLOAD_DURATION_SEC`, default `7200`.
- `youtubeEnabled: boolean` — env `YOUTUBE_ENABLED` (default `true`; `'false'` disables).

When `youtubeEnabled=false`, the YouTube ingest endpoints (`POST /api/resolve`, `POST /api/downloads`) return **404/403** — the flag is enforced server-side, not just hidden in the UI.

## 6. Normalize Logic

`isBrowserPlayable(probe)` = `container ∈ {mp4, mov}` **AND** `videoCodec ∈ {h264, avc1}` **AND** (`audioCodec === ''` **OR** `audioCodec ∈ {aac, mp4a}`).

- **Playable → remux:** `-c copy -movflags +faststart`. No re-encode, no quality loss; guarantees a fast-start `.mp4` (moov atom first, so browser seeking/streaming works). `fixtures/sample.mp4` takes this path.
- **Not playable → transcode:** `-c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart`. Covers iPhone HEVC, `.mkv`, VP9/webm, etc.

Both forms end with `-progress pipe:1 -nostats -loglevel error <output>`, mirroring `buildClipArgs`.

## 7. Security (uploads are the sensitive surface)

- **Type validated twice:** multer `fileFilter` (`video/*`) **and** ffprobe must find a real video stream. Extension is never trusted.
- **Size cap** via multer (`413`); **duration cap** post-probe (`400`-class job failure).
- **Path safety:** filesystem paths use only the server-generated UUID (`assertJobId`) + fixed names (`source.mp4`, `info.json`). The user's filename is **never** used in a path — only stored (sanitized, truncated) in `info.json` as the display title.
- **Cleanup:** temp and partial outputs deleted on any failure; the existing TTL sweeper reaps job dirs.
- **Deferred to hosting cycle:** rate-limiting, disk-quota / free-space pre-check, abuse controls.

## 8. Frontend Design

- **Landing page** gains a source selector: **YouTube link** ⟷ **Upload a video** (drag-drop zone + hidden file input). When `config.youtubeEnabled === false`, only Upload renders — that is the public build. Reads `GET /api/config` at startup.
- **`api.service`:**
  - `getConfig()` → `AppConfigDto`.
  - `uploadVideo(file)` → Angular `HttpClient.post(FormData, { reportProgress: true, observe: 'events' })`; map `HttpEventType.UploadProgress` → percent, `HttpEventType.Response` → `{ jobId }`.
- **Upload flow:** client-side pre-check (type + `maxUploadBytes`) for instant feedback (server remains source of truth) → POST with Phase-1 upload % → on `{jobId}`, `JobEventsService.watch(jobId)` for Phase-2 normalize % (reuses `ProgressCard`) → route to `/edit/:videoId`.
- **Reused unchanged:** editor page, trim timeline, marker inputs, controls bar, native `VideoPlayer`, result page, download.

## 9. Testing

- **Unit (server):**
  - `isBrowserPlayable`: h264/aac-mp4 → true; hevc/mov → false; vp9/webm → false; h264-only (no audio) mp4 → true; h264/mp3-mp4 → false.
  - `buildNormalizeArgs`: copy-path argv (`-c copy -movflags +faststart`) vs transcode-path argv (`libx264`/`aac`), `-progress pipe:1` present.
  - `ingest.service`: faked probe + ffmpeg (mirrors `clips.service.spec`) — asserts remux vs transcode chosen by probe, duration-cap rejection, no-video-stream rejection, `result.videoId === jobId`, temp cleanup.
  - `config`: `youtubeEnabled` parsing; `/api/config` payload.
- **e2e (offline, `FETCHER=fake`):** `POST /api/videos` with the committed `fixtures/sample.mp4` → ingest job completes → `meta`/`stream` OK → `POST /api/clips` (`source:'downloaded'`) → `GET /clips/:id/file` is `200 video/mp4`, non-zero. Exercises the **remux** path. (Transcode branch stays unit-tested; a reliable HEVC fixture isn't guaranteed from `ffmpeg-static`.)
- **Frontend:** `api.service.uploadVideo` event mapping; fetch-page source switching + `youtubeEnabled` gating (component test). Optional Playwright: `setInputFiles(fixtures/sample.mp4)` → reach `/edit/:id`.

## 10. Reuse Map

**Reused as-is:** `JobStore`, `JobQueue`, SSE `jobs.controller`, `VideosService.meta`/`sourcePathOrThrow`/`stream`, `clips` (`source:'downloaded'` ffmpeg cut), result page, download, TTL sweeper, `ProgressCard`, `JobEventsService`, editor + timeline + markers + controls + native player.

**Extended:** `ProbeService` (+codecs/container), `FfmpegService` (+`normalize`), `config` (+3 fields, +`/api/config`), `Job` type (+`'ingest'`), landing page (+upload mode), `api.service` (+`uploadVideo`/`getConfig`).

**New:** `features/ingest/` (`ingest.controller`, `ingest.service`, `ingest-args`) + specs; frontend upload UI + drag-drop.

## 11. Dependencies & implementation notes

- Add **`multer`** + **`@types/multer`** to `apps/server` (`@nestjs/platform-express` ^11 already present).
- `main.ts`: confirm the Express body-size limit does not cap multipart (multer handles the file stream; JSON body limit is separate) — verify no global `bodyParser` limit throttles uploads.
- Ensure `<dataDir>/tmp/` exists (create on boot or lazily in the controller).

## 12. Open questions

None blocking. Deferred by decision: hosting/Docker, rate-limiting, disk-quota pre-check (all → hosting cycle).
