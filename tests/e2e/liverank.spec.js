// Live-placering på topplistan under match: HUD-text och splash vid ny, bättre placering
import { test, expect } from '@playwright/test';
import { startGame, press, frames, g, expectNoErrors } from './helpers.js';

const FULL = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

// Startar en match med fryst fiende och given topplista (poäng i fallande ordning)
async function setup(page, scores) {
  const errors = await startGame(page);
  await g(page, (game, list) => {
    game.debug.freezeEnemies(true);
    game.debug.clearEnemyBullets();
    game.debug.clearHighscores();
    list.forEach((s, i) => game.debug.addHighscore(`P${i}`, s, 1));
  }, scores);
  return errors;
}

// Sätter poängen och kör en uppdatering med dt sekunder. Returnerar [placering, splash].
const score = (page, n, dt = 1 / 60) => g(page, (game, a) => {
  game.score = a.n;
  game.update(a.dt);
  return [game.liveRank, game.rankSplash && { ...game.rankSplash }];
}, { n, dt });

// Stegar update(dt) n gånger och returnerar splashen
const step = (page, n, dt) => g(page, (game, a) => {
  for (let i = 0; i < a.n; i++) game.update(a.dt);
  return game.rankSplash && { ...game.rankSplash };
}, { n, dt });

const up = (s) => s.text.toUpperCase();

