// Power-ups (Fas 4): släpp, upplockning, fem effekter, tidsbegränsning, förlängning och HUD
import { test, expect } from '@playwright/test';
import { startGame, press, frames, g, expectNoErrors, shotDone } from './helpers.js';

// Håller buggarna stilla och utom räckhåll, gör spelaren svårdödad och stänger av slumpade släpp
async function calm(page) {
  await g(page, (game) => {
    game.debug.freezeEnemies(true);
    game.debug.shiftEnemies(0, -1000);
    game.debug.setLives(99);
    game.debug.setDropChance(0);
  });
}

// Summerar speltiden (dt) som update() får, så att hastigheter kan mätas oberoende av bildfrekvens
async function trackDt(page) {
  await page.evaluate(() => {
    const game = window.__game;
    window.__dtSum = 0;
    const orig = game.update.bind(game);
    game.update = (dt) => {
      if (game.state === 'playing') window.__dtSum += dt;
      orig(dt);
    };
  });
}

// Mäter hur mycket value() ändras per sekund speltid under n frames
async function ratePerSecond(page, valueFn, n = 12) {
  const a = await page.evaluate(`[(${valueFn.toString()})(window.__game), window.__dtSum]`);
  await frames(page, n);
  const b = await page.evaluate(`[(${valueFn.toString()})(window.__game), window.__dtSum]`);
  return (b[0] - a[0]) / (b[1] - a[1]);
}

const TYPES = ['think', 'tool', 'shield', 'review', 'life'];

// Fryser bilden (update gör inget mer) så att skärmdumpen inte får paus-överlägget
async function freezeFrame(page) {
  await page.evaluate(() => { window.__game.update = function () { this.frames += 1; }; });
  await frames(page, 2);
}

test.describe('Power-ups: ikoner och släpp', () => {
  test('fem typer med egna 8x8-ikoner som skiljer sig från fiendeskotten', async ({ page }) => {
    const errors = await startGame(page);
    const info = await page.evaluate(async () => {
      const { SPRITES } = await import('/js/sprites.js');
      const { POWERUP_TYPES } = await import('/js/powerups.js');
      const sprites = Object.values(POWERUP_TYPES).map((t) => SPRITES[t.sprite]);
      return {
        n: sprites.length,
        sizes: sprites.map((s) => `${s[0].length}x${s.length}`),
        distinct: new Set(sprites.map((s) => s.join('|'))).size,
        // Kapseln har en ram av krämvita pixlar runt hela kanten
        framed: sprites.every((s) => s[0].includes('c') && s.at(-1).includes('c') && s.every((r) => r[0] === 'c' || r[0] === '.')),
        errW: SPRITES.err0[0].length,
      };
    });
    expect(info.n).toBe(5);
    expect(info.sizes).toEqual(Array(5).fill('8x8'));
    expect(info.distinct).toBe(5);
    expect(info.framed).toBe(true);
    expect(info.errW).toBeLessThan(8); // fiendeskott är smala, power-ups är kvadratiska kapslar
    await expectNoErrors(errors);
  });

  test('standardchansen att släppa är 6-8 procent', async ({ page }) => {
    const errors = await startGame(page);
    const chance = await page.evaluate(async () => (await import('/js/config.js')).DROP_CHANCE);
    expect(chance).toBeGreaterThanOrEqual(0.06);
    expect(chance).toBeLessThanOrEqual(0.08);
    expect(await g(page, (game) => game.dropChance)).toBe(chance);
    // Över 4000 slag med seedad slump hamnar andelen nära chansen
    const share = await page.evaluate(async () => {
      const { rollDrop } = await import('/js/powerups.js');
      window.__game.debug.seed(7);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (rollDrop()) n++;
      return n / 4000;
    });
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.09);
    await expectNoErrors(errors);
  });

  test('en besegrad bugg släpper en power-up när chansen är 100 procent', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(true);
      game.debug.killAllEnemies();
      game.debug.placeEnemy('syntax', 0, 0);
      game.debug.placeEnemy('syntax', 7, 0);
      game.debug.setDropChance(1);
      const e = game.enemies[0];
      game.player.x = e.x + e.w / 2 - game.player.w / 2;
      game.player.cooldown = 0;
    });
    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.score === 10);
    const drops = await g(page, (game) => game.powerups.map((p) => ({ type: p.type, w: p.w, y: p.y })));
    expect(drops).toHaveLength(1);
    expect(TYPES).toContain(drops[0].type);
    await expectNoErrors(errors);
  });

  test('ingen power-up släpps när chansen är 0', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(true);
      game.debug.killAllEnemies();
      game.debug.placeEnemy('syntax', 0, 0);
      game.debug.placeEnemy('syntax', 7, 0);
      game.debug.setDropChance(0);
      const e = game.enemies[0];
      game.player.x = e.x + e.w / 2 - game.player.w / 2;
      game.player.cooldown = 0;
    });
    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.score === 10);
    expect(await g(page, (game) => game.powerups.length)).toBe(0);
    await expectNoErrors(errors);
  });

  test('power-ups faller långsamt och försvinner vid botten', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await trackDt(page);
    await g(page, (game) => game.debug.spawnPowerup('tool', 20, 100));
    const speed = await ratePerSecond(page, (game) => game.powerups[0].y);
    expect(speed).toBeGreaterThan(20);
    expect(speed).toBeLessThan(60); // långsammare än fiendeskotten (75 px/s)
    // Flytta nära botten och vänta tills den är borta, utan att ha plockats upp
    await g(page, (game) => { game.powerups[0].y = 232; });
    await page.waitForFunction(() => window.__game.powerups.length === 0);
    expect(await g(page, (game) => game.effects.tool)).toBe(0);
    await expectNoErrors(errors);
  });
});

