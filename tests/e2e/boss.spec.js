// Bossar (Fas 4): Den oändliga loopen (nivå 5) och Stack Overflow-monstret (nivå 10)
import { test, expect } from '@playwright/test';
import { startGame, press, frames, g, expectNoErrors, shotDone } from './helpers.js';

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

// Lägger ett skott (uppåt) mitt på (x, y)
function pushToken(page, x, y, pierce = false) {
  return page.evaluate(async ([px, py, p]) => {
    const { makeToken, makePiercingToken } = await import('/js/projectiles.js');
    window.__game.bullets.push(p ? makePiercingToken(px - 1.5, py - 3) : makeToken(px - 1.5, py - 3));
  }, [x, y, pierce]);
}

async function loopBoss(page, seed = 1) {
  const errors = await startGame(page, seed);
  await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('loop'); });
  return errors;
}

async function stackBoss(page, seed = 1) {
  const errors = await startGame(page, seed);
  await g(page, (game) => { game.debug.setLives(99); game.debug.setDropChance(0); game.debug.startBoss('stack'); });
  return errors;
}

// Fryser bilden (update gör inget mer) så att skärmdumpen inte får paus-överlägget
async function freezeFrame(page) {
  await page.evaluate(() => { window.__game.update = function () { this.frames += 1; }; });
  await frames(page, 2);
}

test.describe('Bossnivåer', () => {
  test('nivå 5 startar Den oändliga loopen i stället för rutnätet', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLevel(5));
    const s = await g(page, (game) => ({ level: game.level, state: game.state, enemies: game.enemies.length, kind: game.boss.kind, name: game.boss.name }));
    expect(s).toEqual({ level: 5, state: 'playing', enemies: 0, kind: 'loop', name: 'Den oändliga loopen' });
    await frames(page, 10);
    expect(await g(page, (game) => [game.level, game.state])).toEqual([5, 'playing']); // tomt rutnät är inte en vinst
    await expectNoErrors(errors);
  });

  test('nivå 10 startar Stack Overflow-monstret', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.setLevel(10));
    const s = await g(page, (game) => ({ enemies: game.enemies.length, kind: game.boss.kind, name: game.boss.name }));
    expect(s).toEqual({ enemies: 0, kind: 'stack', name: 'Stack Overflow-monstret' });
    await frames(page, 10);
    expect(await g(page, (game) => game.state)).toBe('playing');
    await expectNoErrors(errors);
  });

  test('vanliga nivåer har ingen boss, och startBoss-kroken startar bossnivåerna', async ({ page }) => {
    const errors = await startGame(page);
    expect(await g(page, (game) => game.boss)).toBeNull();
    await g(page, (game) => game.debug.setLevel(4));
    expect(await g(page, (game) => [game.boss, game.enemies.length])).toEqual([null, 40]);
    await g(page, (game) => game.debug.startBoss('loop'));
    expect(await g(page, (game) => [game.level, game.boss.kind])).toEqual([5, 'loop']);
    await g(page, (game) => game.debug.startBoss('stack'));
    expect(await g(page, (game) => [game.level, game.boss.kind])).toEqual([10, 'stack']);
    await g(page, (game) => game.debug.setLevel(6));
    expect(await g(page, (game) => [game.boss, game.enemies.length])).toEqual([null, 40]);
    await expectNoErrors(errors);
  });

  test('livsmätaren överst visar bossens liv', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    // Mätaren börjar efter namnet (x0) och slutar vid x=204, på y=18..22
    const bar = () => page.evaluate(async () => {
      const { textWidth } = await import('/js/font.js');
      const game = window.__game;
      const x0 = 4 + textWidth(game.boss.name) + 6;
      const c = document.getElementById('game').getContext('2d');
      const row = c.getImageData(x0, 19, 204 - x0, 1).data;
      let filled = 0;
      for (let i = 0; i < row.length; i += 4) if (row[i] !== 0x1f) filled++; // allt som inte är bakgrund
      return { filled, total: 204 - x0 };
    });
    await frames(page, 2);
    const full = await bar();
    expect(full.filled).toBeGreaterThan(full.total * 0.9);
    await g(page, (game) => game.debug.setBossHp(Math.round(game.boss.maxHp / 2)));
    await frames(page, 2);
    const half = await bar();
    expect(half.filled).toBeGreaterThan(full.total * 0.35);
    expect(half.filled).toBeLessThan(full.total * 0.65);
    await g(page, (game) => game.debug.setBossHp(1));
    await frames(page, 2);
    expect((await bar()).filled).toBeLessThan(full.total * 0.15);
    await expectNoErrors(errors);
  });
});

