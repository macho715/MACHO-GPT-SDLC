import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      // Single source of truth: compatibilityDate/Flags are read from wrangler.toml
      // via configPath. Do NOT redefine them here — duplication causes test/prod drift.
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.config.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
