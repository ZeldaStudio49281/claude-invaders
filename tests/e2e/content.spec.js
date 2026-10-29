// Innehåll (Fas 3): fiendetyper, Heisenbugg, testsviter, Kontextfönstret, Refaktorering och nivåer
import { test, expect } from '@playwright/test';
import { startGame, press, frames, g, expectNoErrors, shotDone } from './helpers.js';

// Tömmer rutnätet och lägger en enda fiende av given typ i en ruta, fryst
async function solo(page, type, col = 0, row = 0) {
  await g(page, (game, a) => {
    game.debug.freezeEnemies(true);
    game.debug.killAllEnemies();
    game.debug.placeEnemy(a.type, a.col, a.row);
    // Inga testsviter, så att skotten inte fastnar i dem om fienden hinner glida in över ett block
    game.shields.shields = [];
  }, { type, col, row });
}

// Flyttar spelaren under fienden och skjuter, väntar tills skottet är förbrukat
async function fireAt(page, index = 0) {
  await g(page, (game, i) => {
    const e = game.enemies[i];
    game.player.x = e.x + e.w / 2 - game.player.w / 2;
    game.player.cooldown = 0;
  }, index);
  await press(page, 'Space');
  await shotDone(page, true);
}

// Lägger ett skott direkt i spelet (uppåt) eller ett fiendeskott
function pushToken(page, x, y) {
  return page.evaluate(async ([px, py]) => {
    const { makeToken } = await import('/js/projectiles.js');
    window.__game.bullets.push(makeToken(px, py));
  }, [x, y]);
}

// Flyttar bort fienderna så att de inte stör
async function clearField(page) {
  await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.shiftEnemies(0, -1000); game.debug.setLives(99); });
}

