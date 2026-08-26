import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 8080,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  // Keep vendored three.min.js fallback for offline file:// — no CDN.
  // When running `vite`, importmap resolves `three` to local vendored or node_modules.
});
