// Ljud och känsla (Fas 5): Web Audio, musik, partiklar och skärmskakning
import { test, expect } from '@playwright/test';
import { openGame, startGame, press, frames, g, expectNoErrors } from './helpers.js';

// Räknar hur många AudioContext som skapas, så att vi kan bevisa att inget skapas före interaktion
const COUNT_CONTEXTS = () => {
  const AC = window.AudioContext;
  window.__acCount = 0;
  window.AudioContext = class extends AC {
    constructor(...a) {
      super(...a);
      window.__acCount += 1;
    }
  };
};

// Fryser fienderna och tar bort alla skott så att inget oväntat händer
async function calm(page) {
  await g(page, (game) => {
    game.debug.freezeEnemies(true);
    game.debug.clearEnemyBullets();
    game.debug.setLives(99);
    game.debug.setDropChance(0);
    game.audio.log.length = 0;
  });
}

const logged = (page, name) => page.waitForFunction((n) => window.__game.audio.log.includes(n), name);

// Lägger ett skott (uppåt) mitt på (x, y)
function pushToken(page, x, y) {
  return page.evaluate(async ([px, py]) => {
    const { makeToken } = await import('/js/projectiles.js');
    window.__game.bullets.push(makeToken(px - 1.5, py - 3));
  }, [x, y]);
}

// Dödar en ensam fiende av given typ med ett skott
async function killSolo(page, type) {
  // Allt i ett synkront anrop: i långsamma webbläsare hinner rutnätet annars flytta fienden mellan placering och träff
  await page.evaluate(async (t) => {
    const { makeToken } = await import('/js/projectiles.js');
    const game = window.__game;
    game.debug.killAllEnemies();
    game.debug.placeEnemy(t, 3, 2);
    game.debug.freezeEnemies(true);
    game.shields.shields = [];
    const e = game.enemies[0];
    game.bullets.push(makeToken(e.x + e.w / 2, e.y + e.h / 2));
    game.update(1 / 60); // ett lugnt steg, så att ett långt frame-hack inte låter skottet flyga förbi
  }, type);
}

test.describe('Ljud: AudioContext och interaktion', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit-bygge (Windows) saknar Web Audio (AudioContext är odefinierat); spelet förblir tyst utan fel, vilket övriga tester täcker');
  });
  test('inget AudioContext och inga varningar före första interaktionen', async ({ page }) => {
    await page.addInitScript(COUNT_CONTEXTS);
    const msgs = [];
    page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) msgs.push(m.text()); });
    const errors = await openGame(page);
    await frames(page, 10);
    expect(await g(page, (game) => game.audio.ctxState)).toBe('none');
    expect(await page.evaluate(() => window.__acCount)).toBe(0);
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);
    expect(msgs).toEqual([]);
    await expectNoErrors(errors);
  });

  test('AudioContext skapas vid första tangenttrycket och startar', async ({ page }) => {
    await page.addInitScript(COUNT_CONTEXTS);
    const errors = await openGame(page);
    await press(page, 'ArrowLeft');
    expect(await page.evaluate(() => window.__acCount)).toBe(1);
    await page.waitForFunction(() => window.__game.audio.ctxState === 'running');
    // Fler tangenter skapar inte fler
    await press(page, 'ArrowRight');
    expect(await page.evaluate(() => window.__acCount)).toBe(1);
    await expectNoErrors(errors);
  });

  test('AudioContext skapas också vid musklick', async ({ page }) => {
    await page.addInitScript(COUNT_CONTEXTS);
    const errors = await openGame(page);
    await page.mouse.click(50, 50);
    expect(await page.evaluate(() => window.__acCount)).toBe(1);
    await expectNoErrors(errors);
  });

  test('spelet fungerar tyst om AudioContext saknas', async ({ page }) => {
    await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
    const errors = await startGame(page);
    await calm(page);
    await press(page, 'Space');
    await g(page, (game) => game.debug.setLives(1));
    expect(await g(page, (game) => game.audio.ctxState)).toBe('none');
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);
    await press(page, 'm');
    expect(await g(page, (game) => game.muted)).toBe(true);
    await logged(page, 'shoot');
    await expectNoErrors(errors);
  });
});

