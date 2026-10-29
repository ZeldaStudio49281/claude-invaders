// Highscore (Fas 6): topplista i localStorage, namninmatning och visning
import { test, expect } from '@playwright/test';
import { openGame, startGame, press, frames, g, expectNoErrors } from './helpers.js';

const KEY = 'buggjakten.highscores';
const AMBER = [0xf2, 0xb0, 0x4a];

// Avslutar matchen med given poäng (fienderna fryses så att inget annat händer)
async function dieWith(page, score, level = 2) {
  await g(page, (game, a) => {
    game.debug.freezeEnemies(true);
    game.debug.clearEnemyBullets();
    game.score = a.score;
    game.level = a.level;
    game.lives = 0;
  }, { score, level });
}

const waitState = (page, s) => page.waitForFunction((x) => window.__game.state === x, s);
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const names = (page) => g(page, (game) => game.scores.map((e) => e.name));
const entry = (page) => g(page, (game) => ({ ...game.nameEntry }));

// Skickar en tangenttryckning med given key (för tecken som Playwright inte kan trycka)
async function typeKey(page, key, code) {
  await page.evaluate(([k, c]) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: c, bubbles: true }));
  }, [key, code]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Antal pixlar i en viss färg inom ett rektangulärt område av canvasen
const colorCount = (page, rect, rgb) => page.evaluate(([r, c]) => {
  const cv = document.getElementById('game');
  const d = cv.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) n++;
  return n;
}, [rect, rgb]);

test.describe('Topplista och lagring', () => {
  test('sparas, sorteras, har högst 10 poster och laddas efter omladdning', async ({ page }) => {
    const errors = await openGame(page);
    await g(page, (game) => {
      game.debug.clearHighscores();
      [300, 900, 100, 500, 700, 200, 800, 400, 600, 1000, 50, 1100].forEach((s, i) => game.debug.addHighscore(`P${i}`, s, i + 1));
    });
    const expected = [1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200];
    expect(await g(page, (game) => game.scores.map((e) => e.score))).toEqual(expected);
    expect((await stored(page)).map((e) => e.score)).toEqual(expected);

    await page.reload();
    await page.waitForFunction(() => window.__game !== undefined);
    expect(await g(page, (game) => game.scores.map((e) => e.score))).toEqual(expected);
    const first = await g(page, (game) => game.scores[0]);
    expect(first).toMatchObject({ name: 'P11', score: 1100, level: 12 });
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await g(page, (game) => game.highScore)).toBe(1100);

    await g(page, (game) => game.debug.clearHighscores());
    expect(await stored(page)).toBeNull();
    expect(await g(page, (game) => [game.scores.length, game.highScore])).toEqual([0, 0]);
    await expectNoErrors(errors);
  });

  for (const [name, raw] of [
    ['trasig JSON', '{inte json'],
    ['JSON som inte är en lista', '{"a":1}'],
    ['tom sträng', ''],
  ]) {
    test(`korrupt data (${name}) kraschar inte och ger en tom lista`, async ({ page }) => {
      await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, raw]);
      const errors = await openGame(page);
      expect(await g(page, (game) => game.scores)).toEqual([]);
      expect(await g(page, (game) => game.highScore)).toBe(0);
      // Spelet går att spela och spara en post ovanpå den trasiga datan
      await press(page, 'Space');
      await dieWith(page, 100);
      await waitState(page, 'enterName');
      await press(page, 'Enter');
      await waitState(page, 'gameover');
      expect((await stored(page)).length).toBe(1);
      await expectNoErrors(errors);
    });
  }

  test('ogiltiga poster i listan filtreras bort och resten städas', async ({ page }) => {
    const bad = JSON.stringify([null, 5, { name: 'X', score: 'hej' }, { score: -3 }, { name: 'abcdef', score: 50, level: 2 }, { name: 7, score: 70 }]);
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, bad]);
    const errors = await openGame(page);
    expect(await g(page, (game) => game.scores.map((e) => [e.name, e.score, e.level]))).toEqual([
      ['   ', 70, 1],
      ['ABC', 50, 2],
    ]);
    await expectNoErrors(errors);
  });

  test('localStorage som kastar kraschar inte, och listan finns kvar under sessionen', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function setItem() { throw new Error('QuotaExceeded'); };
    });
    const errors = await openGame(page);
    await press(page, 'Space');
    await dieWith(page, 450, 3);
    await waitState(page, 'enterName');
    await press(page, 'KeyZ');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    expect(await g(page, (game) => game.scores.map((e) => [e.name, e.score]))).toEqual([['ZAA', 450]]);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    // En ny match använder den sparade listan i minnet
    await press(page, 'Space');
    await waitState(page, 'playing');
    expect(await g(page, (game) => game.highScore)).toBe(450);
    await expectNoErrors(errors);
  });

  test('localStorage där getItem kastar ger en tom lista', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = function getItem() { throw new Error('SecurityError'); };
    });
    const errors = await openGame(page);
    expect(await g(page, (game) => game.scores)).toEqual([]);
    await press(page, 'Space');
    await expectNoErrors(errors);
  });

  test('REKORD i HUD:en visar högsta sparade poäng', async ({ page }) => {
    const errors = await openGame(page);
    await g(page, (game) => game.debug.addHighscore('AAA', 5000));
    await page.reload();
    await page.waitForFunction(() => window.__game !== undefined);
    await press(page, 'Space');
    await waitState(page, 'playing');
    await g(page, (game) => { game.debug.freezeEnemies(true); game.debug.setLives(99); game.debug.clearEnemyBullets(); });
    await frames(page, 3);
    // Jämför HUD-pixlarna med en referens ritad med samma typsnitt
    const same = await page.evaluate(async () => {
      const { drawText } = await import('/js/font.js');
      const { PALETTE } = await import('/js/palette.js');
      const cv = document.getElementById('game');
      const R = { x: 90, y: 0, w: 100, h: 14 };
      const ref = document.createElement('canvas');
      ref.width = 320;
      ref.height = 240;
      const c = ref.getContext('2d');
      c.fillStyle = PALETTE.bg;
      c.fillRect(0, 0, 320, 240);
      drawText(c, 'Rekord: 5000', 92, 5, { color: PALETTE.beige });
      const a = cv.getContext('2d').getImageData(R.x, R.y, R.w, R.h).data;
      const b = c.getImageData(R.x, R.y, R.w, R.h).data;
      return a.every((v, i) => v === b[i]);
    });
    expect(same).toBe(true);
    await expectNoErrors(errors);
  });
});

