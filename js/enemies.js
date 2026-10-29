// Fiendernas rutnät: buggar som rör sig i sidled, sjunker vid kanten och skjuter nedåt
import { WIDTH } from './config.js';
import { levelConfig } from './levels.js';
import { spriteSize, drawSprite } from './sprites.js';
import { range, int, random } from './rng.js';
import { makeErrorBullet } from './projectiles.js';

export const CELL_W = 22;
export const CELL_H = 16;
const DROP = 8;      // pixlar nedåt vid kanten
const MARGIN = 4;
const GLITCH_TIME = 0.5;      // sekunders blinkning innan en race condition flyttar sig
const TELEPORT_WAIT = [3, 7]; // sekunder mellan flyttar

// Fiendetyper: poäng, sprites (två frames) och hur ofta de väljs som skyttar
export const TYPES = {
  syntax: { name: 'Syntaxfel', points: 10, sprites: ['bug0', 'bug1'], shootWeight: 1 },
  nullptr: { name: 'Null-pekare', points: 20, sprites: ['null0', 'null1'], shootWeight: 3 },
  leak: { name: 'Minnesläcka', points: 30, sprites: ['leak0', 'leak1'], shootWeight: 1 },
  race: { name: 'Race condition', points: 40, sprites: ['race0', 'race1'], shootWeight: 1 },
  leakSmall: { name: 'Liten läcka', points: 15, sprites: ['leakS0', 'leakS1'], shootWeight: 1 },
};
export const BUG_POINTS = TYPES.syntax.points;

export class EnemyGrid {
  constructor(level) {
    this.cfg = levelConfig(level);
    const { cols, startY, rowTypes } = this.cfg;
    const { w } = spriteSize('bug0');
    this.startX = Math.round((WIDTH - ((cols - 1) * CELL_W + w)) / 2);
    this.startY = startY;
    this.offX = 0; // hur långt rutnätet har flyttats från startpositionen
    this.offY = 0;
    this.enemies = [];
    rowTypes.forEach((type, r) => {
      for (let c = 0; c < cols; c++) this.enemies.push(this.makeEnemy(type, c, r));
    });
    this.total = this.enemies.length;
    this.dir = 1;
    this.frozen = false;
    this.anim = 0;
    this.shootTimer = range(this.cfg.shootMin, this.cfg.shootMax);
  }

  // Övre vänstra hörnet för en ruta i rutnätet
  cellPos(col, row) {
    return { x: this.startX + this.offX + col * CELL_W, y: this.startY + this.offY + row * CELL_H };
  }

  makeEnemy(type, col, row) {
    const { w, h } = spriteSize(TYPES[type].sprites[0]);
    const e = { type, col, row, w, h, points: TYPES[type].points, ...this.cellPos(col, row) };
    if (type === 'race') {
      e.tp = range(...TELEPORT_WAIT); // tid kvar till nästa flytt
      e.glitch = 0;                   // > 0 under blinkningen
    }
    return e;
  }

  // Lägger en fiende i en ruta (ersätter ev. fiende där). Används av testkrokar.
  place(type, col, row) {
    this.enemies = this.enemies.filter((e) => !(e.col === col && e.row === row));
    const e = this.makeEnemy(type, col, row);
    this.enemies.push(e);
    this.total = Math.max(this.total, this.enemies.length);
    return e;
  }

  // Hastigheten ökar när färre fiender återstår
  get speed() {
    const missing = Math.max(0, 1 - this.enemies.length / this.total);
    return this.cfg.baseSpeed * (1 + 2.2 * missing);
  }

  shift(dx, dy) {
    this.offX += dx;
    this.offY += dy;
    for (const e of this.enemies) {
      e.x += dx;
      e.y += dy;
    }
  }

  // Lägsta fiendens undre kant
  get bottom() {
    return this.enemies.reduce((m, e) => Math.max(m, e.y + e.h), 0);
  }

  // Bara den nedersta fienden i varje kolumn kan skjuta
  shooters() {
    const byCol = new Map();
    for (const e of this.enemies) {
      const cur = byCol.get(e.col);
      if (!cur || e.y > cur.y) byCol.set(e.col, e);
    }
    return [...byCol.values()];
  }

