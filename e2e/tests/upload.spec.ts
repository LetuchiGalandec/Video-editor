import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'http://localhost:3000';
const FIXTURE = join(__dirname, '..', '..', 'fixtures', 'sample.mp4');

test('GET /api/config returns upload settings', async ({ request }) => {
  const res = await request.get(`${API}/api/config`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.youtubeEnabled).toBe('boolean');
  expect(body.maxUploadBytes).toBeGreaterThan(0);
  expect(body.maxUploadDurationSec).toBeGreaterThan(0);
});

test('POST /api/videos ingests an uploaded file into a playable source', async ({ request }) => {
  const upload = await request.post(`${API}/api/videos`, {
    multipart: {
      file: { name: 'sample.mp4', mimeType: 'video/mp4', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(upload.status()).toBe(202);
  const { jobId } = await upload.json();
  expect(jobId).toBeTruthy();

  // Poll the job to completion.
  let state = 'queued';
  for (let i = 0; i < 40 && state !== 'done' && state !== 'error'; i++) {
    const job = await (await request.get(`${API}/api/jobs/${jobId}`)).json();
    state = job.state;
    if (state === 'done' || state === 'error') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(state).toBe('done');

  const meta = await request.get(`${API}/api/videos/${jobId}/meta`);
  expect(meta.status()).toBe(200);
  expect((await meta.json()).durationSec).toBeGreaterThan(0);
});

test('POST /api/videos rejects a non-video upload with 400', async ({ request }) => {
  const res = await request.post(`${API}/api/videos`, {
    multipart: {
      file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    },
  });
  expect(res.status()).toBe(400);
});

test('UI: upload a file, reach the editor, generate and download a clip', async ({ page }) => {
  await page.goto('/');

  // Switch to the upload source if the YouTube option is present.
  const uploadToggle = page.getByTestId('source-upload');
  if (await uploadToggle.count()) {
    await uploadToggle.click();
  }

  await page.getByTestId('file-input').setInputFiles(FIXTURE);

  // Two-phase progress → lands on the native editor.
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await expect(page.locator('video')).toBeVisible();

  // Generate a clip using the existing editor controls, then download.
  await page.getByRole('button', { name: /generate/i }).click();
  await page.waitForURL(/\/result\//, { timeout: 30_000 });

  const downloadLink = page.getByRole('link', { name: /download/i });
  const href = await downloadLink.getAttribute('href');
  expect(href).toContain('/file');
  const res = await page.request.get(`http://localhost:3000${href}`);
  expect(res.status()).toBe(200);
  expect(Number(res.headers()['content-length'])).toBeGreaterThan(0);
});
