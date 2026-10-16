import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only helper: POST a data URL to /__capture?name=foo to save a
// full-resolution frame into ./evidence for visual review. Not in builds.
function captureFrames() {
  return {
    name: 'capture-frames',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const url = new URL(req.url, 'http://local');
        const name = (url.searchParams.get('name') || 'frame').replace(/[^a-z0-9_-]/gi, '');
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const m = body.match(/^data:image\/(png|jpeg);base64,(.+)$/);
          if (!m) {
            res.statusCode = 400;
            res.end('bad');
            return;
          }
          const dir = path.resolve(server.config.root, 'evidence');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `${name}.${m[1] === 'png' ? 'png' : 'jpg'}`);
          fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: process.env.AIR_CAPTURE === '1' ? [captureFrames()] : [],
  server: { host: '127.0.0.1', port: 5190, strictPort: false },
  preview: { host: '127.0.0.1', port: 5191, strictPort: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