test.describe('Fiendetyper', () => {
  test('nivå 1 har rutnät med 40 fiender där nedersta raden är syntaxfel', async ({ page }) => {
    const errors = await startGame(page);
    const types = await g(page, (game) => game.enemies.map((e) => `${e.row}:${e.type}`));
    expect(types).toHaveLength(40);
    expect(types.filter((t) => t.endsWith(':syntax'))).toHaveLength(32);
    expect(types.filter((t) => t === '0:nullptr')).toHaveLength(8);
    await expectNoErrors(errors);
  });

  test('alla fyra typer har egna sprites', async ({ page }) => {
    await startGame(page);
    const distinct = await page.evaluate(async () => {
      const { SPRITES } = await import('/js/sprites.js');
      const { TYPES } = await import('/js/enemies.js');
      const keys = ['syntax', 'nullptr', 'leak', 'race', 'leakSmall'];
      const seen = new Set(keys.map((k) => TYPES[k].sprites.map((s) => SPRITES[s].join('')).join('|')));
      const frames2 = keys.every((k) => SPRITES[TYPES[k].sprites[0]].join('') !== SPRITES[TYPES[k].sprites[1]].join(''));
      const small = SPRITES.leakS0.length < SPRITES.leak0.length && SPRITES.leakS0[0].length < SPRITES.leak0[0].length;
      return { n: seen.size, frames2, small };
    });
    expect(distinct).toEqual({ n: 5, frames2: true, small: true });
  });

  for (const [type, points] of [['syntax', 10], ['nullptr', 20], ['race', 40]]) {
    test(`${type} ger ${points} poäng`, async ({ page }) => {
      const errors = await startGame(page);
      await solo(page, type, 0, 1);
      await g(page, (game) => { game.enemies[0].tp = 999; }); // race ska inte flytta sig
      await fireAt(page);
      expect(await g(page, (game) => game.score)).toBe(points);
      await expectNoErrors(errors);
    });
  }

  test('null-pekare skjuter oftare än syntaxfel', async ({ page }) => {
    await startGame(page, 3);
    await solo(page, 'syntax', 0, 0);
    await g(page, (game) => game.debug.placeEnemy('nullptr', 1, 0));
    const counts = await g(page, (game) => {
      const c = { syntax: 0, nullptr: 0 };
      for (let i = 0; i < 600; i++) c[game.grid.pickShooter().type] += 1;
      return c;
    });
    expect(counts.nullptr).toBeGreaterThan(counts.syntax * 2);
    expect(counts.syntax).toBeGreaterThan(0);
  });

  test('minnesläckan ger 30 poäng och delar sig i två mindre med egna poäng', async ({ page }) => {
    const errors = await startGame(page);
    await solo(page, 'leak', 4, 1);
    const parent = await g(page, (game) => ({ x: game.enemies[0].x, y: game.enemies[0].y, w: game.enemies[0].w }));
    await fireAt(page);
    expect(await g(page, (game) => game.score)).toBe(30);
    const small = await g(page, (game) => game.enemies.map((e) => ({ type: e.type, x: e.x, y: e.y, w: e.w, h: e.h, points: e.points })));
    expect(small.map((e) => e.type)).toEqual(['leakSmall', 'leakSmall']);
    expect(small[0].w).toBeLessThan(parent.w);
    expect(small[0].x).toBeLessThan(small[1].x);
    for (const e of small) {
      expect(e.x).toBeGreaterThanOrEqual(parent.x - 4);
      expect(e.x).toBeLessThanOrEqual(parent.x + parent.w);
      expect(e.points).toBe(15);
    }
    // De små följer med rutnätet
    await g(page, (game) => game.debug.freezeEnemies(false));
    const x0 = await g(page, (game) => game.enemies[0].x);
    await page.waitForFunction((x) => window.__game.enemies[0].x > x + 3, x0);
    // Skjuts en liten läcka ger den 15 poäng och delar sig inte vidare
    await g(page, (game) => game.debug.freezeEnemies(true));
    await fireAt(page, 0);
    expect(await g(page, (game) => game.score)).toBe(45);
    expect(await g(page, (game) => game.enemies.map((e) => e.type))).toEqual(['leakSmall']);
    await expectNoErrors(errors);
  });

  test('race condition blinkar och hoppar sedan till en tom ruta', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLives(99));
    await g(page, (game) => {
      game.debug.killAllEnemies();
      const e = game.debug.placeEnemy('race', 0, 0);
      e.tp = 0.01;
    });
    await page.waitForFunction(() => window.__game.enemies[0]?.glitch > 0);
    const cell = await g(page, (game) => [game.enemies[0].col, game.enemies[0].row]);
    expect(cell).toEqual([0, 0]); // blinkar först, flyttar inte direkt
    await page.waitForFunction(() => window.__game.enemies[0].glitch === 0);
    const after = await g(page, (game) => {
      const e = game.enemies[0];
      const pos = game.grid.cellPos(e.col, e.row);
      return { cell: [e.col, e.row], dx: Math.abs(pos.x - e.x), dy: Math.abs(pos.y - e.y), n: game.enemies.length };
    });
    expect(after.cell).not.toEqual([0, 0]);
    expect(after.dx).toBeLessThan(0.01);
    expect(after.dy).toBeLessThan(0.01);
    expect(after.n).toBe(1);
    await expectNoErrors(errors);
  });

  test('race condition byter plats med en annan bugg när rutnätet är fullt', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLives(99));
    const before = await g(page, (game) => {
      const e = game.debug.placeEnemy('race', 3, 2);
      e.tp = 0.01;
      return game.enemies.filter((o) => o.type !== 'race').map((o) => `${o.col},${o.row}:${o.type}`).sort();
    });
    await page.waitForFunction(() => window.__game.enemies.find((e) => e.type === 'race').glitch > 0);
    await page.waitForFunction(() => {
      const e = window.__game.enemies.find((o) => o.type === 'race');
      return e.glitch === 0 && (e.col !== 3 || e.row !== 2);
    });
    const res = await g(page, (game) => {
      const r = game.enemies.find((e) => e.type === 'race');
      const old = game.enemies.find((e) => e.col === 3 && e.row === 2);
      return { n: game.enemies.length, swappedType: old.type, oldCell: [r.col, r.row], races: game.enemies.filter((e) => e.type === 'race').length };
    });
    expect(res.n).toBe(40);
    expect(res.races).toBe(1);
    expect(res.swappedType).not.toBe('race');
    expect(before).toContain(`${res.oldCell[0]},${res.oldCell[1]}:${res.swappedType}`);
    await expectNoErrors(errors);
  });
});

