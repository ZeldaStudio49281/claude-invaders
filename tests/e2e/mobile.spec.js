// Mobil, layout, autopaus och HUD (Fas 6)
import { test, expect, devices } from '@playwright/test';
import { openGame, startGame, press, frames, g, expectNoErrors } from './helpers.js';

// Pixel 7 utan defaultBrowserType (det går inte att ändra i en describe-grupp)
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
const touch = (viewport) => ({ ...pixel, viewport });
const desktop = { hasTouch: false, isMobile: false, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

const waitState = (page, s) => page.waitForFunction((x) => window.__game.state === x, s);
const ptr = (page, sel, type, pointerId) => page.locator(sel).dispatchEvent(type, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });
// Playwrights WebKit-bygge på Windows saknar Web Audio; ljudkontroller hoppas då över (spelet är tyst utan fel)
const hasAudio = (page) => page.evaluate(() => typeof AudioContext !== 'undefined');
const isDown = (page, action) => page.evaluate(async (a) => (await import('/js/input.js')).isDown(a), action);

// Hindrar att fienderna stör och ger gott om liv
const calm = (page) => g(page, (game) => {
  game.debug.freezeEnemies(true);
  game.debug.clearEnemyBullets();
  game.debug.setLives(99);
});

// Mäter layouten: sidans overflow samt canvasens och de synliga knapparnas rutor
async function layout(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    const visible = (el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
    const de = document.documentElement;
    return {
      dpr: window.devicePixelRatio,
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollW: de.scrollWidth,
      scrollH: de.scrollHeight,
      canvas: box(document.getElementById('game')),
      buttons: [...document.querySelectorAll('.pad-btn')].filter(visible).map((b) => ({ id: b.id, ...box(b) })),
    };
  });
}

const inside = (b, vw, vh) => b.x >= -0.5 && b.y >= -0.5 && b.r <= vw + 0.5 && b.b <= vh + 0.5;
const overlap = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

