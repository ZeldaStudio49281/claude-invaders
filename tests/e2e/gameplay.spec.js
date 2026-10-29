// Kärnspelet (Fas 2): spelare, fiender, skott, kollisioner, liv, nivåer och paus
import { test, expect } from '@playwright/test';
import { openGame, startGame, press, frames, g, state, expectNoErrors, shotDone } from './helpers.js';

// Håller en tangent nere tills villkoret uppfylls
async function holdUntil(page, key, cond) {
  await page.keyboard.down(key);
  await page.waitForFunction(cond);
  await page.keyboard.up(key);
}

test.describe('Spelaren', () => {
  for (const [name, left, right] of [['piltangenter', 'ArrowLeft', 'ArrowRight'], ['A och D', 'KeyA', 'KeyD']]) {
    test(`rör sig i sidled med ${name} och stannar vid kanten`, async ({ page }) => {
      const errors = await startGame(page);
      await g(page, (game) => game.debug.freezeEnemies(true));
      const x0 = await g(page, (game) => game.player.x);

      await holdUntil(page, right, () => window.__game.player.x > 200);
      expect(await g(page, (game) => game.player.x)).toBeGreaterThan(x0);

      // Håll inne längre efter kanten: x får inte passera högerkanten
      await page.keyboard.down(right);
      await page.waitForFunction(() => {
        const p = window.__game.player;
        return p.x + p.w >= 316 - 0.01;
      });
      await frames(page, 5);
      await page.keyboard.up(right);
      const edgeR = await g(page, (game) => game.player.x + game.player.w);
      expect(edgeR).toBeLessThanOrEqual(316);

      await holdUntil(page, left, () => window.__game.player.x <= 4);
      await page.keyboard.down(left);
      await frames(page, 5);
      await page.keyboard.up(left);
      expect(await g(page, (game) => game.player.x)).toBe(4);
      await expectNoErrors(errors);
    });
  }

  test('mellanslag skjuter, med cooldown och högst två skott', async ({ page }) => {
    const errors = await startGame(page);
    // Flytta bort fienderna så att skotten inte träffar något
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.shiftEnemies(0, -1000); });
    expect(await g(page, (game) => game.bullets.length)).toBe(0);

    await press(page, 'Space');
    expect(await g(page, (game) => game.bullets.length)).toBe(1);
    // Håll skotten på plats så att långsamma frames inte hinner flytta ut dem ur bild (testet gäller cooldown och tak)
    const hold = () => g(page, (game) => game.bullets.forEach((b) => { b.vy = 0; }));
    await hold();

    // Ett nytt tryck under cooldown ger inget skott
    await g(page, (game) => { game.player.cooldown = 10; });
    await press(page, 'Space');
    expect(await g(page, (game) => game.bullets.length)).toBe(1);

    // När cooldown är slut kommer nästa skott
    await g(page, (game) => { game.player.cooldown = 0; });
    await press(page, 'Space');
    expect(await g(page, (game) => game.bullets.length)).toBe(2);
    await hold();

    // Tak på två skott åt gången även utan cooldown
    await g(page, (game) => { game.player.cooldown = 0; });
    await press(page, 'Space');
    expect(await g(page, (game) => game.bullets.length)).toBe(2);

    // Skotten flyger uppåt och försvinner utanför skärmen
    await g(page, (game) => game.bullets.forEach((b) => { b.vy = -220; }));
    await shotDone(page);
    await expectNoErrors(errors);
  });
});

test.describe('Start utan startskott', () => {
  test('mellanslaget som startar spelet skjuter inte förrän det släppts', async ({ page }) => {
    const errors = await openGame(page);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__game.state === 'playing');
    await frames(page, 6);
    expect(await g(page, (game) => game.bullets.length)).toBe(0);
    await page.keyboard.up('Space');
    await frames(page, 2);
    expect(await g(page, (game) => game.bullets.length)).toBe(0);
    await press(page, 'Space'); // ett nytt tryck skjuter
    expect(await g(page, (game) => game.bullets.length)).toBe(1);
    await expectNoErrors(errors);
  });

  test('samma sak vid omstart från gameover', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.lives = 0; });
    await page.waitForFunction(() => window.__game.state === 'gameover');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__game.state === 'playing');
    await frames(page, 6);
    expect(await g(page, (game) => game.bullets.length)).toBe(0);
    await page.keyboard.up('Space');
    await frames(page, 2);
    expect(await g(page, (game) => game.bullets.length)).toBe(0);
    await expectNoErrors(errors);
  });
});

