import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Runs fully offline: the server is started with FETCHER=fake, which copies
// fixtures/sample.mp4 (4s testsrc2 clip) instead of touching YouTube. The Quick
// (embed) UI needs youtube.com, so the UI journeys use Precise mode; the Quick
// backend path is covered at the API level below.
const usePreciseMode = async (page: Page): Promise<void> => {
  await page.getByRole('radio', { name: /Precise/ }).click();
};

test('precise: fetch → trim → generate → download → upload state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Crop the');

  await page
    .getByRole('textbox', { name: /YouTube link/i })
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await usePreciseMode(page);
  await page.getByRole('button', { name: /Fetch it/ }).click();

  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  await expect(page.locator('.video-title')).toContainText('Sample fixture video');

  const start = page.getByRole('textbox', { name: 'Start' });
  await start.fill('0:01.0');
  await start.press('Tab');
  const end = page.getByRole('textbox', { name: 'End' });
  await end.fill('0:03.0');
  await end.press('Tab');
  await expect(page.locator('.length-value')).toHaveText('0:02.0');

  await page.getByRole('button', { name: /Generate clip/ }).click();
  await page.waitForURL(/\/result\//, { timeout: 60_000 });
  await expect(page.locator('.clip-title')).toContainText('Sample fixture video');
  await expect(page.locator('.facts')).toContainText('0:01.0 → 0:03.0');

  const downloadHref = await page
    .getByRole('link', { name: /Download \.mp4/ })
    .getAttribute('href');
  expect(downloadHref).toBeTruthy();
  const response = await page.request.get(downloadHref as string);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('video/mp4');
  expect((await response.body()).length).toBeGreaterThan(10_000);

  // Without Google credentials the upload card must explain itself instead of failing.
  await expect(page.locator('.upload-card')).toContainText(
    /isn't configured|Sign in with YouTube/,
  );
});

test('quick: resolve (no download) then section-download a clip via the API', async ({
  request,
}) => {
  const resolveRes = await request.post('/api/resolve', {
    data: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  });
  expect(resolveRes.status()).toBe(200);
  const resolved = await resolveRes.json();
  expect(resolved.youtubeId).toBe('dQw4w9WgXcQ');
  expect(resolved.playableInEmbed).toBe(true);

  const clipRes = await request.post('/api/clips', {
    data: {
      source: 'youtube',
      youtubeId: resolved.youtubeId,
      title: 'Quick clip',
      startSec: 1,
      endSec: 3,
      mode: 'fast',
    },
  });
  expect(clipRes.status()).toBe(202);
  const { jobId } = await clipRes.json();

  let state = 'queued';
  for (let i = 0; i < 40 && state !== 'done' && state !== 'error'; i += 1) {
    const job = await (await request.get(`/api/jobs/${jobId}`)).json();
    state = job.state;
    if (state === 'done' || state === 'error') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(state).toBe('done');

  const file = await request.get(`/api/clips/${jobId}/file`);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('video/mp4');
  expect((await file.body()).length).toBeGreaterThan(10_000);
});

test('rejects a non-YouTube link before hitting the server', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: /YouTube link/i });
  await input.fill('https://vimeo.com/12345678');
  await expect(page.getByRole('button', { name: /Preview it|Fetch it/ })).toBeDisabled();
  await expect(page.locator('.hint')).toContainText("doesn't look like a YouTube video link");
});

test('keyboard trimming works on the timeline handles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: /YouTube link/i }).fill('https://youtu.be/dQw4w9WgXcQ');
  await usePreciseMode(page);
  await page.getByRole('button', { name: /Fetch it/ }).click();
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });

  const startHandle = page.getByRole('slider', { name: 'Clip start' });
  await startHandle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(startHandle).toHaveAttribute('aria-valuenow', '1');
});
