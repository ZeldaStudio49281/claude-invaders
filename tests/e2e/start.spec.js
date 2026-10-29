// Startskärmen
import { test, expect } from '@playwright/test';
import { openGame, state, press, canvasColorCount, expectNoErrors } from './helpers.js';

test.describe('Startskärmen', () => {
  test('laddar utan fel och visar menyn', async ({ page }) => {
    const errors = await openGame(page);

    await expect(page).toHaveTitle('Buggjakten');
    expect(await state(page)).toBe('menu');

    // Canvasen har fast intern upplösning
    const canvas = page.locator('canvas#game');
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((c) => [c.width, c.height])).toEqual([320, 240]);

    // Menyn har ritat text i flera färger, inte bara bakgrunden
    expect(await canvasColorCount(page)).toBeGreaterThan(3);

    await expectNoErrors(errors);
  });

  test('canvasen skalas med ett heltal och centreras', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openGame(page);
    const box = await page.locator('canvas#game').boundingBox();
    // 1000/320 = 3,1 och 800/240 = 3,3, alltså skala 3
    expect(box.width).toBe(960);
    expect(box.height).toBe(720);
    expect(Math.round(box.x)).toBe(20);
    expect(Math.round(box.y)).toBe(40);
  });

  test('mellanslag startar spelet', async ({ page }) => {
    const errors = await openGame(page);
    await press(page, 'Space');
    expect(await state(page)).toBe('playing');
    await expectNoErrors(errors);
  });

  test('sidan scrollar inte när man trycker på speltangenter', async ({ page }) => {
    await openGame(page);
    await press(page, 'Space');
    await press(page, 'ArrowDown');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