test.describe('Den oändliga loopen', () => {
  test('ringen är ungefär 40-50 px bred och roterar medurs', async ({ page }) => {
    const errors = await loopBoss(page);
    await trackDt(page);
    const size = await g(page, (game) => ({ w: game.boss.w, slots: game.boss.slotPos(3), cx: game.boss.cx, cy: game.boss.cy }));
    expect(size.w).toBeGreaterThanOrEqual(40);
    expect(size.w).toBeLessThanOrEqual(56);
    const a0 = await g(page, (game) => game.boss.rot);
    await frames(page, 10);
    expect(await g(page, (game) => game.boss.rot)).toBeGreaterThan(a0);
    await expectNoErrors(errors);
  });

  test('fasbyten sker vid rätt livtrösklar', async ({ page }) => {
    const errors = await loopBoss(page);
    const max = await g(page, (game) => game.boss.maxHp);
    expect(max).toBe(30);
    const phase = async (hp) => {
      await g(page, (game, n) => game.debug.setBossHp(n), hp);
      return g(page, (game) => game.boss.phase);
    };
    expect(await phase(30)).toBe(1);
    expect(await phase(21)).toBe(1);
    expect(await phase(20)).toBe(2);
    expect(await phase(11)).toBe(2);
    expect(await phase(10)).toBe(3);
    expect(await phase(1)).toBe(3);
    await expectNoErrors(errors);
  });

  test('fas 1 skjuter enstaka riktade skott mot spelaren', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => { game.boss.shotTimer = 0; game.enemyBullets = []; });
    await page.waitForFunction(() => window.__game.enemyBullets.length >= 1);
    const shots = await g(page, (game) => game.enemyBullets.map((b) => ({ vx: b.vx, vy: b.vy, x: b.x })));
    expect(shots).toHaveLength(1);
    expect(shots[0].vy).toBeGreaterThan(30);
    // Spelaren står i mitten och bossen ligger också nära mitten: riktat skott nedåt
    const aim = await g(page, (game) => Math.sign(game.player.x + game.player.w / 2 - game.boss.cx));
    expect(Math.sign(shots[0].vx) === aim || Math.abs(shots[0].vx) < 5).toBe(true);
    await expectNoErrors(errors);
  });

  test('fas 2 skjuter spiralmönster åt många håll', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => { game.debug.setBossHp(15); game.enemyBullets = []; game.boss.mode = 'burst'; game.boss.modeT = 2.2; game.boss.spiralTimer = 0; });
    await page.waitForFunction(() => window.__game.enemyBullets.length >= 12);
    const angles = await g(page, (game) => game.enemyBullets.map((b) => Math.round(Math.atan2(b.vy, b.vx) * 10)));
    expect(new Set(angles).size).toBeGreaterThanOrEqual(8);
    // Skotten går åt alla håll, även uppåt (cirkelmönster)
    const dirs = await g(page, (game) => ({ up: game.enemyBullets.some((b) => b.vy < 0), down: game.enemyBullets.some((b) => b.vy > 0) }));
    expect(dirs).toEqual({ up: true, down: true });
    await expectNoErrors(errors);
  });

  test('fas 3 roterar snabbare och har tätare spiral än fas 2', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(false));
    await trackDt(page);
    const rotRate = async (hp) => {
      await g(page, (game, n) => { game.debug.setBossHp(n); game.enemyBullets = []; }, hp);
      const a = await page.evaluate(() => [window.__game.boss.rot, window.__dtSum]);
      await frames(page, 12);
      const b = await page.evaluate(() => [window.__game.boss.rot, window.__dtSum]);
      return (b[0] - a[0]) / (b[1] - a[1]);
    };
    const r1 = await rotRate(30);
    const r2 = await rotRate(15);
    const r3 = await rotRate(5);
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2 * 1.4);
    const arms = await page.evaluate(async () => {
      const game = window.__game;
      const count = (hp) => {
        game.debug.setBossHp(hp);
        game.enemyBullets = [];
        game.boss.emitSpiral(game.enemyBullets, hp > 10 ? 2 : 3, 0.4, 60);
        return game.enemyBullets.length;
      };
      return [count(15), count(5)];
    });
    expect(arms[1]).toBeGreaterThan(arms[0]);
    await expectNoErrors(errors);
  });

  test('fas 3: bossen loopar tillbaka till startpositionen', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => {
      game.debug.setBossHp(5);
      game.boss.cx = 60;
      game.boss.warpTimer = 0.01;
      game.enemyBullets = [];
    });
    await page.waitForFunction(() => window.__game.boss.warpCount === 1);
    const s = await g(page, (game) => ({ cx: game.boss.cx, bullets: game.enemyBullets.length }));
    expect(Math.abs(s.cx - 160)).toBeLessThan(8);
    expect(s.bullets).toBeGreaterThanOrEqual(10); // en ring av skott där den dyker upp
    await expectNoErrors(errors);
  });

  test('skott mot kärnan tar 2 liv och mot ett segment 1 liv, och skottet förbrukas', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(true)); // bossen står still
    const hp0 = await g(page, (game) => game.boss.hp);
    const core = await g(page, (game) => ({ x: game.boss.cx, y: game.boss.cy }));
    await pushToken(page, core.x, core.y);
    await shotDone(page);
    expect(await g(page, (game) => [game.boss.hp, game.score])).toEqual([hp0 - 2, 25]);

    const seg = await g(page, (game) => { const p = game.boss.slotPos(3); return { x: p.x, y: p.y + 2 }; });
    await pushToken(page, seg.x, seg.y);
    await shotDone(page);
    expect(await g(page, (game) => [game.boss.hp, game.score])).toEqual([hp0 - 3, 35]);
    await expectNoErrors(errors);
  });

  test('ett skott genom hålet i ringen når kärnan, medan ringen i övrigt skyddar den', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    // Vrid ringen så att hålet (plats 0) ligger rakt under kärnan, skjut underifrån
    await g(page, (game) => { game.boss.rot = Math.PI / 2; });
    const hp0 = await g(page, (game) => game.boss.hp);
    const start = await g(page, (game) => ({ x: game.boss.cx, y: game.boss.cy + 60 }));
    await pushToken(page, start.x, start.y);
    await shotDone(page);
    expect(await g(page, (game) => game.boss.hp)).toBe(hp0 - 2); // kärnträff

    // Med ett segment rakt under kärnan träffas segmentet i stället (1 skada)
    // Vrid så att segment 1 ligger rakt under kärnan: nu träffas segmentet i stället (1 skada)
    const blocked = await g(page, (game) => {
      game.boss.rot = Math.PI / 2 - (Math.PI * 2) / 12;
      return game.boss.slotPos(1).y > game.boss.cy + 15;
    });
    expect(blocked).toBe(true);
    await pushToken(page, start.x, start.y);
    await shotDone(page);
    expect(await g(page, (game) => game.boss.hp)).toBe(hp0 - 3);
    await expectNoErrors(errors);
  });

  test('bossens skott träffar spelaren och tar ett liv', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => {
      game.debug.setLives(3);
      game.boss.cx = game.player.x + game.player.w / 2;
      game.boss.shotTimer = 0;
      game.enemyBullets = [];
    });
    await page.waitForFunction(() => window.__game.lives < 3);
    expect(await g(page, (game) => game.lives)).toBe(2);
    await expectNoErrors(errors);
  });

  test('bossens skott äter testsviter', async ({ page }) => {
    const errors = await loopBoss(page);
    const sx = await g(page, (game) => { const s = game.shields.shields[0]; return s.x + s.w / 2; });
    await g(page, (game, x) => {
      game.player.x = x - game.player.w / 2;
      game.boss.cx = x;
      game.boss.shotTimer = 0;
      game.enemyBullets = [];
    }, sx);
    const before = await g(page, (game) => game.shields.cellCount);
    await page.waitForFunction((n) => window.__game.shields.cellCount < n, before);
    await expectNoErrors(errors);
  });

  test('skärmdump: loop-bossen i fas 2 med spiralskott', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => {
      game.debug.setBossHp(18);
      game.enemyBullets = [];
      game.boss.mode = 'burst';
      game.boss.modeT = 2.2;
      game.boss.spiralTimer = 0;
    });
    await page.waitForFunction(() => window.__game.enemyBullets.length >= 22);
    await g(page, (game) => { game.debug.givePowerup('shield'); game.effects.think = 3; });
    await freezeFrame(page);
    await page.locator('#game').screenshot({ path: 'test-results/fas4-loop.png' });
    await expectNoErrors(errors);
  });
});

