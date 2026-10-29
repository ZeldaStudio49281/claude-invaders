// Gemensamma hjälpfunktioner för e2e-testerna
import { expect } from '@playwright/test';

// Öppnar spelet, samlar konsolfel och väntar tills spel-loopen kör
export async function openGame(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  // Låt några frames gå så att första render har skett
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return errors;
}

export function state(page) {
  return page.evaluate(() => window.__game.state);
}

// Trycker en tangent och väntar ett par frames så att update() hinner läsa den
export async function press(page, key) {
  // Kom ihåg antalet avfyrade skott så att shotDone() vet vilket skott det väntar på
  await page.evaluate(() => { window.__shotsBefore = window.__game.shotsFired; });
  await page.keyboard.press(key);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// Antal unika färger i canvasen, ett enkelt mått på att något har ritats
export function canvasColorCount(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return colors.size;
  });
}

export async function expectNoErrors(errors) {
  expect(errors, `Konsolfel:\n${errors.join('\n')}`).toEqual([]);
}

// Väntar tills spel-loopen har kört minst n update-anrop till
export async function frames(page, n = 2) {
  const target = (await page.evaluate(() => window.__game.frames)) + n;
  await page.waitForFunction((t) => window.__game.frames >= t, target);
}

// Öppnar spelet och startar en match. Fienderna fryses inte, men slumpen seedas.
export async function startGame(page, seed = 1) {
  const errors = await openGame(page);
  await page.evaluate((s) => window.__game.debug.seed(s), seed);
  await press(page, 'Space');
  await page.waitForFunction(() => window.__game.state === 'playing');
  return errors;
}

// Kör ett uttryck mot spelet: g(page, (game) => game.score)
export function g(page, fn, arg) {
  return page.evaluate(`(${fn.toString()})(window.__game, ${JSON.stringify(arg)})`);
}

// Väntar tills alla spelarskott är förbrukade. Med fired=true väntar den först på att skottet från senaste press() har skapats
// (annars kan "inga skott" vara sant bara för att tangenttrycket ännu inte nått spelet i långsamma webbläsare).
export async function shotDone(page, fired = false) {
  if (fired) await page.waitForFunction(() => window.__game.shotsFired > window.__shotsBefore);
  else await frames(page, 2);
  await page.waitForFunction(() => window.__game.bullets.length === 0);
}