test.describe('Ljud: effekter', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit-bygge (Windows) saknar Web Audio (AudioContext är odefinierat); spelet förblir tyst utan fel, vilket övriga tester täcker');
  });
  test('skott loggas som "shoot"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await press(page, 'Space');
    await logged(page, 'shoot');
    await expectNoErrors(errors);
  });

  test('en bugg som dör ger "hit", en minnesläcka ger "explosion"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await killSolo(page, 'syntax');
    await logged(page, 'hit');
    expect(await g(page, (game) => game.audio.log.includes('explosion'))).toBe(false);
    await g(page, (game) => { game.audio.log.length = 0; game.debug.setLives(99); });
    await killSolo(page, 'leak');
    await logged(page, 'explosion');
    await expectNoErrors(errors);
  });

  test('spelarskada ger "hurt"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3));
    await logged(page, 'hurt');
    expect(await g(page, (game) => game.lives)).toBe(98);
    await expectNoErrors(errors);
  });

  test('power-up ger "powerup"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.spawnPowerup('tool', game.player.x + 1, game.player.y - 2));
    await logged(page, 'powerup');
    await expectNoErrors(errors);
  });

  test('Refaktorering ger "refactor"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.setContext(8));
    await press(page, 'Shift');
    await logged(page, 'refactor');
    await expectNoErrors(errors);
  });

  test('Heisenbuggen ger ett diskret "flicker"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.spawnHeisenbug(100, 120));
    await logged(page, 'flicker');
    await expectNoErrors(errors);
  });

  test('nivå klar ger "levelclear" och game over ger "gameover"', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.killAllEnemies());
    await logged(page, 'levelclear');
    expect(await g(page, (game) => game.level)).toBe(2);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.setLives(1); game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3); });
    await logged(page, 'gameover');
    expect(await g(page, (game) => game.state)).toBe('gameover');
    await expectNoErrors(errors);
  });

  test('effektloggen har ett tak och räknaren fortsätter räkna', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { for (let i = 0; i < 50; i++) game.audio.sfx('flicker'); });
    const s = await g(page, (game) => ({ n: game.audio.log.length, c: game.audio.effectCount }));
    expect(s.n).toBeLessThanOrEqual(20);
    expect(s.c).toBeGreaterThanOrEqual(50);
    await expectNoErrors(errors);
  });
});

test.describe('Ljud: av/på', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit-bygge (Windows) saknar Web Audio (AudioContext är odefinierat); spelet förblir tyst utan fel, vilket övriga tester täcker');
  });
  test('M växlar mute, påverkar master-gain och sparas i localStorage över omladdning', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    expect(await g(page, (game) => game.audio.masterGain)).toBeGreaterThan(0);
    await press(page, 'm');
    expect(await g(page, (game) => game.muted)).toBe(true);
    expect(await g(page, (game) => game.audio.masterGain)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('buggjakten.muted'))).toBe('1');
    await press(page, 'm');
    expect(await g(page, (game) => game.muted)).toBe(false);
    expect(await g(page, (game) => game.audio.masterGain)).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('buggjakten.muted'))).toBe('0');
    await press(page, 'm');
    expect(await page.evaluate(() => localStorage.getItem('buggjakten.muted'))).toBe('1');

    await page.reload();
    await page.waitForFunction(() => window.__game !== undefined);
    expect(await g(page, (game) => game.muted)).toBe(true);
    expect(await g(page, (game) => game.audio.ctxState)).toBe('none'); // fortfarande ingen interaktion
    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.audio.masterGain !== null);
    expect(await g(page, (game) => game.audio.masterGain)).toBe(0);
    await expectNoErrors(errors);
  });

  test('M före första interaktionen sparas och gäller när ljudet skapas', async ({ page }) => {
    const errors = await openGame(page);
    await press(page, 'm');
    expect(await g(page, (game) => game.muted)).toBe(true);
    expect(await g(page, (game) => game.audio.masterGain)).toBe(0);
    await expectNoErrors(errors);
  });

  test('ljudikonen i hörnet visas med streck (rött) när ljudet är av', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const redPixels = () => page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(309, 229, 9, 7).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xd4 && d[i + 1] === 0x48 && d[i + 2] === 0x3b) n++;
      return n;
    });
    await frames(page, 2);
    expect(await redPixels()).toBe(0);
    await press(page, 'm');
    await frames(page, 2);
    expect(await redPixels()).toBeGreaterThan(3);
    await expectNoErrors(errors);
  });
});

