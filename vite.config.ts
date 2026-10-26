import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; updates: { repo: string } };

const preview = process.env.UP_PREVIEW === '1';
// Desktop (Electron) builds ship their own files, so they skip the service worker.
const desktop = process.env.UP_DESKTOP === '1';

export default defineConfig({
  // UP_BASE serves the web app from a sub-path, e.g. /universal/ on GitHub Pages.
  base: process.env.UP_BASE ?? (preview ? './' : '/'),
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? pkg.version),
    __UPDATE_REPO__: JSON.stringify(pkg.updates.repo),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    !preview &&
      !desktop &&
      VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.svg', 'brand/*.png', 'favicon.svg'],
      manifest: {
        name: 'Universal Planner',
        short_name: 'Planner',
        description: 'Your calendar, tasks, notes, ideas and health — in one calm place. By Eternal Inc.',
        theme_color: '#0A0A0A',
        background_color: '#FFFFFF',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['productivity', 'health', 'lifestyle'],
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The language-model runtime is only needed once someone installs Afina's model.
        globIgnores: ['**/llm.worker-*.js', '**/web-llm-*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/(llm\.worker|web-llm)-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'afina-runtime', expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['framer-motion'],
          'web-llm': ['@mlc-ai/web-llm'],
        },
      },
    },
  },
});
