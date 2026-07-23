# Cropcorn 🍿

**Pop in a link · butter up a clip.** Paste a YouTube URL, trim exactly the
seconds you want in a real player, then download the .mp4 — or save it straight
to your channel as a **Private** video.

Personal tool / learning project. Angular 22 (signals, zoneless) + NestJS,
yt-dlp + ffmpeg under the hood.

## Quick start

```bash
npm install    # also downloads pinned yt-dlp + ffmpeg binaries — no Homebrew needed
npm run dev    # server on :3000, web on :4200
```

Open http://localhost:4200, paste a YouTube link, hit **Fetch it**.

> yt-dlp's binary is a Python zipapp — you need `python3` on your PATH
> (macOS: `brew install python`, or it's already there with dev tools).

## Features

- **Fetch** any public YouTube video (≤ 4 h, capped at 1080p, h264+aac preferred)
  with live progress over SSE
- **Trim** with a dual-handle timeline (drag, keyboard arrows, typed timestamps,
  set-from-playhead), custom player controls (play/pause, mute, volume), and a
  preview loop over the selection
- **Generate** in two modes:
  - *Frame-accurate* (default) — re-encodes, exact to the frame
  - *Fast cut* — instant stream copy, snaps to keyframes (± a few seconds)
- **Download** the .mp4, or **Save to YouTube** as a Private video (OAuth)
- Fetched files and clips are swept from disk after 6 h (configurable)

## Save-to-YouTube setup (one-time, ~5 minutes)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → publishing status **Testing** → add your
   own Gmail as a *test user* → add scope `https://www.googleapis.com/auth/youtube.upload`.
4. **Credentials → Create credentials → OAuth client ID** → *Web application* →
   authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
5. `cp apps/server/.env.example apps/server/.env` and fill in
   `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Restart the dev server.

Then click **Connect Google** on a clip's result page.

**Known quirks of Testing mode:** refresh tokens expire every 7 days (the app
shows "Connect Google" again — just reconnect), and the default API quota
allows about **6 uploads per day** (`videos.insert` costs 1,600 of 10,000
daily units).

## Age-restricted videos

There's no trick that skips YouTube's age gate — it's an authentication check.
The supported way is to let yt-dlp use **your own signed-in session** via
browser cookies. In `apps/server/.env` set:

```bash
YT_COOKIES_FROM_BROWSER=chrome   # or safari, firefox, edge, brave…
```

Quit that browser first (it locks its cookie database while open), restart the
dev server, and age-restricted videos fetch like any other. Prefer not to read
the browser directly? Export a `cookies.txt` and set `YT_COOKIES_FILE` instead.

This authenticates as you viewing content you're already allowed to see — it
isn't circumventing anything. The same personal-use ToS caveat below applies.

## Honest tech limits

- **Fetching uses yt-dlp**, which works against YouTube's ToS — fine for
  personal use, not something to ship publicly. The fetcher sits behind a
  `VideoFetcher` interface so a compliant vendor API could be swapped in.
- **yt-dlp breaks periodically** when YouTube changes internals. If fetches
  start failing: `npm update youtube-dl-exec`.
- Private / DRM / live videos still can't be fetched. Age-restricted ones work
  once cookies are configured (above).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server (:3000) + web (:4200) with watch |
| `npm test` | Vitest suites for server and web |
| `npm run e2e` | Playwright happy path — offline, uses the fixture fetcher |
| `npm run build` | production builds of both apps |

## Architecture (short version)

```
apps/web    Angular 22 — fetch page → /edit/:videoId (player + trim timeline) → /result/:clipId
apps/server NestJS — features/
            jobs/    in-memory job store + queue (max 2 concurrent) + SSE + TTL sweeper
            fetch/   VideoFetcher seam: YtDlpFetcher (real) / FakeFetcher (fixture, e2e)
            videos/  ffprobe metadata + Range-request mp4 streaming
            clips/   ffmpeg trim (accurate re-encode / fast stream copy) + downloads
            upload/  Google OAuth (tokens.json) + resumable YouTube upload (Private)
fixtures/   4s generated test video — tests and e2e never touch YouTube
e2e/        Playwright suite
```

Runtime data lives in `apps/server/.data/` (gitignored): fetched videos,
clips, and your OAuth tokens.