test.describe('Heisenbuggen', () => {
  test('dyker upp på en stillastående plats mellan rutnätet och spelaren', async ({ page }) => {
    const errors = await startGame(page, 5);
    await g(page, (game) => { game.debug.setLives(99); game.heisTimer = 0.01; });
    await page.waitForFunction(() => window.__game.heisenbug !== null);
    const p0 = await g(page, (game) => ({ x: game.heisenbug.x, y: game.heisenbug.y, bottom: game.grid.bottom }));
    expect(p0.y).toBeGreaterThanOrEqual(p0.bottom - 8);
    expect(p0.y).toBeLessThan(184);
    expect(p0.x).toBeGreaterThanOrEqual(0);
    expect(p0.x).toBeLessThan(310);
    await frames(page, 10);
    const p1 = await g(page, (game) => (game.heisenbug ? { x: game.heisenbug.x, y: game.heisenbug.y } : null));
    expect(p1).toEqual({ x: p0.x, y: p0.y }); // flyger inte
    await expectNoErrors(errors);
  });

  test('flimrar: syns bara ibland', async ({ page }) => {
    await startGame(page);
    await clearField(page);
    await g(page, (game) => game.debug.spawnHeisenbug(100, 120));
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const s = new Set();
      const tick = () => {
        s.add(window.__game.heisVisible);
        if (s.size === 2 || !window.__game.heisenbug) resolve([...s]);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    expect(seen.sort()).toEqual([false, true]);
  });

  test('kan inte träffas när den inte syns, men träffas när den syns', async ({ page }) => {
    const errors = await startGame(page);
    await clearField(page);
    // Osynlig fas (age % 0.5 >= 0.2): skottet går igenom
    // Allt i ett synkront anrop: flimret går på speltid, så långsamma frames får inte hinna ändra fasen
    const hidden = await page.evaluate(async () => {
      const { makeToken } = await import('/js/projectiles.js');
      const game = window.__game;
      game.debug.spawnHeisenbug(100, 120);
      game.heisenbug.age = 0.3;
      game.bullets.push(makeToken(104, 124));
      game.update(1 / 60);
      return [game.score, game.heisenbug !== null, game.context];
    });
    expect(hidden).toEqual([0, true, 0]);
    await page.waitForFunction(() => window.__game.bullets.length === 0);

    // Synlig fas: träff, poäng som flytande text, mätaren ökar
    // Sätt flimret och träffen i samma synkrona anrop (flimret går på speltid och syns bara 0,2 s per 0,5 s)
    await page.evaluate(async () => {
      const { makeToken } = await import('/js/projectiles.js');
      window.__game.heisenbug.age = 0.05;
      window.__game.bullets.push(makeToken(104, 124));
      window.__game.update(0.001);
    });
    expect(await g(page, (game) => game.score)).toBe(500);
    expect(await g(page, (game) => game.heisenbug)).toBeNull();
    expect(await g(page, (game) => game.context)).toBe(1);
    const fl = await g(page, (game) => game.floaters.map((f) => ({ text: f.text, x: f.x, y: f.y })));
    expect(fl).toHaveLength(1);
    expect(fl[0].text).toBe('500');
    expect(Math.abs(fl[0].x - 105.5)).toBeLessThan(1);
    expect(Math.abs(fl[0].y - 120)).toBeLessThan(2);
    // Texten försvinner av sig själv
    await g(page, (game) => { game.floaters[0].t = 0.99; });
    await page.waitForFunction(() => window.__game.floaters.length === 0);
    await expectNoErrors(errors);
  });

  test('poängen sjunker från 500 till 100 med tiden', async ({ page }) => {
    await startGame(page);
    const pts = await page.evaluate(async () => {
      const { heisPoints, HEIS_LIFE } = await import('/js/game.js');
      return [0, 1, 1.3, 2.5, 3.7, 4.9, HEIS_LIFE - 0.01].map(heisPoints);
    });
    expect(pts).toEqual([500, 500, 400, 300, 200, 100, 100]);
    expect(pts.every((p, i) => i === 0 || p <= pts[i - 1])).toBe(true);

    // Och via en riktig träff sent i livstiden
    await clearField(page);
    // Allt i ett anrop så att ingen speltid hinner gå mellan uppsättning och träff
    await page.evaluate(async () => {
      const { makeToken } = await import('/js/projectiles.js');
      const game = window.__game;
      game.debug.spawnHeisenbug(100, 120);
      game.heisenbug.age = 5.0;
      game.bullets.push(makeToken(104, 124));
      game.update(0.001); // träffen sker i samma synkrona anrop, så flimret (syns 0,2 s per 0,5 s) hinner inte stänga av den
    });
    await page.waitForFunction(() => window.__game.score > 0);
    expect(await g(page, (game) => game.score)).toBe(100);
  });

  test('försvinner av sig själv efter några sekunder', async ({ page }) => {
    const errors = await startGame(page);
    await clearField(page);
    await g(page, (game) => game.debug.spawnHeisenbug(100, 120));
    expect(await g(page, (game) => game.heisenbug !== null)).toBe(true);
    await g(page, (game) => { game.heisenbug.age = 5.9; });
    await page.waitForFunction(() => window.__game.heisenbug === null);
    expect(await g(page, (game) => game.score)).toBe(0);
    await expectNoErrors(errors);
  });
});

test.describe('Testsviter', () => {
  test('fyra block byggs av celler ovanför spelaren', async ({ page }) => {
    await startGame(page);
    const info = await g(page, (game) => ({
      n: game.shields.shields.length,
      cells: game.shields.cellCount,
      bottoms: game.shields.shields.map((s) => s.y + s.h),
      py: game.player.y,
    }));
    expect(info.n).toBe(4);
    expect(info.cells).toBeGreaterThan(100);
    for (const b of info.bottoms) expect(b).toBeLessThan(info.py);
  });

  test('spelarens skott äter bort celler och förbrukas', async ({ page }) => {
    const errors = await startGame(page, 11);
    await clearField(page);
    const s = await g(page, (game) => ({ x: game.shields.shields[0].x, y: game.shields.shields[0].y, h: game.shields.shields[0].h, n: game.shields.cellCount }));
    await pushToken(page, s.x + 4, s.y + s.h + 6);
    await shotDone(page);
    const n = await g(page, (game) => game.shields.cellCount);
    expect(n).toBeLessThan(s.n);
    expect(n).toBeGreaterThanOrEqual(s.n - 9); // träffcellen plus erosion på grannarna
    await expectNoErrors(errors);
  });

  test('fiendernas skott äter bort celler och förbrukas', async ({ page }) => {
    const errors = await startGame(page, 12);
    await clearField(page);
    const s = await g(page, (game) => ({ x: game.shields.shields[1].x, y: game.shields.shields[1].y, n: game.shields.cellCount }));
    await g(page, (game, a) => game.debug.spawnEnemyBulletAt(a.x + 8, a.y - 10), s);
    await page.waitForFunction(() => window.__game.enemyBullets.length === 0);
    const n = await g(page, (game) => game.shields.cellCount);
    expect(n).toBeLessThan(s.n);
    expect(n).toBeGreaterThanOrEqual(s.n - 9);
    expect(await g(page, (game) => game.lives)).toBe(99); // skottet nådde aldrig spelaren
    await expectNoErrors(errors);
  });

  test('erosionen är slumpad men följer seeden', async ({ page }) => {
    const run = async (seed) => {
      await startGame(page, seed);
      await clearField(page);
      const s = await g(page, (game) => ({ x: game.shields.shields[0].x, y: game.shields.shields[0].y, h: game.shields.shields[0].h }));
      await g(page, (game, a) => game.debug.spawnEnemyBulletAt(a.x + 10, a.y - 10), s);
      await page.waitForFunction(() => window.__game.enemyBullets.length === 0);
      return g(page, (game) => JSON.stringify(game.shields.shields[0].cells));
    };
    const a = await run(21);
    const b = await run(21);
    expect(a).toBe(b);
  });

  test('buggar som når blocken äter upp dem', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    const n0 = await g(page, (game) => game.shields.cellCount);
    await g(page, (game) => {
      const s = game.shields.shields[2];
      game.debug.shiftEnemies(0, 0);
      const e = game.enemies[0];
      e.x = s.x + 2;
      e.y = s.y + 1;
    });
    await frames(page, 2);
    const n1 = await g(page, (game) => game.shields.cellCount);
    expect(n1).toBeLessThan(n0 - 15);
    await expectNoErrors(errors);
  });

  test('blocken återställs till nästa nivå', async ({ page }) => {
    const errors = await startGame(page, 4);
    const full = await g(page, (game) => JSON.stringify(game.shields.shields.map((s) => s.cells)));
    await clearField(page);
    await g(page, (game) => {
      const s = game.shields.shields[0];
      game.debug.spawnEnemyBulletAt(s.x + 10, s.y - 10);
    });
    await page.waitForFunction(() => window.__game.enemyBullets.length === 0);
    expect(await g(page, (game) => JSON.stringify(game.shields.shields.map((s) => s.cells)))).not.toBe(full);
    await g(page, (game) => game.debug.killAllEnemies());
    await page.waitForFunction(() => window.__game.level === 2);
    expect(await g(page, (game) => JSON.stringify(game.shields.shields.map((s) => s.cells)))).toBe(full);
    await expectNoErrors(errors);
  });
});