test.describe('Touchknappar på touchenheter', () => {
  test.use(touch({ width: 390, height: 844 }));

  test('knapparna syns, har etiketter från strings.js och är stylade mot beröring', async ({ page }) => {
    const errors = await openGame(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('touch'))).toBe(true);
    const labels = await page.evaluate(async () => {
      const { STR } = await import('/js/strings.js');
      return Object.fromEntries(['left', 'right', 'fire', 'special', 'pause', 'mute'].map((k) => [k, STR.touch[k].aria]));
    });
    for (const [id, aria] of Object.entries(labels)) {
      const btn = page.locator(`#btn-${id}`);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-label', aria);
    }
    // Namnknapparna är dolda utanför namninmatningen
    for (const id of ['up', 'down', 'confirm']) await expect(page.locator(`#btn-${id}`)).toBeHidden();

    const style = await page.locator('#btn-fire').evaluate((el) => {
      const cs = getComputedStyle(el);
      const ev = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
      el.dispatchEvent(ev);
      return { touchAction: cs.touchAction, userSelect: cs.userSelect, ctxPrevented: ev.defaultPrevented };
    });
    expect(style).toEqual({ touchAction: 'none', userSelect: 'none', ctxPrevented: true });
    expect(await page.evaluate(() => document.querySelector('meta[name=viewport]').content)).toContain('viewport-fit=cover');
    await expectNoErrors(errors);
  });

  test('tryck på Skjut skapar ett skott', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => { game.audio.log.length = 0; });
    await page.locator('#btn-fire').tap();
    await page.waitForFunction(() => window.__game.audio.log.includes('shoot'));
    await expectNoErrors(errors);
  });

  test('Refaktorering-knappen rensar en rad när Kontextfönstret är fullt', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const before = await g(page, (game) => game.enemies.length);
    await g(page, (game) => game.debug.setContext(8));
    await page.locator('#btn-special').tap();
    await page.waitForFunction((n) => window.__game.enemies.length < n, before);
    await expectNoErrors(errors);
  });

  test('Paus-knappen pausar och återupptar, Ljud-knappen växlar ljudet', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await page.locator('#btn-pause').tap();
    await waitState(page, 'paused');
    await page.locator('#btn-pause').tap();
    await waitState(page, 'playing');
    const muted = await g(page, (game) => game.muted);
    await page.locator('#btn-mute').tap();
    await page.waitForFunction((m) => window.__game.muted !== m, muted);
    await expect(page.locator('#btn-mute')).toHaveAttribute('aria-pressed', String(!muted));
    await expectNoErrors(errors);
  });

  test('att hålla vänster- och högerknappen flyttar spelaren', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const x0 = await g(page, (game) => game.player.x);
    await ptr(page, '#btn-left', 'pointerdown', 1);
    await page.waitForFunction((x) => window.__game.player.x < x - 30, x0);
    await ptr(page, '#btn-left', 'pointerup', 1);
    await frames(page, 2);
    const x1 = await g(page, (game) => game.player.x);
    await frames(page, 5);
    expect(await g(page, (game) => game.player.x)).toBe(x1); // stannar när knappen släpps

    await ptr(page, '#btn-right', 'pointerdown', 1);
    await page.waitForFunction((x) => window.__game.player.x > x + 30, x1);
    await ptr(page, '#btn-right', 'pointerup', 1);
    await expectNoErrors(errors);
  });

  test('multitouch: flytta och skjuta samtidigt, och varje knapp släpps för sig', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await ptr(page, '#btn-left', 'pointerdown', 1);
    await ptr(page, '#btn-fire', 'pointerdown', 2);
    expect(await isDown(page, 'left')).toBe(true);
    expect(await isDown(page, 'fire')).toBe(true);
    await expect(page.locator('#btn-left')).toHaveClass(/down/);
    await expect(page.locator('#btn-fire')).toHaveClass(/down/);
    const x0 = await g(page, (game) => game.player.x);
    await page.waitForFunction((x) => window.__game.player.x < x - 20, x0); // flyttar medan skjut hålls

    await ptr(page, '#btn-fire', 'pointerup', 2);
    expect(await isDown(page, 'fire')).toBe(false);
    expect(await isDown(page, 'left')).toBe(true);
    await ptr(page, '#btn-left', 'pointerup', 1);
    expect(await isDown(page, 'left')).toBe(false);
    await expectNoErrors(errors);
  });

  test('två fingrar på samma knapp: den släpps först när båda lyft', async ({ page }) => {
    const errors = await startGame(page);
    await ptr(page, '#btn-right', 'pointerdown', 1);
    await ptr(page, '#btn-right', 'pointerdown', 2);
    await ptr(page, '#btn-right', 'pointerup', 1);
    expect(await isDown(page, 'right')).toBe(true);
    await ptr(page, '#btn-right', 'pointerup', 2);
    expect(await isDown(page, 'right')).toBe(false);
    await expectNoErrors(errors);
  });

  for (const type of ['pointercancel', 'pointerleave']) {
    test(`${type} släpper knappen`, async ({ page }) => {
      const errors = await startGame(page);
      await ptr(page, '#btn-left', 'pointerdown', 3);
      expect(await isDown(page, 'left')).toBe(true);
      await ptr(page, '#btn-left', type, 3);
      expect(await isDown(page, 'left')).toBe(false);
      await expectNoErrors(errors);
    });
  }

  test('ett tryck på canvasen i menyn startar spelet och låser upp ljudet', async ({ page }) => {
    const errors = await openGame(page);
    expect(await g(page, (game) => game.audio.ctxState)).toBe('none');
    await page.locator('canvas#game').tap();
    await waitState(page, 'playing');
    if (await hasAudio(page)) expect(await g(page, (game) => game.audio.ctxState)).not.toBe('none');
    await expectNoErrors(errors);
  });

  test('ett tryck på canvasen på game over startar om', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.lives = 0; });
    await waitState(page, 'gameover');
    await page.locator('canvas#game').tap();
    await waitState(page, 'playing');
    await expectNoErrors(errors);
  });

  test('namninmatning med knapparna: pilar, vänster/höger och OK', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.score = 640; game.lives = 0; });
    await waitState(page, 'enterName');
    for (const id of ['up', 'down', 'confirm', 'left', 'right']) await expect(page.locator(`#btn-${id}`)).toBeVisible();
    for (const id of ['fire', 'special']) await expect(page.locator(`#btn-${id}`)).toBeHidden();

    // Ett tryck per frame: två tryck inom samma frame räknas som ett
    for (const id of ['up', 'right', 'down', 'down']) {
      await page.locator(`#btn-${id}`).tap();
      await frames(page, 2);
    }
    expect(await g(page, (game) => ({ ...game.nameEntry }))).toEqual({ name: 'B9A', pos: 1 });
    await page.locator('#btn-confirm').tap();
    await waitState(page, 'gameover');
    expect(await g(page, (game) => game.scores.map((e) => e.name))).toEqual(['B9A']);
    // Spelknapparna är tillbaka
    await expect(page.locator('#btn-fire')).toBeVisible();
    await expectNoErrors(errors);
  });

  test('skärmdump i stående läge under spel', async ({ page }) => {
    const errors = await startGame(page);
    await page.waitForFunction(() => window.__game.enemyBullets.length > 0 || window.__game.frames > 90);
    await page.screenshot({ path: 'test-results/fas6-portrait.png' });
    await expectNoErrors(errors);
  });
});