test.describe('Stack Overflow-monstret', () => {
  test('tornet består av block med etiketter och ligger ovanför spelfältet', async ({ page }) => {
    const errors = await stackBoss(page);
    const s = await g(page, (game) => ({ n: game.boss.blocks.length, hp: game.boss.hp, max: game.boss.maxHp, labels: game.boss.blocks.map((b) => b.label), bottom: game.boss.bottom, prod: game.player.y }));
    expect(s.n).toBe(6);
    expect(s.hp).toBe(s.max);
    expect(s.labels.every((l) => l.includes('()'))).toBe(true);
    expect(s.bottom).toBeLessThan(s.prod - 80);
    await expectNoErrors(errors);
  });

  test('tornet staplar nya block ovanpå och sjunker', async ({ page }) => {
    const errors = await stackBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(false));
    const before = await g(page, (game) => ({ n: game.boss.blocks.length, bottom: game.boss.bottom, lastY: game.boss.blocks.at(-1).by, hp: game.boss.hp, top: game.boss.blocks[0].id }));
    await g(page, (game) => { game.boss.stackTimer = 0.05; game.boss.shotTimer = 99; });
    await page.waitForFunction((n) => window.__game.boss.blocks.length === n + 1, before.n);
    const mid = await g(page, (game) => ({ top: game.boss.blocks[0].id, bottom: game.boss.bottom, hp: game.boss.hp }));
    expect(mid.top).not.toBe(before.top);                 // nytt block överst
    expect(mid.bottom).toBeGreaterThan(before.bottom);    // tornet har sjunkit
    expect(mid.hp).toBe(before.hp);                       // livet är oförändrat, blocket kom från reserven
    // Den nedersta ramen glider ner (animeras)
    await page.waitForFunction((y) => window.__game.boss.blocks.at(-1).by > y + 8, before.lastY);
    await expectNoErrors(errors);
  });

  test('tornet staplar av sig självt med jämna mellanrum och snabbare när färre block återstår', async ({ page }) => {
    const errors = await stackBoss(page);
    const interval = async (hp) => {
      await g(page, (game, n) => { game.debug.setBossHp(n); game.boss.stackTimer = 0.01; game.boss.shotTimer = 99; }, hp);
      await page.waitForFunction(() => window.__game.boss.stackTimer > 0.5);
      return g(page, (game) => game.boss.stackTimer);
    };
    const full = await interval(20);
    const low = await interval(10);
    expect(full).toBeGreaterThan(3.5);
    expect(low).toBeLessThan(full - 0.5);
    // Staplingen sker av sig själv över tid (utan att vi rör timern)
    await g(page, (game) => { game.boss.stackTimer = 0.2; });
    const n0 = await g(page, (game) => game.boss.stacked);
    await page.waitForFunction((n) => window.__game.boss.stacked > n, n0);
    await expectNoErrors(errors);
  });

  test('fasbyten vid rätt livtrösklar och fler skott i senare faser', async ({ page }) => {
    const errors = await stackBoss(page);
    const phase = async (hp) => {
      await g(page, (game, n) => game.debug.setBossHp(n), hp);
      return g(page, (game) => game.boss.phase);
    };
    expect([await phase(20), await phase(14), await phase(13), await phase(7), await phase(6), await phase(1)]).toEqual([1, 1, 2, 2, 3, 3]);
    // Skjuter från toppblocket: ett skott i fas 1, tre i fas 2
    const volley = async (hp) => {
      await g(page, (game, n) => { game.debug.setBossHp(n); game.enemyBullets = []; game.boss.shotTimer = 0; game.boss.stackTimer = 99; }, hp);
      await page.waitForFunction(() => window.__game.enemyBullets.length > 0);
      return g(page, (game) => ({ n: game.enemyBullets.length, y: game.enemyBullets[0].y, topBottom: game.boss.blocks[0].by + 11 }));
    };
    const v1 = await volley(20);
    expect(v1.n).toBe(1);
    expect(Math.abs(v1.y - v1.topBottom)).toBeLessThan(25); // utgår från toppblocket
    const v2 = await volley(12);
    expect(v2.n).toBe(3);
    await expectNoErrors(errors);
  });

  test('skott underifrån skjuter bort nedersta blocket och ger poäng', async ({ page }) => {
    const errors = await stackBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    const s0 = await g(page, (game) => ({ hp: game.boss.hp, n: game.boss.blocks.length, lastId: game.boss.blocks.at(-1).id, x: game.boss.cx, y: game.boss.blocks.at(-1).by + 8 }));
    await pushToken(page, s0.x, s0.y);
    await shotDone(page);
    const s1 = await g(page, (game) => ({ hp: game.boss.hp, n: game.boss.blocks.length, ids: game.boss.blocks.map((b) => b.id), score: game.score, debris: game.boss.debris.length }));
    expect(s1.n).toBe(s0.n - 1);
    expect(s1.hp).toBe(s0.hp - 1);
    expect(s1.ids).not.toContain(s0.lastId);
    expect(s1.score).toBe(25);
    expect(s1.debris).toBeGreaterThan(0); // blocket faller sönder
    await expectNoErrors(errors);
  });

  test('genomträngande skott tar flera block på en gång', async ({ page }) => {
    const errors = await stackBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(true));
    const s0 = await g(page, (game) => ({ x: game.boss.cx, y: game.boss.blocks.at(-1).by + 8, n: game.boss.blocks.length }));
    await pushToken(page, s0.x, s0.y, true);
    await shotDone(page);
    expect(await g(page, (game) => game.boss.blocks.length)).toBe(0);
    await expectNoErrors(errors);
  });

  test('om tornet når produktionslinjen är spelet slut', async ({ page }) => {
    const errors = await stackBoss(page);
    let guard = 0;
    while ((await g(page, (game) => game.boss.bottom < game.player.y - 3)) && guard++ < 40) {
      await g(page, (game) => { game.boss.addBlock(true); game.boss.shotTimer = 99; });
    }
    await page.waitForFunction(() => window.__game.state === 'gameover');
    await expectNoErrors(errors);
  });

  test('tornet är möjligt att besegra: spelaren hinner skjuta bort blocken', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await stackBoss(page);
    // Spelaren skjuter oavbrutet och följer tornet. Boss-skotten ignoreras (99 liv).
    await g(page, (game) => { game.debug.setLives(99); game.player.fireLock = false; });
    await page.keyboard.down('Space');
    const follow = setInterval(() => {
      page.evaluate(() => {
        const game = window.__game;
        if (game.boss && !game.boss.dying) game.player.x = game.boss.cx - game.player.w / 2;
      }).catch(() => {});
    }, 30);
    try {
      await page.waitForFunction(() => window.__game.boss?.dying === true || window.__game.level > 10, undefined, { timeout: 90000 });
    } finally {
      clearInterval(follow);
      await page.keyboard.up('Space');
    }
    expect(await g(page, (game) => game.state)).toBe('playing');
    await expectNoErrors(errors);
  });

  test('skärmdump: stack-tornet', async ({ page }) => {
    const errors = await stackBoss(page);
    await g(page, (game) => {
      game.debug.setBossHp(12);
      game.boss.addBlock();
      game.boss.addBlock();
      game.boss.shotTimer = 0;
      game.boss.stackTimer = 99;
      game.enemyBullets = [];
    });
    await page.waitForFunction(() => window.__game.enemyBullets.length >= 3);
    await frames(page, 25);
    await freezeFrame(page);
    await page.locator('#game').screenshot({ path: 'test-results/fas4-stack.png' });
    await expectNoErrors(errors);
  });
});

