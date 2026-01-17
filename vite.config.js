import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: '/trails/tree-trail/index.html'
  },
  build: {
    outDir: 'dist'
  }
});