test.describe('Kontextfönstret och Refaktorering', () => {
  test('mätaren ökar för varje träff i följd och stannar när den är full', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    expect(await g(page, (game) => game.context)).toBe(0);
    await fireAt(page);
    expect(await g(page, (game) => game.context)).toBe(1);
    await fireAt(page);
    expect(await g(page, (game) => game.context)).toBe(2);
    await g(page, (game) => game.debug.setContext(8));
    await fireAt(page);
    expect(await g(page, (game) => game.context)).toBe(8);
    await expectNoErrors(errors);
  });

  test('mätaren nollställs när ett skott missar', async ({ page }) => {
    const errors = await startGame(page);
    await clearField(page);
    await g(page, (game) => game.debug.setContext(5));
    await pushToken(page, 150, 100);
    await page.waitForFunction(() => window.__game.context === 0);
    expect(await g(page, (game) => game.bullets.length)).toBe(0);
    await expectNoErrors(errors);
  });

  test('Refaktorering händer inte när mätaren inte är full', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.setContext(7); });
    await press(page, 'Shift');
    expect(await g(page, (game) => [game.enemies.length, game.context, game.score, game.fx.length])).toEqual([40, 7, 0, 0]);
    await expectNoErrors(errors);
  });

  test('Refaktorering rensar nedersta raden, ger poäng och tömmer mätaren', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.setContext(8); });
    await press(page, 'Shift');
    const r = await g(page, (game) => ({
      n: game.enemies.length, ctx: game.context, score: game.score,
      maxRow: Math.max(...game.enemies.map((e) => e.row)), fx: game.fx.length, fl: game.floaters.length,
    }));
    expect(r).toEqual({ n: 32, ctx: 0, score: 80, maxRow: 3, fx: 1, fl: 1 });
    // Mätaren är tom, så en ny tryckning gör inget
    await press(page, 'Shift');
    expect(await g(page, (game) => game.enemies.length)).toBe(32);
    // Strålen försvinner av sig själv
    await page.waitForFunction(() => window.__game.fx.length === 0);
    await expectNoErrors(errors);
  });

  test('Refaktorering på rad med minnesläckor ger poäng utan delning', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(true);
      game.debug.killAllEnemies();
      for (let c = 0; c < 8; c++) game.debug.placeEnemy('leak', c, 0);
      game.debug.placeEnemy('syntax', 0, 1); // ligger nedanför och rensas först
      game.debug.setContext(8);
    });
    await press(page, 'Shift');
    expect(await g(page, (game) => [game.score, game.enemies.length])).toEqual([10, 8]);
    await g(page, (game) => game.debug.setContext(8));
    await press(page, 'Shift');
    expect(await g(page, (game) => [game.score, game.level])).toEqual([250, 2]); // tomt rutnät ger nästa nivå
    await expectNoErrors(errors);
  });

  test('HUD:en visar när Refaktorering är redo', async ({ page }) => {
    await startGame(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    const amber = () => page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 226, 320, 14).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xf2 && d[i + 1] === 0xb0 && d[i + 2] === 0x4a) n += 1;
      return n;
    });
    await g(page, (game) => game.debug.setContext(3));
    await frames(page, 2);
    expect(await amber()).toBe(0);
    await g(page, (game) => game.debug.setContext(8));
    // Texten blinkar mellan bärnsten och krämvit, men mätaren är bärnsten hela tiden
    await frames(page, 2);
    expect(await amber()).toBeGreaterThan(8 * 7 * 7 - 1);
    const strings = await page.evaluate(async () => (await import('/js/strings.js')).STR.hud.refactorReady);
    expect(strings.length).toBeGreaterThan(5);
  });
});