test.describe('Touchknappar slås på av första touch-händelsen', () => {
  test.use(desktop);

  test('knapparna är dolda på desktop men visas efter en touchstart', async ({ page }) => {
    const errors = await openGame(page);
    for (const id of ['left', 'right', 'fire', 'special', 'pause', 'mute']) await expect(page.locator(`#btn-${id}`)).toBeHidden();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event('touchstart')));
    await expect(page.locator('#btn-fire')).toBeVisible();
    expect(await g(page, (game) => game.touchMode)).toBe(true);
    await expectNoErrors(errors);
  });

  test('en pekarhändelse av typen touch slår också på knapparna, en mus gör det inte', async ({ page }) => {
    const errors = await openGame(page);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', pointerId: 5 })));
    await expect(page.locator('#btn-fire')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 6 })));
    await expect(page.locator('#btn-fire')).toBeVisible();
    await expectNoErrors(errors);
  });

  test('desktop: ingen knapp tar plats och skalan är ett heltal', async ({ page }) => {
    await openGame(page);
    const l = await layout(page);
    expect(l.buttons).toEqual([]);
    expect(l.canvas.w).toBe(960);
    expect(l.canvas.h).toBe(720);
  });
});

for (const [name, vp] of [['stående 390x844', { width: 390, height: 844 }], ['liggande 844x390', { width: 844, height: 390 }]]) {
  test.describe(`Layout ${name}`, () => {
    test.use({ ...touch(vp), deviceScaleFactor: 2.625 }); // som en Pixel 7

    test('canvas och knappar ryms utan scroll, skalan är hela enhetspixlar och inget överlappar canvasen', async ({ page }) => {
      const errors = await startGame(page);
      for (const mode of ['play', 'name']) {
        if (mode === 'name') {
          await g(page, (game) => { game.debug.freezeEnemies(true); game.score = 50; game.lives = 0; });
          await waitState(page, 'enterName');
          await frames(page, 2);
        }
        const l = await layout(page);
        expect(l.scrollW).toBeLessThanOrEqual(l.vw);
        expect(l.scrollH).toBeLessThanOrEqual(l.vh);
        expect(inside(l.canvas, l.vw, l.vh)).toBe(true);
        // Varje spelpixel är ett helt antal enhetspixlar
        expect(Math.round(l.canvas.w * l.dpr) % 320).toBe(0);
        expect(l.canvas.h).toBeCloseTo(l.canvas.w * 0.75, 1);
        expect(l.buttons.length).toBe(mode === 'play' ? 6 : 7);
        for (const b of l.buttons) {
          expect(inside(b, l.vw, l.vh), `${b.id} ryms i fönstret`).toBe(true);
          expect(overlap(b, l.canvas), `${b.id} överlappar canvasen`).toBe(false);
          expect(b.w, `${b.id} är stor nog att trycka på`).toBeGreaterThanOrEqual(40);
          expect(b.h).toBeGreaterThanOrEqual(40);
        }
        if (vp.height > vp.width) {
          for (const b of l.buttons) expect(b.y).toBeGreaterThanOrEqual(l.canvas.b); // under canvasen
          expect(l.canvas.y).toBeLessThan(10); // canvasen överst
          expect(l.canvas.w).toBeGreaterThan(l.vw * 0.85); // canvasen fyller nästan hela bredden
        } else {
          const mid = l.canvas.x + l.canvas.w / 2;
          for (const b of l.buttons) expect(b.r <= l.canvas.x || b.x >= l.canvas.r, `${b.id} vid sidan`).toBe(true);
          expect(Math.abs(mid - l.vw / 2)).toBeLessThan(2); // canvasen i mitten
          const left = l.buttons.find((b) => b.id === 'btn-left');
          const right = l.buttons.find((b) => b.id === 'btn-right');
          expect(left.r).toBeLessThanOrEqual(l.canvas.x);
          expect(right.r).toBeLessThanOrEqual(l.canvas.x); // vänster pad innehåller båda rörelseknapparna
        }
      }
      await expectNoErrors(errors);
    });

    test('skärmdump', async ({ page }) => {
      const errors = await startGame(page);
      await page.waitForFunction(() => window.__game.enemyBullets.length > 0 || window.__game.frames > 90);
      await page.screenshot({ path: `test-results/fas6-${vp.width > vp.height ? 'landscape' : 'portrait-dpr'}.png` });
      await expectNoErrors(errors);
    });
  });
}

