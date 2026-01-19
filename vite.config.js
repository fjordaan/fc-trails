import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  appType: 'mpa',
  server: {
    port: 5173,
    host: true,
    open: '/trails/tree-trail/',
    hmr: false
  },
  build: {
    outDir: 'dist'
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
