// Publiceringskontroll (Fas 7): resurser, sökvägar, meta-taggar och körning under en undersökväg
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = process.cwd();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SITE = 'https://zeldastudio49281.github.io/claude-invaders/';

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await jsFiles(join(dir, e.name))));
    else if (e.name.endsWith('.js')) out.push(join(dir, e.name));
  }
  return out;
}

test.describe('Publicering', () => {
  test('alla resurser som index.html refererar till laddas med status 200', async ({ page }) => {
    const bad = [];
    const seen = [];
    page.on('response', (r) => {
      seen.push(new URL(r.url()).pathname);
      if (r.status() !== 200) bad.push(`${r.status()} ${r.url()}`);
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__game !== undefined);
    expect(bad).toEqual([]);

    // Länkade resurser i <head> och <script> ska ha begärts (favicon och ikon hämtas inte alltid av webbläsaren, så de hämtas explicit)
    const refs = await page.evaluate(() => [
      ...document.querySelectorAll('link[href], script[src]'),
    ].map((el) => el.getAttribute('href') || el.getAttribute('src')));
    expect(refs).toEqual(expect.arrayContaining(['style.css', 'js/main.js', 'favicon.svg', 'apple-touch-icon.png']));
    for (const ref of refs) {
      const res = await page.request.get(new URL(ref, page.url()).href);
      expect(res.status(), ref).toBe(200);
    }
    expect(seen).toContain('/js/main.js');
    expect(seen).toContain('/style.css');
  });

  test('inga absoluta sökvägar (börjar med /) i index.html, style.css eller js/', async () => {
    const html = await readFile(join(root, 'index.html'), 'utf8');
    const attrs = [...html.matchAll(/\b(?:href|src|content)=["']([^"']*)["']/g)].map((m) => m[1]);
    expect(attrs.filter((a) => a.startsWith('/'))).toEqual([]);

    const css = await readFile(join(root, 'style.css'), 'utf8');
    expect([...css.matchAll(/url\(\s*["']?(\/[^)"']*)/g)].map((m) => m[1])).toEqual([]);
    expect([...css.matchAll(/@import\s+(?:url\()?\s*["']?(\/[^)"';]*)/g)].map((m) => m[1])).toEqual([]);

    const hits = [];
    for (const file of await jsFiles(join(root, 'js'))) {
      const src = await readFile(file, 'utf8');
      // import/fetch/new URL/Worker/Audio/Image med strängar som börjar med / (ej // eller regexliteraler)
      for (const m of src.matchAll(/(?:\bimport\s*\(|\bfrom\s+|\bfetch\s*\(|new\s+URL\s*\(|new\s+Worker\s*\(|new\s+Audio\s*\(|\.src\s*=\s*|\bimport\s+)\s*["'`](\/(?!\/)[^"'`]*)/g)) {
        hits.push(`${file}: ${m[1]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('meta-taggar, favicon och ikon finns', async ({ page }) => {
    await page.goto('/');
    const meta = (sel) => page.locator(sel).getAttribute('content');
    expect(await meta('meta[name=description]')).toMatch(/\S{10}/);
    expect(await meta('meta[name=theme-color]')).toBe('#1f1a17');
    expect(await meta('meta[property="og:title"]')).toBeTruthy();
    expect(await meta('meta[property="og:description"]')).toBeTruthy();
    expect(await meta('meta[property="og:type"]')).toBe('website');
    expect(await meta('meta[property="og:url"]')).toBe(SITE);
    expect(await meta('meta[property="og:image"]')).toBe(`${SITE}og-image.png`);
    expect(await meta('meta[property="og:locale"]')).toBe('sv_SE');
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
    await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', 'favicon.svg');
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', 'apple-touch-icon.png');

    // Bilderna har rätt storlek (PNG-huvudet: bredd och höjd på byte 16-23)
    const size = async (file) => {
      const b = await readFile(join(root, file));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(await size('og-image.png')).toEqual([1200, 630]);
    expect(await size('apple-touch-icon.png')).toEqual([180, 180]);
    expect(await readFile(join(root, 'favicon.svg'), 'utf8')).toContain('shape-rendering="crispEdges"');
  });

  test('spelet fungerar när det serveras under /claude-invaders/', async ({ page }) => {
    const server = createServer(async (req, res) => {
      const prefix = '/claude-invaders/';
      const p = decodeURIComponent(req.url.split('?')[0]);
      if (!p.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const rel = p.slice(prefix.length) || 'index.html';
      try {
        const body = await readFile(join(root, rel));
        res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' }).end(body);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/claude-invaders/`;
    try {
      const errors = [];
      const failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
      await page.goto(base);
      await page.waitForFunction(() => window.__game !== undefined);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => window.__game.state === 'playing');
      const f = await page.evaluate(() => window.__game.frames);
      await page.waitForFunction((t) => window.__game.frames >= t, f + 3);
      expect(failed).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
