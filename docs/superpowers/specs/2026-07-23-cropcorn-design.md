# Cropcorn 🍿 — YouTube Clip Cropper (Plan)

## Context

Greenfield app in the empty directory `/Users/giorgimindiashvili/Documents/Video editor`. The user wants a web app that takes a YouTube link, downloads the video, lets them trim a time range in a real player, generates an .mp4 (download it, or upload it to their YouTube channel as a **Private** video). Personal/learning tool first; possibly a free public product later.

**Decisions made with the user:**
- Name: **Cropcorn** (crop + popcorn)
- Stack: Angular (standalone + signals) frontend, **NestJS** backend (DI makes the fetcher seam + fake-for-tests swap trivial)
- Fetch: **yt-dlp** behind a `VideoFetcher` interface (ToS risk accepted for personal use; interface = swap point for a paid vendor API if ever public)
- Preview: **download-first, native `<video>` player** (full custom controls, precise scrubbing)
- Cut modes: **frame-accurate re-encode (default)** + **"Fast cut" stream-copy toggle** (instant, keyframe-snapped ±few sec)
- Quality: **1080p cap**, h264+aac preferred for universal `<video>` playback
- YouTube save: **upload clip as a Private video** via YouTube Data API v3 (OAuth)
- No DB — in-memory job store + temp files with TTL cleanup

## Tech limits (the honest list)

1. **No official download API.** yt-dlp scrapes YouTube's player — violates YouTube ToS. Fine for a personal tool; a public product would need a paid scraping-API vendor (moves the risk to them) or a pivot to embed-player + timestamps. The `VideoFetcher` interface is the hedge.
2. **yt-dlp breaks periodically** when YouTube changes internals. Pinned via lockfile; README note + error hint: "run `npm update youtube-dl-exec`".
3. **Upload quota:** YouTube Data API default 10,000 units/day; `videos.insert` = 1,600 → **~6 uploads/day**. Fine personally.
4. **OAuth Testing mode:** consent screen in "Testing" → refresh tokens expire every **7 days** ("Reconnect Google" flow needed). Full verification for the upload scope is heavy — skip for now.
5. **Can't fetch:** private/age-restricted/DRM videos, live streams. Pre-flight probe rejects with friendly errors.
6. **Long videos** = slow download + disk usage → 4 h duration cap (configurable) + TTL cleanup.

**Paid libs verdict:** nothing worth paying for. ffmpeg (free) beats cloud transcoders (Mux/Cloudinary/api.video) for this use; paid downloader APIs only matter if going public. $0 stack.

## Architecture

npm workspaces monorepo:

```
cropcorn/
├── package.json                  # workspaces: apps/*, e2e; root scripts: dev, test, e2e
├── fixtures/sample.mp4           # 4s ffmpeg testsrc2 clip (committed) for FakeFetcher + e2e
├── e2e/                          # Playwright (webServer: server with FETCHER=fake + web)
├── apps/server/                  # NestJS + Vitest (unplugin-swc)
│   └── src/features/
│       ├── jobs/       # job.model, job-store (Map + RxJS Subject per job, semaphore cap 2, TTL sweep), jobs.controller (GET /api/jobs/:id + SSE /events)
│       ├── fetch/      # video-fetcher.ts (interface + DI token), yt-dlp.fetcher, fake.fetcher, youtube-url.ts (pure), ytdlp-progress.ts (pure), downloads.controller/service
│       ├── videos/     # videos.controller (/meta via ffprobe, /stream with Range), probe.service
│       ├── clips/      # ffmpeg-args.ts (pure argv builders), ffmpeg.service (spawn + -progress pipe:1), clips.controller/service
│       └── upload/     # google-auth.service (OAuth2 + tokens.json 0600), auth.controller, youtube-upload.service, uploads.controller
└── apps/web/                     # Angular standalone + signals, Vitest builder, proxy.conf.json → :3000
    └── src/app/
        ├── core/       # api.service, job-events.service (EventSource → Signal<Job>, poll fallback), time-format.ts (pure)
        ├── features/fetch/    # fetch-page (URL input + button), download-progress
        ├── features/editor/   # editor-page, editor.store (signals), video-player, controls-bar (play/pause/mute/volume/time), trim-timeline/ (custom dual-handle), marker-inputs
        ├── features/result/   # result-page (preview + Download), youtube-upload-card
        └── shared/            # button, progress-bar, error-banner
```

