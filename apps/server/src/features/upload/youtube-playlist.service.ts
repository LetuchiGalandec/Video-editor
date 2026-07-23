import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { OAuth2Client } from '../auth/google-auth.service';

export interface PlaylistSummary {
  id: string;
  title: string;
}

const MAX_PLAYLISTS = 50;

/** Thin wrappers over the YouTube Data API playlist endpoints, always scoped to
 * the signed-in account behind the passed OAuth client. */
@Injectable()
export class YoutubePlaylistService {
  async list(client: OAuth2Client): Promise<PlaylistSummary[]> {
    const youtube = google.youtube({ version: 'v3', auth: client });
    const res = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: MAX_PLAYLISTS,
    });
    return (res.data.items ?? [])
      .map((item) => ({ id: item.id ?? '', title: item.snippet?.title ?? 'Untitled playlist' }))
      .filter((playlist) => playlist.id !== '');
  }

  async create(client: OAuth2Client, title: string): Promise<string> {
    const youtube = google.youtube({ version: 'v3', auth: client });
    const res = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title },
        status: { privacyStatus: 'private' },
      },
    });
    return res.data.id ?? '';
  }

  async addVideo(client: OAuth2Client, playlistId: string, videoId: string): Promise<void> {
    const youtube = google.youtube({ version: 'v3', auth: client });
    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      },
    });
  }
}
