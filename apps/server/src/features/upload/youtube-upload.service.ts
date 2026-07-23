import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleAuthService } from './google-auth.service';

export interface UploadInput {
  filePath: string;
  title: string;
  description: string;
}

export interface UploadOutput {
  youtubeVideoId: string;
  watchUrl: string;
}

const CATEGORY_PEOPLE_AND_BLOGS = '22';

@Injectable()
export class YoutubeUploadService {
  constructor(private readonly auth: GoogleAuthService) {}

  /** Resumable upload of the clip as a PRIVATE video on the user's channel. */
  async upload(input: UploadInput, onProgress: (percent: number) => void): Promise<UploadOutput> {
    const client = await this.auth.authorizedClient();
    if (!client) {
      throw new UnauthorizedException('Connect your Google account first.');
    }
    const { size } = await stat(input.filePath);
    const youtube = google.youtube({ version: 'v3', auth: client });
    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: input.title,
            description: input.description,
            categoryId: CATEGORY_PEOPLE_AND_BLOGS,
          },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
        },
        media: { body: createReadStream(input.filePath) },
      },
      {
        onUploadProgress: (event: { bytesRead: number }) => {
          onProgress(Math.min(99, (event.bytesRead / size) * 100));
        },
      },
    );
    const youtubeVideoId = response.data.id ?? '';
    return { youtubeVideoId, watchUrl: `https://youtu.be/${youtubeVideoId}` };
  }
}