Runtime data (gitignored): `apps/server/.data/videos/<jobId>/source.mp4`, `.data/clips/<clipId>/clip.mp4`, `.data/tokens.json`.

**Binaries:** npm-managed — `youtube-dl-exec` (pins/downloads yt-dlp) + `ffmpeg-static` + `ffprobe-static`. `npm install` = full setup; `YTDLP_PATH`/`FFMPEG_PATH` env override to system binaries.

## API surface

Job: `{ id, type: 'download'|'clip'|'upload', state: 'queued'|'running'|'done'|'error', progress: 0–100, error?, result?: { videoId?, clipId?, youtubeVideoId?, watchUrl? } }`. Every mutation → RxJS Subject → SSE; terminal state closes stream.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/downloads` `{url}` | 202 `{jobId}` (videoId === jobId); 400 on invalid URL; probe then download |
| GET | `/api/jobs/:id` | poll fallback + initial state |
| GET | `/api/jobs/:id/events` | SSE `data: Job` per update |
| GET | `/api/videos/:id/meta` | `{durationSec,width,height,title,sizeBytes}` (ffprobe) |
| GET | `/api/videos/:id/stream` | Range/206 via Express `res.sendFile` (`@Res()`, acceptRanges) |
| POST | `/api/clips` `{videoId,startSec,endSec,mode}` | 202 `{jobId}`; 400 if end<=start/out of bounds |
| GET | `/api/clips/:id/file` | mp4, `Content-Disposition: attachment` |
| GET | `/api/auth/google` → `/callback` → `/status` | offline+consent; tokens.json persisted; status verifies token validity |
| POST | `/api/uploads` `{clipId,title,description?}` | 401 if unauthorized; result carries watchUrl |

## Key commands

**Probe (validation):** `yt-dlp -J --no-playlist <url>` → reject `is_live`, duration > 4 h; map stderr ("Private video", "Sign in to confirm your age", "Video unavailable") to friendly 4xx.

**Download:**
```
yt-dlp --no-playlist -f "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b" \
  --merge-output-format mp4 -o "<DATA>/videos/<jobId>/source.%(ext)s" \
  --newline --progress-template "download:CROPCORN|%(progress._percent_str)s|..."
```
avc1 preference avoids VP9/AV1-in-mp4 Safari failures. Progress: parse `CROPCORN|NN.N%` lines (pure fn, unit-tested); two phases mapped 0–90 / 90–98, merge → 100.

**Accurate cut (default):** `ffmpeg -y -ss <start> -i source.mp4 -t <dur> -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 160k -movflags +faststart -progress pipe:1 -nostats clip.mp4`
(`-ss` before `-i` = fast input seek; re-encode decodes forward → frame-accurate AND fast. `-t` not `-to` because input-seek resets timestamps.)

**Fast cut:** same but `-c copy -avoid_negative_ts make_zero` — snaps to keyframe at/before start; UI labels "instant, cut points snap to keyframes (± a few seconds)".

Progress: parse `out_time_ms` from `-progress pipe:1` → percent vs clip duration.

**Upload (googleapis, resumable automatically):** `youtube.videos.insert({ part:['snippet','status'], requestBody:{ snippet:{title,description,categoryId:'22'}, status:{privacyStatus:'private', selfDeclaredMadeForKids:false} }, media:{ body: createReadStream(clipPath) } }, { onUploadProgress })`.

**Google Cloud setup (manual, one-time):** project → enable YouTube Data API v3 → OAuth consent (External, **Testing**, add own Gmail as test user, scope `youtube.upload`) → Web client with redirect `http://localhost:3000/api/auth/google/callback` → IDs into `apps/server/.env`.

## Frontend

Routes: `/` (fetch) → `/edit/:videoId` (resolver loads meta) → `/result/:clipId` (`?auth=ok` after OAuth round-trip).

`EditorStore` (route-provided, plain signals): `duration, currentTime, playing, muted, volume, markIn, markOut, mode`; `computed` selectionLength + canGenerate (≥0.2 s). Video element bridged with explicit event listeners + `seek(t)` methods (no effect-feedback loops). Preview-loop: while playing past `markOut`, seek back to `markIn`.

