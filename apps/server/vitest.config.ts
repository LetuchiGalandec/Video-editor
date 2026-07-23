import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: false,
  },
  plugins: [
    // SWC keeps NestJS decorator metadata working under Vitest (esbuild strips it).
    swc.vite({ module: { type: 'es6' } }),
  ],
});
