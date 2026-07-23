import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { GoogleAuthService } from '../auth/google-auth.service';
import { SessionService } from '../auth/session.service';
import { YoutubePlaylistService } from './youtube-playlist.service';
import type { PlaylistSummary } from './youtube-playlist.service';

@Controller('youtube')
export class YoutubeController {
  constructor(
    private readonly auth: GoogleAuthService,
    private readonly session: SessionService,
    private readonly playlists: YoutubePlaylistService,
  ) {}

  @Get('playlists')
  async list(@Req() req: Request): Promise<PlaylistSummary[]> {
    const sessionId = this.session.peek(req);
    const client = sessionId ? await this.auth.clientForSession(sessionId) : null;
    if (!client) {
      throw new UnauthorizedException('Connect your Google account first.');
    }
    return this.playlists.list(client);
  }
}
