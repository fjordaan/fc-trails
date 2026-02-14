import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';

// Use /fc-trails/ base path only for production (GitHub Pages)
const base = process.env.NODE_ENV === 'production' ? '/fc-trails/' : '/';

// Discover all trail directories dynamically
const trailsDir = resolve(__dirname, 'trails');
const trailInputs = {};

if (existsSync(trailsDir)) {
  readdirSync(trailsDir).forEach(name => {
    const trailPath = resolve(trailsDir, name);
    const indexPath = resolve(trailPath, 'index.html');
    if (statSync(trailPath).isDirectory() && existsSync(indexPath)) {
      trailInputs[name] = indexPath;
    }
  });
}

export default defineConfig({
  root: '.',
  base,
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
        ...trailInputs,
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