test.describe('Nivåer och svårighetskurva', () => {
  test('nivådefinitionerna laddas och bossnivåerna är reserverade', async ({ page }) => {
    await startGame(page);
    const cfgs = await page.evaluate(async () => {
      const { levelConfig } = await import('/js/levels.js');
      return Array.from({ length: 12 }, (_, i) => levelConfig(i + 1));
    });
    for (const c of cfgs) {
      expect(c.rowTypes).toHaveLength(c.rows);
      expect(c.cols).toBeGreaterThan(0);
      expect(c.baseSpeed).toBeGreaterThan(0);
      expect(c.bulletSpeed).toBeGreaterThan(0);
      for (const t of c.rowTypes) expect(['syntax', 'nullptr', 'leak', 'race']).toContain(t);
    }
    expect(cfgs.map((c) => c.boss)).toEqual([null, null, null, null, 'loop', null, null, null, null, 'stack', null, null]);
    expect(cfgs[0].rowTypes.at(-1)).toBe('syntax');
  });

  test('svårigheten ökar mjukt från nivå 1 till 10', async ({ page }) => {
    await startGame(page);
    const cfgs = await page.evaluate(async () => {
      const { levelConfig } = await import('/js/levels.js');
      return Array.from({ length: 10 }, (_, i) => levelConfig(i + 1));
    });
    for (let i = 1; i < 10; i++) {
      expect(cfgs[i].baseSpeed).toBeGreaterThan(cfgs[i - 1].baseSpeed);
      expect(cfgs[i].bulletSpeed).toBeGreaterThan(cfgs[i - 1].bulletSpeed);
      expect(cfgs[i].startY).toBeGreaterThanOrEqual(cfgs[i - 1].startY);
      expect(cfgs[i].shootMin).toBeLessThanOrEqual(cfgs[i - 1].shootMin);
      expect(cfgs[i].maxEnemyBullets).toBeGreaterThanOrEqual(cfgs[i - 1].maxEnemyBullets);
      // Mjukt: inget stort hopp mellan två nivåer
      expect(cfgs[i].baseSpeed / cfgs[i - 1].baseSpeed).toBeLessThan(1.25);
    }
    expect(cfgs[9].startY).toBeGreaterThan(cfgs[0].startY);
  });

  test('efter nivå 10 upprepas cykeln med högre svårighet', async ({ page }) => {
    await startGame(page);
    const [l1, l10, l11, l15, l21] = await page.evaluate(async () => {
      const { levelConfig } = await import('/js/levels.js');
      return [1, 10, 11, 15, 21].map(levelConfig);
    });
    expect(l11.rowTypes).toEqual(l1.rowTypes);
    expect(l11.boss).toBeNull();
    expect(l15.boss).toBe('loop');
    expect(l11.baseSpeed).toBeGreaterThan(l1.baseSpeed);
    expect(l11.bulletSpeed).toBeGreaterThan(l1.bulletSpeed);
    expect(l21.baseSpeed).toBeGreaterThan(l11.baseSpeed);
    expect(l11.baseSpeed / l10.baseSpeed).toBeLessThan(1.3);
  });

  test('rutnätet följer nivådefinitionen och blir svårare mellan nivå 1 och 4', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    const snap = () => g(page, (game) => {
      const rows = [];
      for (const e of game.enemies) (rows[e.row] ??= new Set()).add(e.type);
      return {
        level: game.level, rowTypes: rows.map((s) => [...s].join('+')), planned: game.grid.cfg.rowTypes,
        speed: game.grid.speed, bulletSpeed: game.grid.cfg.bulletSpeed, y: game.enemies[0].y,
      };
    });
    const l1 = await snap();
    await g(page, (game) => game.debug.setLevel(4));
    const l4 = await snap();
    expect(l1.rowTypes).toEqual(l1.planned);
    expect(l4.rowTypes).toEqual(l4.planned);
    expect(l4.rowTypes).toEqual(['race', 'leak', 'nullptr', 'nullptr', 'syntax']);
    expect(l4.speed).toBeGreaterThan(l1.speed);
    expect(l4.bulletSpeed).toBeGreaterThan(l1.bulletSpeed);
    expect(l4.y).toBeGreaterThan(l1.y);

    // Fiendeskotten får nivåns fart
    await g(page, (game) => { game.debug.setLives(99); game.debug.freezeEnemies(false); });
    await page.waitForFunction(() => window.__game.enemyBullets.length > 0);
    expect(await g(page, (game) => [game.enemyBullets[0].vy, game.grid.cfg.bulletSpeed])).toEqual([l4.bulletSpeed, l4.bulletSpeed]);
    await expectNoErrors(errors);
  });
});