**TrimTimelineComponent — custom, no library** (~200 LOC; the heart of the app):
- `input.required duration`, `input currentTime`, `model markIn/markOut`, `output seek`
- Track div + dim overlays outside selection + highlighted span + two handle buttons + playhead line
- Pointer capture drag, px↔sec math in exported pure functions (unit-tested without DOM)
- A11y: `role="slider"`, aria-value*, ArrowLeft/Right ±0.1 s, Shift ±1 s, Home/End; clamp markIn ≤ markOut − 0.2

**Design direction** (per design-quality rules — not a template): playful "cinema snack" theme. Dark theater backdrop, warm butter-yellow accent used semantically (selection span, progress, CTAs), kernel-shaped handles on the timeline, a mascot on the empty state, chunky type for the wordmark. Both light/dark intentional if time permits; dark is primary.

## Testing (TDD throughout)

- Server unit: **Vitest** + unplugin-swc. Web: **Vitest** via Angular's unit-test builder. E2E: **Playwright**.
- Test-first targets: `youtube-url.spec` (watch?v=/youtu.be//shorts/, rejects junk), `time-format.spec`, `job-store.spec` (transitions, clamping, TTL sweep with memfs, semaphore), `ffmpeg-args.spec` (exact argv, `-ss` before `-i`, `-c copy` only in fast), `ytdlp-progress.spec` (real captured lines), `trim-timeline.component.spec` (drag/clamp/keyboard/seek).
- **E2E never hits YouTube:** `FETCHER=fake` → FakeFetcher copies `fixtures/sample.mp4` (generated once: `ffmpeg -f lavfi -i testsrc2=duration=4:size=640x360:rate=30 -f lavfi -i sine=frequency=440:duration=4 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest fixtures/sample.mp4`), synthetic progress. Happy path: paste → fetch → editor (duration ~4 s) → set markers → Generate → result → download is 200 `video/mp4` nonzero. Upload covered by integration test with stubbed googleapis; auth-off state asserted in e2e.

## Implementation phases (each verifiable)

1. **Scaffold** — workspaces, `ng new`, `nest new`, Vitest both sides, proxy, fixture, root `npm run dev`. ✓ hello endpoint through proxy; trivial specs green.
2. **Jobs + fetch pipeline** — TDD job store → `VideoFetcher` + FakeFetcher → downloads + SSE → YtDlpFetcher. ✓ curl POST + SSE shows progress; source.mp4 plays in QuickTime.
3. **Streaming + meta** — ffprobe meta, Range streaming. ✓ `curl -I -H "Range: bytes=0-1023"` → 206.
4. **Fetch page + player** — URL page, progress UI, editor route, native video + controls bar. ✓ browser: paste → progress → seekable video, mute works.
5. **Trim timeline + markers** — TDD component; inputs; set-from-playhead; preview-loop. ✓ drag/keyboard/inputs stay in sync.
6. **Clip generation + download** — TDD ffmpeg-args, service + progress, endpoints, result page. ✓ accurate clip exact; fast clip instant; file plays.
7. **OAuth + upload** — console setup (user does the console part), auth endpoints, tokens, upload card. ✓ real Private video appears on channel.
8. **Polish + lifecycle** — TTL sweeper (6 h default, 10 min sweep, deletes dirs + partial `.part` files), mapped error banners, queue states, design pass, full e2e green via `npm run e2e`.

## Risks / edge cases

Invalid/private/age-restricted/DRM/live URLs (probe + friendly 4xx) · long videos (cap + progress) · concurrency (semaphore 2, "waiting" UI) · disk (TTL + boot-time size log) · yt-dlp breakage (pin + update hint) · OAuth 7-day expiry (status endpoint verifies validity → "Reconnect Google") · quota (map `quotaExceeded`) · path safety (nanoid IDs only, validated route params, never remote titles in fs paths).

## Verification (end-to-end)

1. `npm run test` (both workspaces) — all unit/component suites green.
2. `npm run e2e` — Playwright happy path with FakeFetcher green.
3. Manual: real YouTube URL → fetch → trim 10 s → both cut modes → download plays in QuickTime → connect Google → upload → video visible as **Private** on the channel.