test.describe('Smal skärm', () => {
  test.use(touch({ width: 300, height: 600 }));

  test('300 px ger skala under 1 utan overflow', async ({ page }) => {
    const errors = await startGame(page);
    const l = await layout(page);
    expect(l.canvas.w).toBeLessThan(320);
    expect(l.canvas.w).toBeGreaterThan(200);
    expect(l.scrollW).toBeLessThanOrEqual(300);
    expect(l.scrollH).toBeLessThanOrEqual(600);
    expect(inside(l.canvas, l.vw, l.vh)).toBe(true);
    for (const b of l.buttons) {
      expect(inside(b, l.vw, l.vh), `${b.id} ryms`).toBe(true);
      expect(overlap(b, l.canvas)).toBe(false);
    }
    await expectNoErrors(errors);
  });
});

test.describe('Smal skärm på desktop', () => {
  test.use({ ...desktop, viewport: { width: 300, height: 400 } });

  test('canvasen skalas ned i stället för att hamna utanför', async ({ page }) => {
    await openGame(page);
    const l = await layout(page);
    expect(l.canvas.w).toBeCloseTo(300, 0);
    expect(l.canvas.x).toBeGreaterThanOrEqual(0);
    expect(l.scrollW).toBeLessThanOrEqual(300);
  });
});

