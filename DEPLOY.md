# Deploying Cropcorn

Target: a single public VM running `docker compose`. Written for **Oracle Cloud
Always Free** (4 ARM cores / 24 GB RAM / 200 GB — genuinely free, no time
limit), but nothing here is Oracle-specific. Any VM with Docker works.

```
Internet ──▶ caddy :443 ──▶ web (nginx + Angular) ──▶ api (NestJS + yt-dlp + ffmpeg)
             auto-TLS        serves SPA, proxies /api     private network only
```

Only Caddy publishes ports. `web` and `api` are reachable solely on the private
compose network, so nobody can bypass the proxy and hit the API directly.

---

## Before you start

You need two things this guide cannot do for you:

1. **An Oracle Cloud account.** Signup requires a card for identity
   verification; Always Free resources are not charged. ARM capacity is
   frequently exhausted in popular regions — if you get
   "Out of host capacity", retry, or pick a less busy region at signup.
   You cannot change region later.
2. **A domain name.** Required, not optional: Google OAuth refuses non-HTTPS
   redirect URIs for anything but `localhost`, and Let's Encrypt will not issue
   a certificate for a bare IP. A free [DuckDNS](https://duckdns.org) subdomain
   works fine, as does any registrar domain (~$10/yr).

---

## 1. Create the VM

Oracle Cloud console → **Compute → Instances → Create instance**

| Setting | Value |
|---|---|
| Shape | **Ampere VM.Standard.A1.Flex** (ARM) |
| OCPUs / Memory | 4 / 24 GB (the full free allowance) |
| Image | Ubuntu 24.04 |
| Boot volume | 100 GB (free tier allows 200 GB total) |
| SSH key | Upload your public key |

ARM matters: the images build multi-arch, and the app deliberately uses the
system `ffmpeg` rather than the bundled `ffmpeg-static` (which has no reliable
arm64 build). Nothing extra to configure.

## 2. Open ports 80 and 443 — both layers

This is the step people lose an afternoon to. Oracle filters traffic in **two**
places and you must open both.

**Layer 1 — the cloud firewall.** Networking → Virtual Cloud Networks → your
VCN → Security Lists → Default → **Add Ingress Rules**:

| Source CIDR | Protocol | Dest. port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**Layer 2 — iptables on the instance.** Oracle's Ubuntu images ship with a
default-DROP INPUT chain, so the VM rejects traffic even after the security
list allows it:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Verify from your laptop before continuing — `nc -vz <VM_IP> 443` must connect.
If it hangs, one of the two layers is still closed. Caddy cannot obtain a
certificate until this works, because Let's Encrypt validates over port 80.

## 3. Point the domain at the VM

Create an **A record** for your hostname pointing at the VM's public IP.
For DuckDNS, set the IP in their dashboard. Confirm it resolves before
continuing, or the certificate request fails and counts against
[Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/):

```bash
dig +short clips.example.com    # must print the VM's IP
```

## 4. Install Docker

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
```

## 5. Deploy

```bash
git clone https://github.com/LetuchiGalandec/Video-editor.git cropcorn
cd cropcorn
cp .env.prod.example .env.prod
nano .env.prod          # set CROPCORN_DOMAIN, CROPCORN_TLS_EMAIL, SESSION_SECRET
```

**`SESSION_SECRET` is not optional in production.** The built-in fallback is a
constant in the source, so leaving it blank lets anyone forge a session cookie
and act as another signed-in user:

```bash
openssl rand -hex 32
```

Then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # watch the cert issue
```

The first build takes several minutes on ARM. Caddy fetches the certificate on
first request; `certificate obtained successfully` in the logs means you are
live at `https://<your-domain>`.

## 6. Enable "Save to YouTube" (optional)

In the [Google Cloud console](https://console.cloud.google.com), add to your
OAuth client's **Authorized redirect URIs**:

```
https://<your-domain>/api/auth/google/callback
```

Then put the client ID and secret in `.env.prod` and restart:

```bash
docker compose -f docker-compose.prod.yml up -d
```

While the OAuth consent screen is in **Testing**, only accounts you add as test
users can sign in, and their refresh tokens expire every 7 days.

---

## Known limitation: YouTube blocks datacenter IPs

`yt-dlp` requests from cloud providers frequently get
"Sign in to confirm you're not a bot". **Uploading and trimming your own video
files always works. Fetching from a YouTube link will fail for some share of
videos**, and there is no fix that is both reliable and free.

The workaround is exporting your YouTube cookies to `/data/cookies.txt` and
setting `YT_COOKIES_FILE`. Understand the tradeoff before doing it: every
visitor's download then runs as **your** Google account, which can get it
rate-limited or flagged, and the cookies expire so you re-export periodically.

If the fetch path proves too unreliable, `YOUTUBE_ENABLED=false` gives a clean
upload-only build with no broken buttons.

## Operating it

```bash
# logs
docker compose -f docker-compose.prod.yml logs -f api

# update after a git push
git pull && docker compose -f docker-compose.prod.yml up -d --build

# disk usage (clips are swept after TTL_MINUTES, but check anyway)
docker system df && df -h

# stop
docker compose -f docker-compose.prod.yml down
```

### What protects the box

Rate limiting (120 req/min globally, 10/min on anything spawning yt-dlp or
ffmpeg), a 507 guard that refuses uploads the disk cannot absorb, a TTL sweep
that deletes fetched videos and clips, `helmet` headers, and a 2-core cap on
the api container so a render cannot starve the proxy.

**None of that makes the URL safe to post publicly.** It is sized for a link
shared with friends. Anyone who has it can consume your CPU and bandwidth, so
treat the URL as the only access control — there is no authentication in front
of the app.