test.describe('Fienderna', () => {
  test('rutnätet rör sig, byter riktning och sjunker vid kanten', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLives(99));
    expect(await g(page, (game) => game.enemies.length)).toBe(40);

    // Rör sig i sidled
    const x0 = await g(page, (game) => game.enemies[0].x);
    await page.waitForFunction((x) => window.__game.enemies[0].x > x + 3, x0);

    // Flytta nära högerkanten och vänta på riktningsbyte + nedstigning
    const y0 = await g(page, (game) => game.enemies[0].y);
    await g(page, (game) => {
      const maxX = Math.max(...game.enemies.map((e) => e.x + e.w));
      game.debug.shiftEnemies(300 - maxX, 0);
    });
    await page.waitForFunction(() => window.__game.grid.dir === -1);
    expect(await g(page, (game) => game.enemies[0].y)).toBe(y0 + 8);
    const maxX = await g(page, (game) => Math.max(...game.enemies.map((e) => e.x + e.w)));
    expect(maxX).toBeLessThanOrEqual(316);

    // Nu går de åt vänster
    const x1 = await g(page, (game) => game.enemies[0].x);
    await page.waitForFunction((x) => window.__game.enemies[0].x < x - 3, x1);
    await expectNoErrors(errors);
  });

  test('rutnätet går snabbare när färre fiender återstår', async ({ page }) => {
    await startGame(page);
    const full = await g(page, (game) => game.grid.speed);
    await g(page, (game) => { game.grid.enemies = game.grid.enemies.slice(0, 5); });
    expect(await g(page, (game) => game.grid.speed)).toBeGreaterThan(full * 2);
  });

  test('bara den nedersta buggen i varje kolumn skjuter', async ({ page }) => {
    await startGame(page);
    const ok = await g(page, (game) => {
      const s = game.grid.shooters();
      const maxRow = Math.max(...game.enemies.map((e) => e.row));
      return s.length === 8 && s.every((e) => e.row === maxRow);
    });
    expect(ok).toBe(true);
  });

  test('fienderna skjuter nedåt', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLives(99));
    await page.waitForFunction(() => window.__game.enemyBullets.length > 0);
    const y0 = await g(page, (game) => game.enemyBullets[0].y);
    await page.waitForFunction((y) => window.__game.enemyBullets.some((b) => b.y > y + 5) || window.__game.enemyBullets.length === 0, y0);
    await expectNoErrors(errors);
  });
});

test.describe('Kollisioner, liv och poäng', () => {
  test('ett skott som träffar en bugg tar bort den och ger poäng', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(true);
      const e = game.enemies.reduce((a, b) => (b.y > a.y ? b : a)); // nedersta
      game.player.x = e.x + e.w / 2 - game.player.w / 2;
    });
    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.score > 0);
    expect(await g(page, (game) => game.score)).toBe(10);
    expect(await g(page, (game) => game.enemies.length)).toBe(39);
    expect(await g(page, (game) => game.bullets.length)).toBe(0); // skottet förbrukas
    await expectNoErrors(errors);
  });

  test('ett fiendeskott som träffar spelaren drar ett liv och ger osårbarhet', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.clearEnemyBullets(); });
    const spawn = () => g(page, (game) => game.debug.spawnEnemyBulletAt(game.player.x + game.player.w / 2, game.player.y));
    await spawn();
    await page.waitForFunction(() => window.__game.lives === 2);
    expect(await g(page, (game) => game.player.invuln)).toBeGreaterThan(0);
    // Ny träff under osårbarheten räknas inte
    await spawn();
    await frames(page, 5);
    expect(await g(page, (game) => game.lives)).toBe(2);
    expect(await state(page)).toBe('playing');
    await expectNoErrors(errors);
  });

  test('0 liv ger gameover', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => {
      game.debug.freezeEnemies(true);
      game.debug.setLives(1);
      game.debug.spawnEnemyBulletAt(game.player.x + game.player.w / 2, game.player.y);
    });
    await page.waitForFunction(() => window.__game.state === 'gameover');
    expect(await g(page, (game) => game.lives)).toBe(0);
    await expectNoErrors(errors);
  });

  test('en bugg som når botten ger gameover', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.shiftEnemies(0, 150); });
    await page.waitForFunction(() => window.__game.state === 'gameover');
    expect(await g(page, (game) => game.lives)).toBe(3); // förlorade utan att tappa liv
    await expectNoErrors(errors);
  });
});