test.describe('Musik', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName === 'webkit', 'Playwrights WebKit-bygge (Windows) saknar Web Audio (AudioContext är odefinierat); spelet förblir tyst utan fel, vilket övriga tester täcker');
  });
  test('spelar under spel, pausar vid paus, stoppar vid game over och startar vid ny match', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await page.waitForFunction(() => window.__game.audio.ctxState === 'running');
    await page.waitForFunction(() => window.__game.audio.musicPlaying);
    // Toner schemaläggs löpande (speltiden går via AudioContext.currentTime)
    const n0 = await g(page, (game) => game.audio.notesScheduled);
    await page.waitForFunction((n) => window.__game.audio.notesScheduled > n + 8, n0);

    await press(page, 'p');
    expect(await g(page, (game) => game.state)).toBe('paused');
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);
    const paused = await g(page, (game) => game.audio.notesScheduled);
    await frames(page, 10);
    expect(await g(page, (game) => game.audio.notesScheduled)).toBe(paused);
    await press(page, 'p');
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(true);

    await g(page, (game) => { game.debug.setLives(1); game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3); });
    await page.waitForFunction(() => window.__game.state === 'gameover');
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);

    await press(page, 'Space');
    await page.waitForFunction(() => window.__game.state === 'playing');
    await frames(page, 2);
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(true);
    await expectNoErrors(errors);
  });

  test('ingen musik i startmenyn', async ({ page }) => {
    const errors = await openGame(page);
    await press(page, 'ArrowLeft'); // skapar AudioContext
    await frames(page, 3);
    expect(await g(page, (game) => game.audio.ctxState)).not.toBe('none');
    expect(await g(page, (game) => game.audio.musicPlaying)).toBe(false);
    await expectNoErrors(errors);
  });

  test('tempot är högre med få fiender än med fullt rutnät', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.clearEnemyBullets(); game.debug.setLives(99); });
    await frames(page, 2);
    const full = await g(page, (game) => game.audio.musicTempo);
    expect(full).toBeGreaterThan(60);
    // Halva rutnätet kvar
    await g(page, (game) => { game.grid.enemies = game.grid.enemies.slice(0, 20); });
    await frames(page, 2);
    const half = await g(page, (game) => game.audio.musicTempo);
    // Bara en fiende kvar (total förblir 40)
    await g(page, (game) => { game.grid.enemies = game.grid.enemies.slice(0, 1); });
    await frames(page, 2);
    const few = await g(page, (game) => game.audio.musicTempo);
    expect(half).toBeGreaterThan(full);
    expect(few).toBeGreaterThan(half);
    await expectNoErrors(errors);
  });

  test('musikvarianten byts under boss och tillbaka efter bossen', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.freezeEnemies(true); });
    await page.waitForFunction(() => window.__game.audio.musicVariant === 'normal');
    const normal = await g(page, (game) => game.audio.musicTempo);
    await g(page, (game) => game.debug.startBoss('loop'));
    await page.waitForFunction(() => window.__game.audio.musicVariant === 'boss');
    const boss1 = await g(page, (game) => game.audio.musicTempo);
    await g(page, (game) => game.debug.freezeEnemies(false));
    await g(page, (game) => game.debug.setBossHp(5)); // fas 3
    await frames(page, 2);
    const boss3 = await g(page, (game) => game.audio.musicTempo);
    expect(boss3).toBeGreaterThan(boss1);
    expect(boss1).toBeGreaterThan(normal);
    await g(page, (game) => game.debug.startBoss('stack'));
    await frames(page, 2);
    expect(await g(page, (game) => game.audio.musicVariant)).toBe('boss');
    await g(page, (game) => game.debug.setLevel(1));
    await page.waitForFunction(() => window.__game.audio.musicVariant === 'normal');
    await expectNoErrors(errors);
  });
});