  // Slumpar en skytt, viktat så att null-pekare skjuter oftare
  pickShooter() {
    const shooters = this.shooters();
    const total = shooters.reduce((n, e) => n + TYPES[e.type].shootWeight, 0);
    let r = random() * total;
    for (const s of shooters) {
      r -= TYPES[s.type].shootWeight;
      if (r < 0) return s;
    }
    return shooters[shooters.length - 1];
  }

  // En bugg träffas. Returnerar poängen. Minnesläckor delar sig i två små.
  hit(e) {
    this.enemies = this.enemies.filter((x) => x !== e);
    if (e.type === 'leak') {
      const { w, h } = spriteSize('leakS0');
      for (const x of [e.x - 3, e.x + e.w - 4]) {
        this.enemies.push({ type: 'leakSmall', col: e.col, row: e.row, w, h, points: TYPES.leakSmall.points, x, y: e.y + 2 });
      }
      this.total += 1;
    }
    return e.points;
  }

  // Race condition byter plats med en annan bugg eller hoppar till en tom ruta
  teleport(e) {
    const cells = [];
    for (let r = 0; r < this.cfg.rows; r++) {
      for (let c = 0; c < this.cfg.cols; c++) {
        if (!this.enemies.some((o) => o.col === c && o.row === r)) cells.push({ c, r });
      }
    }
    const others = this.enemies.filter((o) => o !== e && o.type !== 'leakSmall');
    const useEmpty = cells.length > 0 && (others.length === 0 || random() < 0.5);
    if (useEmpty) {
      const t = cells[int(cells.length)];
      Object.assign(e, { col: t.c, row: t.r }, this.cellPos(t.c, t.r));
    } else if (others.length > 0) {
      const o = others[int(others.length)];
      const keep = { col: e.col, row: e.row, x: e.x, y: e.y };
      Object.assign(e, { col: o.col, row: o.row, x: o.x, y: o.y });
      Object.assign(o, keep);
    }
  }

  updateRace(dt) {
    for (const e of [...this.enemies]) {
      if (e.type !== 'race') continue;
      if (e.glitch > 0) {
        e.glitch -= dt;
        if (e.glitch <= 0) {
          e.glitch = 0;
          e.tp = range(...TELEPORT_WAIT);
          this.teleport(e);
        }
      } else {
        e.tp -= dt;
        if (e.tp <= 0) e.glitch = GLITCH_TIME;
      }
    }
  }

  // Flyttar rutnätet, och lägger ev. ett nytt fiendeskott i enemyBullets
  update(dt, enemyBullets) {
    if (this.frozen || this.enemies.length === 0) return;
    this.anim += dt * (this.speed / 22);

    this.shift(this.dir * this.speed * dt, 0);
    const minX = Math.min(...this.enemies.map((e) => e.x));
    const maxX = Math.max(...this.enemies.map((e) => e.x + e.w));
    if (this.dir > 0 && maxX > WIDTH - MARGIN) {
      this.shift(WIDTH - MARGIN - maxX, DROP);
      this.dir = -1;
    } else if (this.dir < 0 && minX < MARGIN) {
      this.shift(MARGIN - minX, DROP);
      this.dir = 1;
    }

    this.updateRace(dt);

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = range(this.cfg.shootMin, this.cfg.shootMax);
      if (enemyBullets.length < this.cfg.maxEnemyBullets) {
        const s = this.pickShooter();
        enemyBullets.push(makeErrorBullet(s.x + s.w / 2, s.y + s.h, this.cfg.bulletSpeed));
      }
    }
  }

  spriteName(e) {
    return TYPES[e.type].sprites[Math.floor(this.anim * 2) % 2];
  }

  render(ctx) {
    for (const e of this.enemies) {
      let dx = 0;
      if (e.glitch > 0) {
        const step = Math.floor(e.glitch / 0.05);
        if (step % 2 === 0) continue; // blinkar
        dx = step % 4 === 1 ? -2 : 2;  // och hoppar i sidled
      }
      drawSprite(ctx, this.spriteName(e), e.x + dx, e.y);
    }
  }
}