test.describe('Nivåer, paus och omstart', () => {
  test('alla fiender döda ger nivå 2 med ett nytt rutnät lägre ner', async ({ page }) => {
    const errors = await startGame(page);
    const y1 = await g(page, (game) => game.enemies[0].y);
    await g(page, (game) => game.debug.killAllEnemies());
    await page.waitForFunction(() => window.__game.level === 2);
    expect(await state(page)).toBe('playing');
    expect(await g(page, (game) => game.enemies.length)).toBe(40);
    expect(await g(page, (game) => game.enemies[0].y)).toBeGreaterThan(y1);
    await expectNoErrors(errors);
  });

  test('paus fryser fienderna, skotten och tiden', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLives(99));
    await page.waitForFunction(() => window.__game.enemyBullets.length > 0);
    await press(page, 'KeyP');
    expect(await state(page)).toBe('paused');
    const snap = () => g(page, (game) => JSON.stringify([
      game.enemies[0].x, game.enemies[0].y, game.enemyBullets.map((b) => b.y), game.grid.shootTimer, game.player.invuln,
    ]));
    const before = await snap();
    await frames(page, 15);
    expect(await snap()).toBe(before);

    // Efter paus går det vidare
    await press(page, 'Escape');
    expect(await state(page)).toBe('playing');
    await page.waitForFunction((b) => JSON.stringify([
      window.__game.enemies[0].x, window.__game.enemies[0].y, window.__game.enemyBullets.map((x) => x.y),
      window.__game.grid.shootTimer, window.__game.player.invuln,
    ]) !== b, before);
    await expectNoErrors(errors);
  });

  test('omstart från gameover nollställer poäng, liv och nivå', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.score = 120; game.level = 3; game.lives = 0; });
    // Poängen kvalar in på topplistan (Fas 6), så namninmatningen kommer före game over
    await page.waitForFunction(() => window.__game.state === 'enterName');
    await press(page, 'Enter');
    await page.waitForFunction(() => window.__game.state === 'gameover');
    expect(await g(page, (game) => game.highScore)).toBe(120);
    await press(page, 'Space');
    expect(await state(page)).toBe('playing');
    expect(await g(page, (game) => [game.score, game.lives, game.level, game.enemies.length])).toEqual([0, 3, 1, 40]);
    expect(await g(page, (game) => game.highScore)).toBe(120); // rekordet består
    await expectNoErrors(errors);
  });

  test('felsökningsgenvägen K är borttagen', async ({ page }) => {
    await startGame(page);
    await press(page, 'KeyK');
    expect(await state(page)).toBe('playing');
  });
});

test.describe('Text och rendering', () => {
  test('typsnittet innehåller alla tecken i strings.js', async ({ page }) => {
    await openGame(page);
    const missing = await page.evaluate(async () => {
      const { STR } = await import('/js/strings.js');
      const { missingChars } = await import('/js/font.js');
      const all = [];
      const walk = (v) => (typeof v === 'string' ? all.push(v) : Object.values(v).forEach(walk));
      walk(STR);
      // Tecken som HUD/spel lägger till själva
      all.push('0123456789: ÅÄÖåäö');
      return [...new Set(all.flatMap((s) => missingChars(s)))];
    });
    expect(missing).toEqual([]);
  });

  test('en match i några sekunder ger inga konsolfel, och en skärmdump tas', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    const errors = await startGame(page, 7);
    await g(page, (game) => game.debug.setLives(9));
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__game.enemyBullets.length >= 2 && window.__game.bullets.length >= 1);
    await page.keyboard.up('ArrowRight');
    // Dra bort spelaren från mitten och ta bild mitt i spelet
    await frames(page, 20);
    await page.keyboard.up('Space');
    await page.locator('canvas#game').screenshot({ path: 'test-results/fas2.png' });
    await frames(page, 60);
    expect(['playing', 'gameover']).toContain(await state(page));
    await expectNoErrors(errors);
  });
});
