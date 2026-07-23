import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { EditorStore } from './editor-store';

/**
 * Owns the native <video> element: DOM events flow into EditorStore signals,
 * and imperative playback commands (seek/toggle/volume) are exposed as methods
 * for the editor page to call. While playing, the selection loops: passing the
 * out-marker jumps back to the in-marker.
 */
@Component({
  selector: 'app-video-player',
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
})
export class VideoPlayer {
  readonly src = input.required<string>();

  protected readonly store = inject(EditorStore);
  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('vid');

  private get video(): HTMLVideoElement {
    return this.videoRef().nativeElement;
  }

  toggle(): void {
    const video = this.video;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.store.duration() || seconds));
    this.video.currentTime = clamped;
    this.store.currentTime.set(clamped);
  }

  toggleMute(): void {
    this.video.muted = !this.video.muted;
  }

  setVolume(volume: number): void {
    this.video.volume = Math.max(0, Math.min(1, volume));
    if (this.video.volume > 0 && this.video.muted) {
      this.video.muted = false;
    }
  }

  protected onLoadedMetadata(): void {
    const video = this.video;
    this.store.duration.set(video.duration);
    if (this.store.markOut() === 0) {
      this.store.markOut.set(video.duration);
    }
    this.store.volume.set(video.volume);
    this.store.muted.set(video.muted);
  }

  protected onTimeUpdate(): void {
    const video = this.video;
    this.store.currentTime.set(video.currentTime);
    if (!video.paused && video.currentTime > this.store.markOut()) {
      this.seek(this.store.markIn());
    }
  }

  protected onVolumeChange(): void {
    this.store.volume.set(this.video.volume);
    this.store.muted.set(this.video.muted);
  }
}
