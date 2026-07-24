import { describe, it, expect } from 'vitest';
import { ProbeService } from './probe.service';
import { loadConfig } from '../../config/config';

describe('ProbeService codec info', () => {
  it('reports h264/aac and an mp4-family container for the sample fixture', async () => {
    const probe = new ProbeService();
    const media = await probe.probe(loadConfig().fixturePath);
    expect(media.videoCodec).toBe('h264');
    expect(media.audioCodec).toBe('aac');
    expect(media.container.toLowerCase()).toContain('mp4');
    expect(media.durationSec).toBeGreaterThan(0);
  });
});