test.describe('Namninmatning', () => {
  test('nytt rekord ger enterName, initialer väljs med pilar och skrivs direkt, Enter sparar', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { game.debug.clearHighscores(); game.debug.addHighscore('ZZZ', 9000); });
    await dieWith(page, 1234, 3);
    await waitState(page, 'enterName');
    expect(await entry(page)).toEqual({ name: 'AAA', pos: 0 });

    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    expect((await entry(page)).name).toBe('CAA');
    await press(page, 'ArrowDown');
    expect((await entry(page)).name).toBe('BAA');
    await press(page, 'ArrowRight');
    expect((await entry(page)).pos).toBe(1);
    await press(page, 'k'); // direkt inmatning skriver och flyttar fram
    expect(await entry(page)).toEqual({ name: 'BKA', pos: 2 });
    await press(page, 'x');
    expect(await entry(page)).toEqual({ name: 'BKX', pos: 2 });
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await press(page, 'Digit7');
    expect((await entry(page)).name).toBe('7KX');
    await press(page, 'Backspace');
    await press(page, 'q');
    expect((await entry(page)).name).toBe('QKX');

    await press(page, 'Enter');
    await waitState(page, 'gameover');
    expect(await g(page, (game) => game.nameEntry)).toBeNull();
    expect(await g(page, (game) => game.lastRank)).toBe(1);
    expect(await names(page)).toEqual(['ZZZ', 'QKX']);
    expect(await stored(page)).toMatchObject([{ name: 'ZZZ', score: 9000 }, { name: 'QKX', score: 1234, level: 3 }]);

    // Den nya placeringen markeras med gult, övriga rader inte
    await frames(page, 2);
    const band = (rank) => ({ x: 60, y: 85 + 9 * rank, w: 200, h: 9 });
    expect(await colorCount(page, band(1), AMBER)).toBeGreaterThan(10);
    expect(await colorCount(page, band(0), AMBER)).toBe(0);

    // Senast använda namn föreslås nästa gång
    await press(page, 'Space');
    await waitState(page, 'playing');
    await dieWith(page, 50);
    await waitState(page, 'enterName');
    expect((await entry(page)).name).toBe('QKX');
    await expectNoErrors(errors);
  });

  test('listan visar namnet efter omladdning', async ({ page }) => {
    const errors = await startGame(page);
    await dieWith(page, 777);
    await waitState(page, 'enterName');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    await page.reload();
    await page.waitForFunction(() => window.__game !== undefined);
    expect(await names(page)).toEqual(['ABA']);
    await g(page, (game) => { game.menuT = 5; }); // topplistepanelen
    expect(await g(page, (game) => game.menuView)).toBe('scores');
    await expectNoErrors(errors);
  });

  test('mellanslag bekräftar, och en knapp som hålls nere vid game over slår inte igenom', async ({ page }) => {
    const errors = await startGame(page);
    await page.keyboard.down('Space'); // hålls nere när matchen tar slut
    await dieWith(page, 300);
    await waitState(page, 'enterName');
    await frames(page, 6);
    expect(await g(page, (game) => game.state)).toBe('enterName');
    await page.keyboard.up('Space');
    await frames(page, 3);
    expect(await g(page, (game) => game.state)).toBe('enterName');
    await press(page, 'Space');
    expect(await g(page, (game) => game.state)).toBe('gameover');
    await expectNoErrors(errors);
  });

  test('bokstäverna W, S, A, D och M skrivs och styr inte markören eller ljudet', async ({ page }) => {
    const errors = await startGame(page);
    await dieWith(page, 300);
    await waitState(page, 'enterName');
    const muted = await g(page, (game) => game.muted);
    await press(page, 'w');
    await press(page, 's');
    await press(page, 'a');
    expect(await entry(page)).toEqual({ name: 'WSA', pos: 2 });
    await press(page, 'd');
    await press(page, 'm');
    expect(await entry(page)).toEqual({ name: 'WSM', pos: 2 });
    expect(await g(page, (game) => game.muted)).toBe(muted);
    await expectNoErrors(errors);
  });

  test('Å, Ä och Ö fungerar i namn', async ({ page }) => {
    const errors = await startGame(page);
    await dieWith(page, 300);
    await waitState(page, 'enterName');
    // Playwrights tangentbord saknar Å, Ä och Ö, så vi skickar riktiga tangenthändelser själva
    await typeKey(page, 'Å', 'BracketLeft');
    await typeKey(page, 'ä', 'Quote'); // gemener blir versaler
    await typeKey(page, 'Ö', 'Semicolon');
    expect((await entry(page)).name).toBe('ÅÄÖ');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    await page.reload();
    await page.waitForFunction(() => window.__game !== undefined);
    expect(await names(page)).toEqual(['ÅÄÖ']);
    // Tecknen går också att nå med pilarna
    const chars = await page.evaluate(async () => (await import('/js/highscore.js')).NAME_CHARS);
    for (const c of 'ÅÄÖ') expect(chars).toContain(c);
    await expectNoErrors(errors);
  });

  test('pil ned från A ger mellanslag, och ett tomt namn sparas som streck', async ({ page }) => {
    const errors = await startGame(page);
    await dieWith(page, 300);
    await waitState(page, 'enterName');
    for (let i = 0; i < 3; i++) {
      await press(page, 'ArrowDown');
      await press(page, 'ArrowRight');
    }
    expect((await entry(page)).name).toBe('   ');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    expect(await names(page)).toEqual(['---']);
    await expectNoErrors(errors);
  });

  test('poäng som inte kvalar in går direkt till gameover', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => { for (let i = 0; i < 10; i++) game.debug.addHighscore('TOP', 1000 + i); });
    await dieWith(page, 999);
    await waitState(page, 'gameover');
    expect(await g(page, (game) => [game.nameEntry, game.lastRank, game.scores.length])).toEqual([null, -1, 10]);

    // Poäng 0 kvalar aldrig in, inte ens på en tom lista
    await g(page, (game) => game.debug.clearHighscores());
    await press(page, 'Space');
    await waitState(page, 'playing');
    await dieWith(page, 0);
    await waitState(page, 'gameover');
    expect(await g(page, (game) => game.scores)).toEqual([]);

    // Men en poäng över sista platsen kvalar in och trycker bort den sista
    await g(page, (game) => { for (let i = 0; i < 10; i++) game.debug.addHighscore('TOP', 1000 + i); });
    await press(page, 'Space');
    await waitState(page, 'playing');
    await dieWith(page, 1005);
    await waitState(page, 'enterName');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    const list = await g(page, (game) => game.scores.map((e) => e.score));
    expect(list.length).toBe(10);
    expect(list).not.toContain(1000);
    expect(list.filter((s) => s === 1005).length).toBe(2);
    await expectNoErrors(errors);
  });

  test('vid lika poäng hamnar den nya under den gamla', async ({ page }) => {
    const errors = await startGame(page);
    await g(page, (game) => game.debug.addHighscore('OLD', 500));
    await dieWith(page, 500);
    await waitState(page, 'enterName');
    await press(page, 'Enter');
    await waitState(page, 'gameover');
    expect(await names(page)).toEqual(['OLD', 'AAA']);
    expect(await g(page, (game) => game.lastRank)).toBe(1);
    await expectNoErrors(errors);
  });
});

test.describe('Topplistan i menyn', () => {
  test('menyn växlar mellan kontroller och topplista, men visar bara kontroller utan poster', async ({ page }) => {
    const errors = await openGame(page);
    await g(page, (game) => { game.menuT = 5; });
    expect(await g(page, (game) => game.menuView)).toBe('controls');
    await g(page, (game) => {
      ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ'].forEach((n, i) => game.debug.addHighscore(n, 10000 - i * 700, i + 1));
      game.menuT = 1;
    });
    expect(await g(page, (game) => game.menuView)).toBe('controls');
    await g(page, (game) => { game.menuT = 5; });
    expect(await g(page, (game) => game.menuView)).toBe('scores');
    await frames(page, 2);
    await page.screenshot({ path: 'test-results/fas6-menu-scores.png' });
    await expectNoErrors(errors);
  });

  test('skärmdump av namninmatningen', async ({ page }) => {
    const errors = await startGame(page);
    await dieWith(page, 4200, 4);
    await waitState(page, 'enterName');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await typeKey(page, 'ö', 'Semicolon');
    await page.screenshot({ path: 'test-results/fas6-name.png' });
    await expectNoErrors(errors);
  });
});