test.describe('Partiklar', () => {
  test('en bugg som dör ger partiklar i buggens färger som tar slut efter en stund', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    // Allt i ett synkront steg, så att resultatet inte beror på hur snabbt sidan kör
    const r = await page.evaluate(async () => {
      const game = window.__game;
      const { makeToken } = await import('/js/projectiles.js');
      game.particles.clear();
      game.debug.killAllEnemies();
      game.debug.placeEnemy('syntax', 3, 2);
      game.shields.shields = [];
      const e = game.enemies[0];
      game.bullets.push(makeToken(e.x + e.w / 2 - 1.5, e.y + 2));
      game.update(1 / 60);
      const before = game.particles.count;
      const colors = [...new Set(game.particles.list.map((p) => p.color))];
      let steps = 0;
      while (game.particles.count > 0 && steps < 200) { game.update(0.05); steps += 1; if (game.state !== 'playing') break; }
      return { before, colors, steps, after: game.particles.count, pos: game.enemies.length };
    });
    expect(r.before).toBeGreaterThan(5);
    // Syntaxfelets färger: röd, mörkröd, gul
    expect(r.colors.every((c) => ['#d4483b', '#7d2a22', '#f2b04a'].includes(c))).toBe(true);
    expect(r.after).toBe(0);
    expect(r.steps).toBeLessThan(40); // under ca 2 sekunder speltid
    await expectNoErrors(errors);
  });

  test('partiklar skapas och försvinner också i vanlig realtid', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await killSolo(page, 'nullptr');
    await page.waitForFunction(() => window.__game.particles.count > 0 || window.__game.score > 0);
    expect(await g(page, (game) => game.score)).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__game.particles.count === 0);
    await expectNoErrors(errors);
  });

  test('gnistor vid träff på testsvit, glitter vid power-up och tak för antalet', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const r = await page.evaluate(async () => {
      const game = window.__game;
      const { makeToken } = await import('/js/projectiles.js');
      const out = {};
      game.particles.clear();
      game.debug.killAllEnemies();
      game.debug.placeEnemy('syntax', 0, 0);
      const s = game.shields.shields[0];
      game.bullets.push(makeToken(s.x + 6, s.y + s.h - 2));
      game.update(1 / 60);
      out.shield = game.particles.count;
      game.particles.clear();
      game.debug.spawnPowerup('shield', game.player.x + 1, game.player.y - 2);
      game.update(1 / 60);
      out.powerup = game.particles.count;
      for (let i = 0; i < 100; i++) game.particles.bugDeath(100, 100, 'leak');
      out.capped = game.particles.count;
      return out;
    });
    expect(r.shield).toBeGreaterThan(0);
    expect(r.powerup).toBeGreaterThan(5);
    expect(r.capped).toBeLessThanOrEqual(400);
    await expectNoErrors(errors);
  });

  test('bossexplosion ger fler partiklar än en vanlig bugg', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('loop'); });
    const r = await page.evaluate(() => {
      const game = window.__game;
      game.particles.clear();
      game.debug.damageBoss(999);
      let peak = 0;
      for (let i = 0; i < 60; i++) {
        game.update(1 / 60);
        peak = Math.max(peak, game.particles.count);
      }
      return { peak, boomed: game.boss.boomed, log: [...game.audio.log] };
    });
    expect(r.boomed).toBe(true);
    expect(r.peak).toBeGreaterThan(40);
    expect(r.log).toContain('explosion');
    await expectNoErrors(errors);
  });
});

