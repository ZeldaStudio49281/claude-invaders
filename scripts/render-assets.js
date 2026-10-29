// Genererar favicon.svg, apple-touch-icon.png och og-image.png. Kör: npm run assets
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SPRITES } from '../js/sprites.js';
import { PALETTE } from '../js/palette.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Favicon: spelarens sprite (11x11) med en pixels marginal på mörkbrun bakgrund
const COLORS = { o: PALETTE.accent, d: PALETTE.accentDark, C: PALETTE.cream };
const rows = SPRITES.player;
const n = rows.length + 2;
const rects = [];
rows.forEach((row, y) => [...row].forEach((ch, x) => {
  if (COLORS[ch]) rects.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${COLORS[ch]}"/>`);
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">
<rect width="${n}" height="${n}" fill="${PALETTE.bg}"/>
${rects.join('\n')}
</svg>
`;
await writeFile(join(root, 'favicon.svg'), svg);

const server = createServer(async (req, res) => {
  try {
    const p = req.url.split('?')[0];
    const body = await readFile(join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'content-type': TYPES[extname(p === '/' ? 'x.html' : p)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
try {
  // apple-touch-icon 180x180: samma SVG, utan antialiasing
  let page = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await page.setContent(`<body style="margin:0;background:${PALETTE.bg}"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="180" height="180" style="display:block;image-rendering:pixelated"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: join(root, 'apple-touch-icon.png') });
  await page.close();

  // og-image 1200x630: startmeny centrerad på mörkbrun bakgrund (canvasen skalas i heltal, 2x = 640x480)
  page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(base + '/');
  await page.waitForFunction(() => window.__game !== undefined);
  await page.waitForFunction(() => window.__game.frames > 30);
  await page.screenshot({ path: join(root, 'og-image.png') });
} finally {
  await browser.close();
  server.close();
}