test.describe('Helhet', () => {
  test('en match på nivå 4 med alla typer ger inga konsolfel', async ({ page }) => {
    const errors = await startGame(page, 9);
    await g(page, (game) => { game.debug.setLevel(4); game.debug.setLives(99); game.heisTimer = 0.5; });
    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__game.heisenbug !== null);
    await frames(page, 120);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowLeft');
    await frames(page, 120);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('Space');
    expect(['playing', 'gameover']).toContain(await g(page, (game) => game.state));
    await expectNoErrors(errors);
  });

  test('skärmdumpar mitt i spelet', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    const errors = await startGame(page, 7);
    await g(page, (game) => {
      game.debug.setLevel(3);
      game.debug.setLives(9);
      game.debug.freezeEnemies(true);
      game.score = 1240;
      game.debug.setContext(5);
      // Slå sönder lite av blocken och släpp en liten läcka så att alla sprites syns
      const s = game.shields.shields;
      game.debug.spawnEnemyBulletAt(s[0].x + 6, s[0].y - 4);
      game.debug.spawnEnemyBulletAt(s[2].x + 14, s[2].y - 4);
      game.debug.spawnEnemyBulletAt(s[3].x + 3, s[3].y - 4);
      game.grid.hit(game.enemies.find((e) => e.type === 'leak'));
    });
    await page.waitForFunction(() => window.__game.enemyBullets.length === 0);
    await g(page, (game) => { game.player.x = 150; game.debug.spawnEnemyBulletAt(120, 150); game.debug.spawnEnemyBulletAt(210, 120); });
    await frames(page, 3);
    await page.locator('canvas#game').screenshot({ path: 'test-results/fas3.png' });

    // Heisenbuggen: vänta tills den ritas och spara just den bilden
    await g(page, (game) => { game.debug.spawnHeisenbug(190, 150); game.debug.setContext(8); });
    const dataUrl = await page.evaluate(() => new Promise((resolve) => {
      const tick = () => {
        const c = document.getElementById('game');
        const h = window.__game.heisenbug;
        const px = h ? c.getContext('2d').getImageData(h.x + 5, h.y + 2, 1, 1).data : null;
        if (px && px[0] === 0xf5 && px[1] === 0xf0) resolve(c.toDataURL());
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    const fs = await import('node:fs');
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/fas3-heisenbugg.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
    await expectNoErrors(errors);
  });
});
