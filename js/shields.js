// Testsviter: block av små celler som skott och buggar äter upp. Byggs upp igen varje nivå.
import { WIDTH } from './config.js';
import { PALETTE } from './palette.js';
import { random } from './rng.js';
import { overlaps, sweptRect } from './projectiles.js';

export const CELL = 2;          // pixlar per cell
export const SHIELD_COUNT = 4;
export const SHIELD_Y = 184;    // övre kant, ovanför spelaren
const ERODE = 0.45;             // chans att en granncell följer med vid träff

// Ett terminalfönster: 1 = titelrad (beige), 2 = godkänd test (grön ✓ och streck), 3 = fönstrets bakgrund
const SHAPE = (() => {
  const rows = [
    '111111111111',
    '333333333333',
    '333333333333',
    '333333333333',
    '333333333333',
    '333333333333',
    '333333333333',
    '333333333333',
    '333333333333',
  ].map((r) => [...r]);
  const stamp = (r0, line) => {
    [['..2', '2.2', '.2.']][0].forEach((row, i) => [...row].forEach((ch, j) => { if (ch === '2') rows[r0 + i][1 + j] = '2'; }));
    for (let x = 5; x < 5 + line; x++) rows[r0 + 1][x] = '2';
  };
  stamp(2, 6);
  stamp(6, 4);
  return rows.map((r) => r.join(''));
})();

const COLS = SHAPE[0].length;
const ROWS = SHAPE.length;
export const SHIELD_W = COLS * CELL;
export const SHIELD_H = ROWS * CELL;

export class ShieldSet {
  constructor() {
    this.shields = [];
    for (let i = 0; i < SHIELD_COUNT; i++) {
      const cx = (WIDTH * (i + 0.5)) / SHIELD_COUNT;
      const cells = SHAPE.map((row) => [...row].map(Number));
      this.shields.push({ x: Math.round(cx - SHIELD_W / 2), y: SHIELD_Y, w: SHIELD_W, h: SHIELD_H, cells });
    }
  }

  get cellCount() {
    return this.shields.reduce((n, s) => n + s.cells.reduce((m, row) => m + row.filter((c) => c).length, 0), 0);
  }

  // Cellernas rektanglar som överlappar rect
  cellsIn(s, rect) {
    const out = [];
    const c0 = Math.max(0, Math.floor((rect.x - s.x) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((rect.x + rect.w - 0.001 - s.x) / CELL));
    const r0 = Math.max(0, Math.floor((rect.y - s.y) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((rect.y + rect.h - 0.001 - s.y) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (s.cells[r][c]) out.push({ r, c });
    return out;
  }

  // Skott mot testsviterna. dir: -1 för uppåtgående skott, 1 för nedåtgående. Returnerar true vid träff.
  hitBullet(b, dir) {
    const rect = sweptRect(b);
    for (const s of this.shields) {
      if (!overlaps(rect, s)) continue;
      const hits = this.cellsIn(s, rect);
      if (hits.length === 0) continue;
      // Första cellen skottet når: längst ner för uppåtgående, längst upp för nedåtgående
      const first = hits.reduce((a, h) => (dir < 0 ? (h.r > a.r ? h : a) : (h.r < a.r ? h : a)));
      s.cells[first.r][first.c] = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = first.r + dr;
          const c = first.c + dc;
          if ((dr || dc) && s.cells[r]?.[c] && random() < ERODE) s.cells[r][c] = 0;
        }
      }
      return true;
    }
    return false;
  }

  // Buggar som når blocken äter upp alla celler de överlappar
  eat(rects) {
    for (const s of this.shields) {
      for (const rect of rects) {
        if (!overlaps(rect, s)) continue;
        for (const { r, c } of this.cellsIn(s, rect)) s.cells[r][c] = 0;
      }
    }
  }

  render(ctx) {
    for (const s of this.shields) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = s.cells[r][c];
          if (!v) continue;
          ctx.fillStyle = v === 1 ? PALETTE.beige : v === 2 ? PALETTE.pass : PALETTE.muted;
          ctx.fillRect(s.x + c * CELL, s.y + r * CELL, CELL, CELL);
        }
      }
    }
  }
}
