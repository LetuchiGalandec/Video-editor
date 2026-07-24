import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { OAuth2Client } from '../auth/google-auth.service';

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
  /** Resumable upload of the clip as an UNLISTED video on the signed-in channel. */
  async upload(
    client: OAuth2Client,
    input: UploadInput,
    onProgress: (percent: number) => void,
  ): Promise<UploadOutput> {
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
          status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
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