test.describe('Live-placering', () => {
  test('ingen placering när poängen inte räcker, och inte vid poäng 0', async ({ page }) => {
    const errors = await setup(page, FULL);
    expect(await score(page, 0)).toEqual([null, null]);
    expect(await score(page, 100)).toEqual([null, null]); // lika med sista: kvalar inte
    expect(await score(page, 50)).toEqual([null, null]);
    // Tom lista: poäng 0 kvalar fortfarande inte
    // Nollställ poängen i samma anrop, annars kan en frame däremellan ge 50 poäng plats 1 på den tomma listan
    await g(page, (game) => { game.score = 0; game.debug.clearHighscores(); });
    expect(await score(page, 0)).toEqual([null, null]);
    await expectNoErrors(errors);
  });

  test('rätt placering med delvis fylld lista', async ({ page }) => {
    const errors = await setup(page, [1000, 500, 100]);
    expect((await score(page, 50))[0]).toBe(4);
    expect((await score(page, 100))[0]).toBe(4); // lika poäng hamnar under den gamla
    expect((await score(page, 101))[0]).toBe(3);
    expect((await score(page, 700))[0]).toBe(2);
    expect((await score(page, 2000))[0]).toBe(1);
    await expectNoErrors(errors);
  });

  test('rätt placering med full lista', async ({ page }) => {
    const errors = await setup(page, FULL);
    expect((await score(page, 101))[0]).toBe(10);
    expect((await score(page, 200))[0]).toBe(10); // lika med plats 9: hamnar under
    expect((await score(page, 201))[0]).toBe(9);
    expect((await score(page, 650))[0]).toBe(5);
    expect((await score(page, 5000))[0]).toBe(1);
    await expectNoErrors(errors);
  });

  test('splash när placeringen förbättras, inte när poängen ökar utan ny placering', async ({ page }) => {
    const errors = await setup(page, [1000, 500, 100]);
    const [r1, s1] = await score(page, 50);
    expect(r1).toBe(4);
    expect(up(s1)).toBe('TOPPLISTAN: PLATS 4!');
    expect(await g(page, (game) => game.audio.log.at(-1))).toBe('rank');
    // Mer poäng men samma placering: splashen fortsätter i stället för att startas om
    await step(page, 30, 1 / 60);
    const before = await g(page, (game) => game.rankSplash.t);
    const [r2, s2] = await score(page, 80);
    expect(r2).toBe(4);
    expect(s2.t).toBeGreaterThan(before);
    // Utan aktiv splash ger oförändrad placering ingen ny
    await g(page, (game) => { game.rankSplash = null; });
    expect((await score(page, 90))[1]).toBeNull();
    expect(up((await score(page, 150))[1])).toBe('TOPPLISTAN: PLATS 3!');
    // Sämre poäng och sedan tillbaka till plats 3 ger ingen ny splash
    await g(page, (game) => { game.rankSplash = null; });
    await score(page, 60);
    expect((await score(page, 150))[1]).toBeNull();
    await expectNoErrors(errors);
  });

  test('tätt förbättrade placeringar ersätter splashen och startar om den', async ({ page }) => {
    const errors = await setup(page, FULL);
    await score(page, 150); // plats 10
    await step(page, 20, 1 / 60);
    const old = await g(page, (game) => game.rankSplash.t);
    expect(old).toBeGreaterThan(0.3);
    const [rank, sp] = await score(page, 250); // plats 9
    expect(rank).toBe(9);
    expect(up(sp)).toBe('TOPPLISTAN: PLATS 9!');
    expect(sp.t).toBeLessThan(old);
    const [, sp2] = await score(page, 350); // plats 8
    expect(up(sp2)).toBe('TOPPLISTAN: PLATS 8!');
    expect(sp2.t).toBeLessThan(0.05);
    // Det finns bara en splash (ingen kö): när den gått ut är inget kvar
    expect(await g(page, (game) => Array.isArray(game.rankSplash))).toBe(false);
    await step(page, 4, 0.5);
    expect(await g(page, (game) => game.rankSplash)).toBeNull();
    await expectNoErrors(errors);
  });

  test('NYTT REKORD vid plats 1 om det fanns ett rekord, annars plats 1-texten', async ({ page }) => {
    const errors = await setup(page, [1000, 500]);
    const [rank, sp] = await score(page, 1001);
    expect(rank).toBe(1);
    expect(up(sp)).toBe('NYTT REKORD!');
    expect(sp.record).toBe(true);

    await g(page, (game) => { game.debug.clearHighscores(); game.start(); game.debug.freezeEnemies(true); });
    const [r2, sp2] = await score(page, 10);
    expect(r2).toBe(1);
    expect(up(sp2)).toBe('TOPPLISTAN: PLATS 1!');
    expect(sp2.record).toBe(false);
    await expectNoErrors(errors);
  });

  test('splashen försvinner efter sin tid', async ({ page }) => {
    const errors = await setup(page, [1000]);
    await score(page, 10);
    expect((await step(page, 80, 1 / 60)).t).toBeGreaterThan(1.3); // 1,33 s: kvar
    await step(page, 20, 1 / 60);                                  // totalt 1,67 s
    expect(await g(page, (game) => game.rankSplash)).toBeNull();
    expect(await g(page, (game) => game.liveRank)).toBe(2); // placeringen i HUD:en finns kvar
    await expectNoErrors(errors);
  });

  test('splashen fryser under paus och blockerar inte spelet', async ({ page }) => {
    const errors = await setup(page, [1000]);
    await score(page, 10);
    expect(await g(page, (game) => game.state)).toBe('playing');
    await press(page, 'p');
    expect(await g(page, (game) => game.state)).toBe('paused');
    const t0 = await g(page, (game) => game.rankSplash.t);
    await frames(page, 10);
    await step(page, 120, 1 / 60);
    expect(await g(page, (game) => game.rankSplash.t)).toBe(t0);
    // Poängändring under paus ger ingen ny splash förrän spelet fortsätter
    await g(page, (game) => { game.score = 5000; });
    await frames(page, 3);
    expect(await g(page, (game) => game.rankSplash.t)).toBe(t0);
    await press(page, 'p');
    expect(await g(page, (game) => game.state)).toBe('playing');
    await frames(page, 3);
    expect(await g(page, (game) => game.liveRank)).toBe(1);
    await expectNoErrors(errors);
  });

  test('allt nollställs vid ny match', async ({ page }) => {
    const errors = await setup(page, [1000]);
    await score(page, 10);
    expect(await g(page, (game) => [game.liveRank, game.rankSplash !== null])).toEqual([2, true]);
    await g(page, (game) => { game.start(); });
    expect(await g(page, (game) => [game.liveRank, game.rankSplash, game.score])).toEqual([null, null, 0]);
    // Efter nollställningen ger samma placering en ny splash
    await g(page, (game) => game.debug.freezeEnemies(true));
    expect((await score(page, 10))[1]).not.toBeNull();
    await expectNoErrors(errors);
  });

  test('placeringen i HUD:en stämmer med platsen vid game over', async ({ page }) => {
    const errors = await setup(page, [900, 700, 700, 500, 300]);
    for (const s of [1000, 800, 700, 600, 400, 300, 100]) {
      await g(page, (game) => {
        game.debug.clearHighscores();
        [900, 700, 700, 500, 300].forEach((x, i) => game.debug.addHighscore(`P${i}`, x, 1));
        game.start();
        game.debug.freezeEnemies(true);
      });
      const [rank] = await score(page, s);
      await g(page, (game) => { game.lives = 0; game.update(1 / 60); });
      const st = await g(page, (game) => game.state);
      if (rank === null) {
        expect(st, `poäng ${s}`).toBe('gameover');
      } else {
        expect(st, `poäng ${s}`).toBe('enterName');
        await g(page, (game) => game.confirmName());
        expect(rank, `poäng ${s}`).toBe((await g(page, (game) => game.lastRank)) + 1);
      }
    }
    await expectNoErrors(errors);
  });

  test('skärmdumpar av HUD och splash', async ({ page }) => {
    const errors = await setup(page, FULL);
    await g(page, (game) => game.debug.setContext(3));
    await score(page, 450);
    await g(page, (game) => { game.rankSplash.t = 0.3; });
    await page.waitForTimeout(50);
    await page.locator('#game').screenshot({ path: 'test-results/liverank-splash.png' });
    await g(page, (game) => { game.rankSplash = null; });
    await frames(page, 2);
    await page.locator('#game').screenshot({ path: 'test-results/liverank-hud.png' });
    await expectNoErrors(errors);
  });
});
