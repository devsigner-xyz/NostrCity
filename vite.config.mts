import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { resolveManualChunk } from './src/build/chunking';
import { createAppHistoryFallbackPlugin } from './src/build/app-history-fallback';

const landingEntry = fileURLToPath(new URL('./index.html', import.meta.url));
const appEntry = fileURLToPath(new URL('./app/index.html', import.meta.url));

export default defineConfig({
  envPrefix: ['VITE_', 'NOSTR_CITY_PUBLIC_'],
  plugins: [createAppHistoryFallbackPlugin(), react(), tailwindcss()],
  server: {
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      jsts: 'jsts/dist/jsts.min.js',
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'app/index.html'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        landing: landingEntry,
        app: appEntry,
      },
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
});
