import { defineConfig } from '@playwright/test';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run start:dev -w server',
      cwd: repoRoot,
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: '3000',
        FETCHER: 'fake',
        DATA_DIR: path.join(__dirname, '.data-e2e'),
      },
    },
    {
      command: 'npm run start -w web',
      cwd: repoRoot,
      url: 'http://localhost:4200',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
