import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { APP_CONFIG, loadConfig } from '../../config/config';
import { ConfigModule } from '../../config/config.module';
import { VideosModule } from './videos.module';

const FIXTURE = path.resolve(__dirname, '../../../../../fixtures/sample.mp4');

describe('VideosController', () => {
  let app: INestApplication;
  let dataDir: string;
  const videoId = randomUUID();

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'cropcorn-videos-'));
    const videoDir = path.join(dataDir, 'videos', videoId);
    await mkdir(videoDir, { recursive: true });
    await copyFile(FIXTURE, path.join(videoDir, 'source.mp4'));
    await writeFile(
      path.join(videoDir, 'info.json'),
      JSON.stringify({
        videoId: 'fixture0000',
        title: 'Sample fixture video',
        durationSec: 4,
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    );

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, VideosModule],
    })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...loadConfig(), dataDir })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns metadata combining info.json and ffprobe', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/videos/${videoId}/meta`)
      .expect(200);
    expect(res.body.title).toBe('Sample fixture video');
    expect(res.body.durationSec).toBeGreaterThan(3.5);
    expect(res.body.durationSec).toBeLessThan(4.5);
    expect(res.body.width).toBe(640);
    expect(res.body.height).toBe(360);
    expect(res.body.sizeBytes).toBeGreaterThan(0);
  });

  it('serves partial content for Range requests', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/videos/${videoId}/stream`)
      .set('Range', 'bytes=0-1023')
      .expect(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-1023\/\d+$/);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toContain('video/mp4');
  });

  it('serves the whole file without a Range header', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/videos/${videoId}/stream`)
      .expect(200);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(100_000);
  });

  it('404s for unknown video ids', async () => {
    await request(app.getHttpServer())
      .get(`/api/videos/${randomUUID()}/meta`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/videos/${randomUUID()}/stream`)
      .expect(404);
  });

  it('rejects ids that are not UUIDs (path safety)', async () => {
    await request(app.getHttpServer())
      .get('/api/videos/..%2F..%2Fetc/stream')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/videos/not-a-uuid/meta')
      .expect(400);
  });
});
