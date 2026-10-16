// Inline the built page into one self-contained HTML file for quick review
// without a server. Run after `npm run build`:  node scripts/build-preview.mjs
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const out = path.resolve(process.argv[2] || '精修版预览.html');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, f) =>
  `<style>${fs.readFileSync(path.join(dist, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, f) =>
  // a module script keeps its deferred timing; "</script" inside the bundle must not close the tag
  `<script type="module">${fs.readFileSync(path.join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);

if (/\.\/assets\/[^"']+\.(js|css)/.test(html)) throw new Error('an asset reference was not inlined');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
