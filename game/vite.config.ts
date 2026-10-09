import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const WORLD = resolve(import.meta.dirname, '../world');

/** Serve the baked world package (../world) at /world in dev, and copy it into the build. */
function worldPackage(): Plugin {
  return {
    name: 'world-package',
    configureServer(server) {
      server.middlewares.use('/world', (req, res, next) => {
        const path = normalize(join(WORLD, decodeURIComponent((req.url ?? '/').split('?')[0])));
        if (!path.startsWith(WORLD) || !existsSync(path) || !statSync(path).isFile()) return next();
        res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(path).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(WORLD)) {
        cpSync(WORLD, resolve(import.meta.dirname, 'dist/world'), {
          recursive: true,
          filter: (src: string) => !src.includes('preview'),
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [worldPackage()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
});