test.describe('Power-ups: upplockning och effekter', () => {
  test('en power-up som nuddar spelaren plockas upp och visar sitt namn som flytande text', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.spawnPowerup('review', game.player.x + 1, game.player.y - 2));
    await page.waitForFunction(() => window.__game.powerups.length === 0);
    expect(await g(page, (game) => game.effects.review)).toBeGreaterThan(5.5);
    const texts = await g(page, (game) => game.floaters.map((f) => f.text));
    expect(texts).toContain('Kodgranskning');
    await expectNoErrors(errors);
  });

  test('varje power-up har rätt namn och startvärde', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    // Pausa så att timrarna inte räknar ner medan testet läser dem (gör testet oberoende av last)
    await g(page, (game) => { game.debug.setLives(2); game.state = 'paused'; });
    for (const [type, name] of [['think', 'Extended thinking'], ['tool', 'Tool use'], ['shield', 'Konstitution'], ['review', 'Kodgranskning'], ['life', 'Extra kontext']]) {
      await g(page, (game, t) => game.debug.givePowerup(t), type);
      expect(await g(page, (game) => game.floaters.at(-1).text)).toBe(name);
    }
    const s = await g(page, (game) => ({ ...game.effects, lives: game.lives }));
    expect(s.think).toBeGreaterThan(4.8);
    expect(s.think).toBeLessThanOrEqual(5);
    expect(s.tool).toBeGreaterThan(7.8);
    expect(s.tool).toBeLessThanOrEqual(8);
    expect(s.review).toBeGreaterThan(5.8);
    expect(s.review).toBeLessThanOrEqual(6);
    expect(s.shield).toBe(true);
    expect(s.lives).toBe(3);
    await expectNoErrors(errors);
  });

  test('tidsbegränsade effekter tar slut och räknar ner i speltid', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await trackDt(page);
    await g(page, (game) => { game.debug.givePowerup('tool'); game.debug.givePowerup('think'); });
    const rate = await ratePerSecond(page, (game) => game.effects.tool, 15);
    expect(rate).toBeCloseTo(-1, 1); // 1 sekund per sekund
    // Ta slut: ställ in nästan slut och vänta på frames
    await g(page, (game) => { game.effects.tool = 0.15; game.effects.think = 0.15; });
    await page.waitForFunction(() => window.__game.effects.tool === 0 && window.__game.effects.think === 0);
    // Trippelskottet är borta: ett enkelt skott
    await g(page, (game) => { game.bullets = []; game.player.cooldown = 0; });
    await press(page, 'Space');
    expect(await g(page, (game) => game.bullets.length)).toBe(1);
    await expectNoErrors(errors);
  });

  test('samma effekt igen förlänger den, med tak', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.givePowerup('review'));
    await frames(page, 6);
    const before = await g(page, (game) => game.effects.review);
    expect(before).toBeLessThan(6);
    await g(page, (game) => game.debug.givePowerup('review'));
    const after = await g(page, (game) => game.effects.review);
    expect(after).toBeGreaterThan(6);       // längre än en ordinarie tid
    expect(after).toBeGreaterThan(before + 5);
    expect(after).toBeLessThanOrEqual(12);  // tak: två gånger ordinarie tid
    for (let i = 0; i < 4; i++) await g(page, (game) => game.debug.givePowerup('review'));
    expect(await g(page, (game) => game.effects.review)).toBeLessThanOrEqual(12);
    await expectNoErrors(errors);
  });

  test('Extended thinking halverar fiendernas och fiendeskottens hastighet', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.setLives(99);
      game.debug.setDropChance(0);
      game.debug.clearEnemyBullets();
      game.grid.cfg.maxEnemyBullets = 0; // rutnätet skjuter inte under mätningen
      game.debug.spawnEnemyBulletAt(10, 40);
    });
    await trackDt(page);
    const gridNormal = await ratePerSecond(page, (game) => game.grid.offX * game.grid.dir, 10);
    const bulletNormal = await ratePerSecond(page, (game) => game.enemyBullets[0]?.y ?? 0, 10);
    expect(gridNormal).toBeGreaterThan(15);
    expect(bulletNormal).toBeGreaterThan(60);

    await g(page, (game) => { game.debug.givePowerup('think'); game.debug.clearEnemyBullets(); game.debug.spawnEnemyBulletAt(10, 40); });
    const gridSlow = await ratePerSecond(page, (game) => game.grid.offX * game.grid.dir, 10);
    const bulletSlow = await ratePerSecond(page, (game) => game.enemyBullets[0]?.y ?? 0, 10);
    expect(gridSlow / gridNormal).toBeGreaterThan(0.4);
    expect(gridSlow / gridNormal).toBeLessThan(0.6);
    expect(bulletSlow / bulletNormal).toBeGreaterThan(0.4);
    expect(bulletSlow / bulletNormal).toBeLessThan(0.6);
    await expectNoErrors(errors);
  });

  test('Tool use ger trippelskott i solfjäder: tre skott med olika riktning', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => { game.debug.givePowerup('tool'); game.player.cooldown = 0; });
    await press(page, 'Space');
    const shots = await g(page, (game) => game.bullets.map((b) => ({ vx: b.vx, pierce: !!b.pierce })));
    expect(shots).toHaveLength(3);
    expect(shots.map((s) => Math.sign(s.vx)).sort()).toEqual([-1, 0, 1]);
    expect(shots.every((s) => !s.pierce)).toBe(true);
    // Solfjädern sprider sig i sidled
    await frames(page, 8);
    const xs = await g(page, (game) => game.bullets.map((b) => b.x).sort((a, b) => a - b));
    expect(xs[2] - xs[0]).toBeGreaterThan(4);
    await expectNoErrors(errors);
  });

  test('Konstitution: skölden syns som en ring och absorberar exakt en träff', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => { game.debug.setLives(3); game.debug.givePowerup('shield'); });
    expect(await g(page, (game) => game.effects.shield)).toBe(true);
    const shoot = () => g(page, (game) => game.debug.spawnEnemyBulletAt(game.player.x + game.player.w / 2, game.player.y - 2));

    await shoot();
    await page.waitForFunction(() => window.__game.effects.shield === false);
    expect(await g(page, (game) => game.lives)).toBe(3);

    await page.waitForFunction(() => window.__game.player.invuln === 0);
    await shoot();
    await page.waitForFunction(() => window.__game.lives === 2);
    await expectNoErrors(errors);
  });

  test('Konstitution ritar en ring runt spelaren', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    // Ringens vänstra kant ligger utanför spelarens 11 px: titta på en pixel strax utanför spelaren
    const probe = () => page.evaluate(() => {
      const game = window.__game;
      const c = document.getElementById('game').getContext('2d');
      const x = Math.round(game.player.x + game.player.w / 2 - 8);
      const y = Math.round(game.player.y + game.player.h / 2);
      return Array.from(c.getImageData(x, y, 1, 1).data.slice(0, 3)).join(',');
    });
    await frames(page, 2);
    const without = await probe();
    await g(page, (game) => game.debug.givePowerup('shield'));
    await frames(page, 2);
    const withRing = await probe();
    expect(withRing).not.toBe(without);
    await expectNoErrors(errors);
  });

  test('Kodgranskning: genomträngande skott träffar flera buggar i samma kolumn', async ({ page }) => {
    const errors = await startGame(page);
    const run = async (review) => {
      await g(page, (game, r) => {
        game.debug.freezeEnemies(true);
        game.debug.setLives(99);
        game.debug.setDropChance(0);
        game.debug.killAllEnemies();
        for (let r2 = 0; r2 < 3; r2++) game.debug.placeEnemy('syntax', 0, r2);
        game.debug.placeEnemy('syntax', 7, 0);
        game.score = 0;
        game.bullets = [];
        game.effects.review = r ? 6 : 0;
        const e = game.enemies[0];
        game.player.x = e.x + e.w / 2 - game.player.w / 2;
        game.player.cooldown = 0;
      }, review);
      await press(page, 'Space');
      await shotDone(page, true);
      return g(page, (game) => ({ score: game.score, left: game.enemies.length }));
    };
    expect(await run(false)).toEqual({ score: 10, left: 3 });
    expect(await run(true)).toEqual({ score: 30, left: 1 });
    await expectNoErrors(errors);
  });

  test('Kodgranskning stoppas fortfarande av testsviter', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => {
      game.debug.givePowerup('review');
      game.player.x = game.shields.shields[0].x + 6 - game.player.w / 2;
      game.player.cooldown = 0;
    });
    const before = await g(page, (game) => game.shields.cellCount);
    await press(page, 'Space');
    await shotDone(page, true);
    expect(await g(page, (game) => game.shields.cellCount)).toBeLessThan(before);
    await expectNoErrors(errors);
  });

  test('Extra kontext ger +1 liv upp till taket 5', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const cap = await page.evaluate(async () => (await import('/js/config.js')).MAX_LIVES);
    expect(cap).toBe(5);
    await g(page, (game) => { game.debug.setLives(2); game.debug.givePowerup('life'); });
    expect(await g(page, (game) => game.lives)).toBe(3);
    await g(page, (game) => { game.debug.setLives(5); game.debug.givePowerup('life'); });
    expect(await g(page, (game) => game.lives)).toBe(5);
    await g(page, (game) => { game.debug.setLives(4); game.debug.givePowerup('life'); game.debug.givePowerup('life'); });
    expect(await g(page, (game) => game.lives)).toBe(5);
    await expectNoErrors(errors);
  });

  test('en ny match nollställer effekter och power-ups', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => { game.debug.givePowerup('tool'); game.debug.givePowerup('shield'); game.debug.spawnPowerup('think', 50, 50); game.lives = 0; });
    await page.waitForFunction(() => window.__game.state === 'gameover');
    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.state === 'playing');
    expect(await g(page, (game) => [game.effects.tool, game.effects.shield, game.powerups.length])).toEqual([0, false, 0]);
    await expectNoErrors(errors);
  });
});

