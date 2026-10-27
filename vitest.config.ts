import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test'), __UPDATE_REPO__: JSON.stringify('test/test') },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Only the English and Russian date parsers, not every chrono locale.
      'chrono-node/en': fileURLToPath(new URL('./node_modules/chrono-node/dist/esm/locales/en/index.js', import.meta.url)),
      'chrono-node/ru': fileURLToPath(new URL('./node_modules/chrono-node/dist/esm/locales/ru/index.js', import.meta.url)),
    },
  },
  test: { environment: 'node', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.ts'] },
});