test.describe('Autopaus', () => {
  test.use(desktop);

  const hide = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const show = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  test('en dold flik pausar, tystar musiken och återupptas inte av sig själv', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const audio = await hasAudio(page);
    if (audio) await page.waitForFunction(() => window.__game.audio.musicPlaying);
    await hide(page);
    expect(await g(page, (game) => game.state)).toBe('paused');
    if (audio) expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);
    await show(page);
    await frames(page, 10);
    expect(await g(page, (game) => game.state)).toBe('paused');
    await press(page, 'KeyP'); // spelaren fortsätter själv
    expect(await g(page, (game) => game.state)).toBe('playing');
    if (audio) await page.waitForFunction(() => window.__game.audio.musicPlaying);
    await expectNoErrors(errors);
  });

  test('blur pausar', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await g(page, (game) => game.state)).toBe('paused');
    await frames(page, 5);
    expect(await g(page, (game) => game.state)).toBe('paused');
    await expectNoErrors(errors);
  });

  test('autopaus släpper hållna knappar så att spelaren inte fortsätter röra sig', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await page.keyboard.down('ArrowLeft');
    await hide(page);
    await show(page);
    expect(await isDown(page, 'left')).toBe(false);
    await page.keyboard.up('ArrowLeft');
    await expectNoErrors(errors);
  });

  test('menyn, namninmatningen och game over påverkas inte', async ({ page }) => {
    const errors = await openGame(page);
    await hide(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await g(page, (game) => game.state)).toBe('menu');

    await show(page);
    await press(page, 'Space');
    await g(page, (game) => { game.debug.freezeEnemies(true); game.score = 80; game.lives = 0; });
    await waitState(page, 'enterName');
    await hide(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await g(page, (game) => game.state)).toBe('enterName');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    await hide(page);
    expect(await g(page, (game) => game.state)).toBe('gameover');
    await expectNoErrors(errors);
  });

  test('redan pausat spel förblir pausat och kan fortsätta', async ({ page }) => {
    const errors = await startGame(page);
    await press(page, 'KeyP');
    await hide(page);
    expect(await g(page, (game) => game.state)).toBe('paused');
    await press(page, 'KeyP');
    expect(await g(page, (game) => game.state)).toBe('playing');
    await expectNoErrors(errors);
  });
});

test.describe('HUD ligger överst', () => {
  test.use(desktop);

  // Hash av ett område av canvasen
  const region = (page, r) => page.evaluate((rc) => {
    const cv = document.getElementById('game');
    const d = cv.getContext('2d').getImageData(rc.x, rc.y, rc.w, rc.h).data;
    let h = 0;
    for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0;
    return h;
  }, r);

  test('boss-skott och partiklar i HUD-raden ändrar inte HUD-pixlarna', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.startBoss('loop'));
    await g(page, (game) => { game.debug.clearEnemyBullets(); game.state = 'paused'; }); // stilla, men renderar
    await frames(page, 3);
    const HUD = { x: 0, y: 0, w: 320, h: 15 };
    const BAR = { x: 0, y: 16, w: 210, h: 9 };
    const before = [await region(page, HUD), await region(page, BAR)];

    await g(page, (game) => {
      for (const x of [20, 100, 180, 300]) {
        game.debug.spawnEnemyBulletAt(x, 1);
        game.debug.spawnEnemyBulletAt(x, 5);
        game.debug.spawnEnemyBulletAt(x, 10);
        game.debug.spawnEnemyBulletAt(x + 3, 18);
        game.debug.spawnEnemyBulletAt(x + 3, 21);
      }
      game.particles.burst(60, 6, ['#ffffff', '#ff00ff'], 40, { speed: 1, life: 5 });
      game.particles.burst(60, 20, ['#ffffff', '#ff00ff'], 40, { speed: 1, life: 5 });
      game.debug.spawnEnemyBulletAt(100, 120); // kontroll: skott utanför HUD syns
    });
    await frames(page, 3);
    const control = await region(page, { x: 90, y: 110, w: 30, h: 30 });
    expect([await region(page, HUD), await region(page, BAR)]).toEqual(before);
    // Kontrollen: testet kan se skott där de inte döljs
    await g(page, (game) => { game.enemyBullets = game.enemyBullets.filter((b) => b.y < 100); });
    await frames(page, 2);
    expect(await region(page, { x: 90, y: 110, w: 30, h: 30 })).not.toBe(control);
    await expectNoErrors(errors);
  });

  test('HUD-raden är opåverkad också under skärmskakning', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await frames(page, 3);
    const before = await region(page, { x: 0, y: 0, w: 320, h: 15 });
    await g(page, (game) => { game.debug.reducedMotion(false); game.addShake('boss'); });
    for (let i = 0; i < 4; i++) {
      await frames(page, 1);
      expect(await region(page, { x: 0, y: 0, w: 320, h: 15 })).toBe(before);
    }
    await expectNoErrors(errors);
  });
});
