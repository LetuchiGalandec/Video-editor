import { describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { DownloadsController } from './downloads.controller';
import { ResolveController } from './resolve.controller';
import type { DownloadsService } from './downloads.service';
import { loadConfig } from '../../config/config';

const fakeService = {
  startDownload: () => ({ id: 'j' }),
  resolve: async () => ({ youtubeId: 'x', title: 't', durationSec: 1, playableInEmbed: true }),
} as unknown as DownloadsService;

describe('YouTube endpoints gating', () => {
  const disabled = { ...loadConfig(), youtubeEnabled: false };
  const enabled = { ...loadConfig(), youtubeEnabled: true };

  it('downloads: 404 when disabled', () => {
    const controller = new DownloadsController(fakeService, disabled);
    expect(() => controller.start({ url: 'https://youtu.be/x' })).toThrow(NotFoundException);
  });

  it('downloads: works when enabled', () => {
    const controller = new DownloadsController(fakeService, enabled);
    expect(controller.start({ url: 'https://youtu.be/x' })).toEqual({ jobId: 'j' });
  });

  it('resolve: 404 when disabled', async () => {
    const controller = new ResolveController(fakeService, disabled);
    await expect(controller.resolve({ url: 'https://youtu.be/x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