test.describe('Skärmskakning', () => {
  test('skakar vid skada med heltalsförskjutning och avtar till 0', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    const r = await page.evaluate(() => {
      const game = window.__game;
      const ctx = document.getElementById('game').getContext('2d');
      const before = game.shake;
      game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3);
      game.update(1 / 60);
      const seq = [];
      const offsets = [];
      for (let i = 0; i < 200 && game.shake > 0; i++) {
        seq.push(game.shake);
        game.render(ctx);
        offsets.push(game.shakeOffset);
        game.update(1 / 60);
      }
      return { before, seq, offsets, after: game.shake, count: game.shakeCount, peak: game.shakePeak };
    });
    expect(r.before).toBe(0);
    expect(r.count).toBe(1);
    expect(r.seq.length).toBeGreaterThan(5);
    expect(r.seq.length).toBeLessThan(60); // kort: under en sekund
    for (let i = 1; i < r.seq.length; i++) expect(r.seq[i]).toBeLessThanOrEqual(r.seq[i - 1]);
    expect(r.offsets.every((o) => Number.isInteger(o.x) && Number.isInteger(o.y))).toBe(true);
    expect(r.offsets.every((o) => Math.abs(o.x) <= r.peak && Math.abs(o.y) <= r.peak)).toBe(true);
    expect(r.offsets.some((o) => o.x !== 0 || o.y !== 0)).toBe(true);
    expect(r.after).toBe(0);
    await expectNoErrors(errors);
  });

  test('skakning startar och avtar också i vanlig realtid', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    // Träffen och första steget i samma synkrona anrop, så att ingen långsam frame hinner äta upp skakningen innan vi mäter
    const start = await g(page, (game) => {
      game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3);
      game.update(1 / 60);
      return { count: game.shakeCount, peak: game.shakePeak };
    });
    expect(start.count).toBe(1);
    expect(start.peak).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__game.shake === 0);
    await expectNoErrors(errors);
  });

  test('skakar också vid Refaktorering och bossexplosion', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.setContext(8));
    await press(page, 'Shift');
    await page.waitForFunction(() => window.__game.shakeCount >= 1);
    await g(page, (game) => { game.debug.startBoss('loop'); game.debug.damageBoss(999); });
    const before = await g(page, (game) => game.shakeCount);
    await page.waitForFunction((n) => window.__game.shakeCount > n && window.__game.shakePeak >= 5, before);
    await expectNoErrors(errors);
  });

  test('ingen skakning med prefers-reduced-motion, men partiklarna finns kvar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await startGame(page);
    await calm(page);
    expect(await g(page, (game) => game.reducedMotion)).toBe(true);
    const r = await page.evaluate(() => {
      const game = window.__game;
      game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3);
      game.update(1 / 60);
      let max = 0;
      for (let i = 0; i < 30; i++) { max = Math.max(max, game.shake); game.update(1 / 60); }
      return { max, count: game.shakeCount, lives: game.lives };
    });
    expect(r.lives).toBe(98); // skadan hände
    expect(r.count).toBe(0);
    expect(r.max).toBe(0);
    await expectNoErrors(errors);
  });

  test('debug.reducedMotion(true) stänger av skakning och partiklar finns kvar', async ({ page }) => {
    const errors = await startGame(page);
    await calm(page);
    await g(page, (game) => game.debug.reducedMotion(true));
    const r = await page.evaluate(() => {
      const game = window.__game;
      game.particles.clear();
      game.debug.spawnEnemyBulletAt(game.player.x + 5, game.player.y + 3);
      game.update(1 / 60);
      return { shake: game.shake, count: game.shakeCount, particles: game.particles.count };
    });
    expect(r.shake).toBe(0);
    expect(r.count).toBe(0);
    expect(r.particles).toBeGreaterThan(0);
    await expectNoErrors(errors);
  });
});

