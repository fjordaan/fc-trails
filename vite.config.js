import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: '/fc-trails/',
  publicDir: 'public',
  appType: 'mpa',
  server: {
    port: 5173,
    host: true,
    open: '/trails/tree-trail/',
    hmr: false
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        'tree-trail': resolve(__dirname, 'trails/tree-trail/index.html'),
        '404': resolve(__dirname, '404.html')
      }
    }
  },
  plugins: [
    {
      name: 'rewrite-trail-routes',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Rewrite trail sub-routes to their index.html
          const match = req.url.match(/^\/trails\/([^/]+)\/(intro|\d+)$/);
          if (match) {
            req.url = `/trails/${match[1]}/index.html`;
          }
          next();
        });
      }
    }
  ]
});
