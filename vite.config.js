import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolvePort, viewerUrl } from './lib/service.js';

const backendUrl = viewerUrl(resolvePort({
  cwd: process.env.PINWHY_CWD || process.cwd(),
}));

export default defineConfig({
  root: 'web',
  // Assets stay relative so a host-embedded viewer works under a token prefix.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  build: {
    outDir: '../public',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': backendUrl,
      '/events': backendUrl,
    },
  },
  preview: {
    allowedHosts: true,
  },
});