test.describe('Loop-bossens spiral', () => {
  test('fas 2-skotten ligger i jämna vinkelsteg med kontinuerligt roterande startvinkel', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('loop'); });
    const r = await page.evaluate(() => {
      const game = window.__game;
      const boss = game.boss;
      game.debug.setBossHp(15); // fas 2
      game.enemyBullets = [];
      boss.mode = 'burst';
      boss.modeT = 2.2;
      boss.spiralTimer = 0;
      const emissions = [];
      const orig = boss.emitSpiral.bind(boss);
      boss.emitSpiral = (bullets, arms, step, speed) => {
        const start = bullets.length;
        const ang = boss.spiralAng;
        orig(bullets, arms, step, speed);
        const angles = bullets.slice(start).map((b) => Math.atan2(b.vy, b.vx));
        emissions.push({ ang, arms, step, angles });
      };
      for (let i = 0; i < 400 && emissions.length < 8; i++) game.update(0.02);
      return { emissions, phase: boss.phase };
    });
    expect(r.phase).toBe(2);
    expect(r.emissions.length).toBeGreaterThanOrEqual(8);
    const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    for (const e of r.emissions) {
      expect(e.arms).toBeGreaterThanOrEqual(3);
      expect(e.angles).toHaveLength(e.arms);
      for (let k = 1; k < e.angles.length; k++) {
        const d = norm(e.angles[k] - e.angles[k - 1]);
        expect(Math.abs(d - (2 * Math.PI) / e.arms)).toBeLessThan(1e-6); // jämna vinkelsteg mellan armarna
      }
    }
    // Startvinkeln roterar med ett konstant steg per salva, litet nog för att armarna ska bli tydliga kurvor
    for (let i = 1; i < r.emissions.length; i++) {
      const d = r.emissions[i].ang - r.emissions[i - 1].ang;
      expect(d).toBeCloseTo(r.emissions[0].step, 6);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(Math.PI / r.emissions[0].arms / 2);
      expect(norm(r.emissions[i].angles[0] - r.emissions[i - 1].angles[0])).toBeCloseTo(norm(d), 6);
    }
    await expectNoErrors(errors);
  });
});

test.describe('Skärmdumpar (Fas 5)', () => {
  test('skärmdump: partiklar och skakning mitt i en bossexplosion', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('loop'); });
    await page.evaluate(() => {
      const game = window.__game;
      game.debug.damageBoss(999);
      for (let i = 0; i < 400 && !game.boss.shattered; i++) game.update(1 / 60);
      // Lite vanliga effekter också: gnistor över en testsvit, en död bugg och en upplockning
      const s = game.shields.shields[1];
      game.particles.sparks(s.x + 12, s.y + 4);
      game.particles.bugDeath(60, 150, 'nullptr');
      game.particles.pickup(game.player.x + 5, game.player.y + 5);
      for (let i = 0; i < 9; i++) game.update(1 / 60);
      game.shake = 5;
      game.shakeStart = 5;
      game.shakeDur = 10;
      game.update = function () { this.frames += 1; };
    });
    await frames(page, 3);
    await page.locator('#game').screenshot({ path: 'test-results/fas5-particles.png' });
    await expectNoErrors(errors);
  });

  test('skärmdump: loopens spiral', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('loop'); });
    await page.evaluate(() => {
      const game = window.__game;
      game.debug.setBossHp(10); // fas 3
      game.player.x = 20; // ur vägen
      game.update(1 / 60); // fasbytet nollställer boss-läget
      game.boss.cx = 160;
      game.boss.mode = 'burst';
      game.boss.modeT = 99;
      game.boss.spiralTimer = 0;
      game.boss.warpTimer = 99;
      game.enemyBullets = [];
      for (let i = 0; i < 100; i++) { game.update(1 / 60); game.player.invuln = 5; }
      game.update = function () { this.frames += 1; };
    });
    await frames(page, 3);
    await page.locator('#game').screenshot({ path: 'test-results/fas5-loop.png' });
    await expectNoErrors(errors);
  });

  test('skärmdump: Race condition bredvid de andra typerna', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 960 });
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.setLives(99); game.debug.setLevel(4); game.debug.freezeEnemies(true); });
    await page.evaluate(() => {
      window.__game.update = function () { this.frames += 1; };
    });
    await frames(page, 3);
    await page.locator('#game').screenshot({ path: 'test-results/fas5-race.png' });
    await expectNoErrors(errors);
  });
});