test.describe('Power-ups: HUD och skärmdump', () => {
  test('aktiva effekter visas i HUD:en med en krympande stapel', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    // Staplarna ritas i amber (#f2b04a) på raden under statusfältet, högerjusterat
    const amberCount = () => page.evaluate(() => {
      const c = document.getElementById('game').getContext('2d');
      const d = c.getImageData(180, 16, 140, 9).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xf2 && d[i + 1] === 0xb0 && d[i + 2] === 0x4a) n++;
      return n;
    });
    await frames(page, 2);
    expect(await amberCount()).toBe(0);
    await g(page, (game) => game.debug.givePowerup('tool'));
    await frames(page, 2);
    const full = await amberCount();
    expect(full).toBeGreaterThan(40);
    await g(page, (game) => { game.effects.tool = 4; });
    await frames(page, 2);
    const half = await amberCount();
    expect(half).toBeLessThan(full);
    await expectNoErrors(errors);
  });

  test('skärmdump: fallande power-ups och aktiva effekter', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(false);
      game.debug.shiftEnemies(0, 1000); // tillbaka till startläget
      game.debug.freezeEnemies(true);
      game.bullets = [];
      game.debug.givePowerup('think');
      game.debug.givePowerup('tool');
      game.debug.givePowerup('review');
      game.debug.givePowerup('shield');
      game.effects.think = 3.2;
      game.effects.review = 2.4;
      game.floaters = [];
      ['think', 'tool', 'shield', 'review', 'life'].forEach((t, i) => game.debug.spawnPowerup(t, 40 + i * 50, 110 + (i % 2) * 30));
      game.debug.spawnEnemyBulletAt(260, 150); // ett fiendeskott att jämföra med
    });
    await frames(page, 3);
    await freezeFrame(page);
    await page.locator('#game').screenshot({ path: 'test-results/fas4-powerups.png' });
    await expectNoErrors(errors);
  });
});
