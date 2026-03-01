import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';

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
  base: '/',
  publicDir: 'public',
  appType: 'mpa',
  server: {
    port: 5173,
    host: true,
    open: '/tree-trail/',
    hmr: false
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
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
          // Rewrite /{slug}/... to /trails/{slug}/... so dev serves from source structure
          const url = req.url.split('?')[0];
          const match = url.match(/^\/([^/]+)(\/.*)?$/);
          if (match) {
            const slug = match[1];
            if (slug === 'admin') {
              req.url = '/admin/index.html';
            } else {
              const trailDir = resolve(__dirname, 'trails', slug);
              if (existsSync(trailDir) && statSync(trailDir).isDirectory()) {
                const rest = match[2] || '/';
                if (rest.match(/^\/(intro|\d+)$/)) {
                  req.url = `/trails/${slug}/index.html`;
                } else {
                  req.url = `/trails/${slug}${rest}`;
                }
              }
            }
          }
          next();
        });
      }
    }
  ]
});
