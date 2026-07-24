import { Component, OnDestroy, inject, input, viewChild } from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';
import { EditorStore } from './editor-store';

const POLL_MS = 200;
const YT_STATE_PLAYING = 1;

/**
 * Quick-mode preview: YouTube's own embedded player, driven to the same control
 * surface as the native VideoPlayer (toggle/seek/toggleMute/setVolume) and
 * mirrored into EditorStore. There's no time event on the IFrame API, so the
 * playhead is polled; the selection preview-loop lives here too.
 */
@Component({
  selector: 'app-embed-player',
  imports: [YouTubePlayer],
  templateUrl: './embed-player.html',
  styleUrl: './embed-player.scss',
})
export class EmbedPlayer implements OnDestroy {
  readonly videoId = input.required<string>();

  protected readonly store = inject(EditorStore);
  private readonly player = viewChild.required(YouTubePlayer);

  // controls:0 → our ControlsBar drives playback; hide branding/related/keyboard.
  protected readonly playerVars = {
    controls: 0,
    modestbranding: 1,
    rel: 0,
    playsinline: 1,
    disablekb: 1,
    iv_load_policy: 3,
  };

  private timer?: ReturnType<typeof setInterval>;

  ngOnDestroy(): void {
    this.stopPolling();
  }

  toggle(): void {
    const player = this.player();
    if (this.store.playing()) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.store.duration() || seconds));
    this.player().seekTo(clamped, true);
    this.store.currentTime.set(clamped);
  }

  toggleMute(): void {
    const player = this.player();
    if (this.store.muted()) {
      player.unMute();
      this.store.muted.set(false);
    } else {
      player.mute();
      this.store.muted.set(true);
    }
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const player = this.player();
    player.setVolume(clamped * 100);
    if (clamped > 0 && this.store.muted()) {
      player.unMute();
      this.store.muted.set(false);
    }
    this.store.volume.set(clamped);
  }

  protected onReady(): void {
    const player = this.player();
    const duration = player.getDuration();
    if (duration > 0) {
      this.store.duration.set(duration);
      if (this.store.markOut() === 0) {
        this.store.markOut.set(duration);
      }
    }
    this.store.volume.set(player.getVolume() / 100);
    this.startPolling();
  }

  protected onStateChange(event: { data: number }): void {
    this.store.playing.set(event.data === YT_STATE_PLAYING);
  }

  private startPolling(): void {
    this.stopPolling();
    this.timer = setInterval(() => {
      const time = this.player().getCurrentTime();
      if (typeof time !== 'number') {
        return;
      }
      this.store.currentTime.set(time);
      if (this.store.playing() && time > this.store.markOut()) {
        this.seek(this.store.markIn());
      }
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