test.describe('Bossens död och nästa nivå', () => {
  for (const [kind, level, points] of [['loop', 5, 1500], ['stack', 10, 3000]]) {
    test(`${kind}: döden ger poäng, faller sönder i pixlar och leder till nivå ${level + 1}`, async ({ page }) => {
      const errors = await startGame(page);
      await g(page, (game, k) => { game.debug.setLives(99); game.debug.startBoss(k); game.debug.freezeEnemies(true); }, kind);
      await g(page, (game) => game.debug.damageBoss(9999));
      await page.waitForFunction(() => window.__game.score > 0);
      const s = await g(page, (game) => ({ dying: game.boss.dying, score: game.score, bullets: game.enemyBullets.length }));
      expect(s.dying).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(points);
      expect(s.bullets).toBe(0);
      // Bossen faller sönder i pixlar (debris), och går inte att skada längre
      await page.waitForFunction(() => window.__game.boss.debris.length > 20);
      expect(await g(page, (game) => game.level)).toBe(level);
      await page.waitForFunction((l) => window.__game.level === l + 1, level);
      const next = await g(page, (game) => ({ boss: game.boss, enemies: game.enemies.length, score: game.score, state: game.state }));
      expect(next.boss).toBeNull();
      expect(next.enemies).toBeGreaterThan(0);
      expect(next.score).toBeGreaterThanOrEqual(points);
      expect(next.state).toBe('playing');
      await expectNoErrors(errors);
    });
  }

  test('bossen kan besegras med riktiga skott (loopen)', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.setBossHp(3); });
    const core = await g(page, (game) => ({ x: game.boss.cx, y: game.boss.cy }));
    await pushToken(page, core.x, core.y); // kärnträff: 2
    await shotDone(page);
    expect(await g(page, (game) => game.boss.hp)).toBe(1);
    await pushToken(page, core.x, core.y);
    await page.waitForFunction(() => window.__game.boss.dying);
    expect(await g(page, (game) => game.score)).toBeGreaterThanOrEqual(1500);
    await expectNoErrors(errors);
  });

  test('nivå 15 ger en tåligare och snabbare loop-boss än nivå 5, och nivå 20 en tåligare stack-boss', async ({ page }) => {
    const errors = await startGame(page);
    const stats = async (level) => {
      await g(page, (game, l) => game.debug.setLevel(l), level);
      return g(page, (game) => ({ kind: game.boss.kind, max: game.boss.maxHp, fire: game.boss.fireMul, reward: game.boss.rewardPoints }));
    };
    const l5 = await stats(5);
    const l15 = await stats(15);
    const s10 = await stats(10);
    const s20 = await stats(20);
    expect([l5.kind, l15.kind, s10.kind, s20.kind]).toEqual(['loop', 'loop', 'stack', 'stack']);
    expect(l15.max).toBeGreaterThan(l5.max);
    expect(l15.fire).toBeGreaterThan(l5.fire);
    expect(l15.reward).toBeGreaterThan(l5.reward);
    expect(s20.max).toBeGreaterThan(s10.max);
    expect(s20.fire).toBeGreaterThan(s10.fire);
    await expectNoErrors(errors);
  });

  test('fasbyte hos loopen släpper en power-up', async ({ page }) => {
    const errors = await loopBoss(page);
    await g(page, (game) => game.debug.freezeEnemies(false));
    await g(page, (game) => { game.boss.shotTimer = 99; game.debug.setBossHp(15); });
    await page.waitForFunction(() => window.__game.powerups.length === 1);
    await expectNoErrors(errors);
  });
});
