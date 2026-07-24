# Cropcorn 🍿

**Pop in a link · butter up a clip.** Paste a YouTube URL, trim exactly the
seconds you want in a real player, then download the .mp4 — or save it straight
to your channel as an **Unlisted** video.

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

- **Two ways to load a video:**
  - **Quick preview (default)** — the video plays *instantly* in YouTube's own
    embedded player (zero download). On Generate, only your selected seconds are
    downloaded via `yt-dlp --download-sections` (~a few MB, not hundreds).
  - **Precise** — downloads the full video into a native player for frame-perfect
    visual scrubbing. Also the automatic fallback for videos that block embedding.
- **Trim** with a dual-handle timeline (drag, keyboard arrows, typed timestamps,
  set-from-playhead), custom player controls (play/pause, mute, volume), and a
  preview loop over the selection
- **Generate** in two modes:
  - *Frame-accurate* (default) — re-encodes, exact to the frame
  - *Fast cut* — instant stream copy, snaps to keyframes (± a few seconds)
- **Download** the .mp4, or **Save to YouTube** as an Unlisted video (OAuth)
- **Multi-user**: any number of Google accounts can sign in; each browser gets its
  own session (signed cookie) and only ever touches its own channel
- **Playlists**: on upload, drop the clip into an existing playlist or create a
  new private one
- Fetched files and clips are swept from disk after 6 h (configurable)

## Upload your own video

Instead of pasting a YouTube URL, you can **drag and drop a video file** (or pick
one from your device) and trim it the same way. The server automatically
normalizes non-H.264 files — including iPhone HEVC, `.mkv`, `.webm`, and others
— to MP4 format so they preview and trim smoothly in the player.

To run the public **"upload only" build** (no YouTube fetching or sign-in), set
`YOUTUBE_ENABLED=false` in `.env`. Upload size and duration limits are
configurable via `MAX_UPLOAD_BYTES` (default 2 GB) and `MAX_UPLOAD_DURATION_SEC`
(default 2 hours).

## Save-to-YouTube setup (one-time, ~5 minutes)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → publishing status **Testing** → add your
   own Gmail as a *test user* → add both scopes:
   `https://www.googleapis.com/auth/youtube.upload` (upload the clip) and
   `https://www.googleapis.com/auth/youtube` (list/create playlists + read your
   channel name).
4. **Credentials → Create credentials → OAuth client ID** → *Web application* →
   authorized redirect URI: `http://localhost:3000/api/auth/google/callback`.
5. `cp apps/server/.env.example apps/server/.env` and fill in
   `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Restart the dev server.

Then on a clip's result page: **Sign in with YouTube** → pick a playlist (or
"Create new playlist…") → **Save to YouTube**. The clip uploads Unlisted to your
channel and lands in that playlist (the playlist itself is created Private).

**Built multi-user, run locally.** The app is architected like a real public
product — each browser gets its own signed session cookie, tokens are stored
per-account, and an upload can only ever reach the channel that signed in. You
just happen to run it on your own machine (which is also what keeps the *fetch*
side legal and un-blocked — see below). Anyone who opens your local instance
signs in as themselves and touches only their own channel.

**Known quirks of Testing mode:** refresh tokens expire every 7 days (the app
shows "Sign in with YouTube" again — just reconnect), and the default API quota
allows about **6 uploads per day** (`videos.insert` costs 1,600 of 10,000
daily units; adding to a playlist is a further 50). Also, YouTube restricts
uploads from API projects that haven't passed its compliance audit: even though
the app requests **Unlisted**, your video may land as **Private (locked)** in
YouTube Studio. That's Google's policy, not a bug — the status stays locked
until the project completes a [YouTube API audit](https://support.google.com/youtube/contact/yt_api_form),
which isn't practical for a personal tool.

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
            upload/  Google OAuth (tokens.json) + resumable YouTube upload (Unlisted)
fixtures/   4s generated test video — tests and e2e never touch YouTube
e2e/        Playwright suite
```

Runtime data lives in `apps/server/.data/` (gitignored): fetched videos,
clips, and your OAuth tokens.
