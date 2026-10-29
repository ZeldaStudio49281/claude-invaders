// Skott och kollisioner
import { WIDTH, HEIGHT } from './config.js';
import { drawSpriteIn } from './sprites.js';

// AABB-test: {x, y, w, h} (övre vänstra hörnet)
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const TOKEN_SPEED = 220; // px/s uppåt
export const ERROR_SPEED = 75;  // px/s nedåt

export class Bullet {
  // sprites: lista med sprite-namn som växlar (animation)
  constructor(x, y, vy, w, h, sprites) {
    Object.assign(this, { x, y, px: x, py: y, vx: 0, vy, w, h, sprites, age: 0 });
  }

  update(dt) {
    this.px = this.x; // föregående position, för svepande kollision
    this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.age += dt;
  }

  get offscreen() {
    return this.y + this.h < 0 || this.y > HEIGHT || this.x + this.w < 0 || this.x > WIDTH;
  }

  render(ctx) {
    const name = this.sprites[Math.floor(this.age / 0.15) % this.sprites.length];
    drawSpriteIn(ctx, name, this);
  }
}

// Spelarens token (3x6), x/y = övre vänstra hörnet
export function makeToken(x, y, vx = 0) {
  const b = new Bullet(x, y, -TOKEN_SPEED, 3, 6, ['token']);
  b.vx = vx;
  return b;
}

// Fiendens felmeddelande, centrerat på x
export function makeErrorBullet(cx, y, speed = ERROR_SPEED) {
  return new Bullet(cx - 1.5, y, speed, 3, 6, ['err0', 'err1']);
}

// Rektangel som täcker skottets väg sedan förra framen (hindrar att skott tunnlar igenom tunna mål)
export function sweptRect(b) {
  const top = Math.min(b.y, b.py);
  const bottom = Math.max(b.y, b.py) + b.h;
  const left = Math.min(b.x, b.px);
  const right = Math.max(b.x, b.px) + b.w;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// Spelarens genomträngande skott (Kodgranskning): stoppas inte av första träffen.
// vx > 0 ger ett snett skott (trippelskottets solfjäder).
export function makePiercingToken(x, y, vx = 0) {
  const b = new Bullet(x, y, -TOKEN_SPEED, 3, 6, ['tokenP']);
  b.vx = vx;
  b.pierce = true;
  b.seen = new Set(); // mål som skottet redan har träffat
  return b;
}

// Boss-skott: runda orbs eller felmeddelanden med valfri riktning, centrerade på (cx, cy)
export function makeAimedBullet(cx, cy, vx, vy, sprites = ['orb0', 'orb1']) {
  const size = sprites[0] === 'orb0' ? 4 : 3;
  const h = sprites[0] === 'orb0' ? 4 : 6;
  const b = new Bullet(cx - size / 2, cy - h / 2, vy, size, h, sprites);
  b.vx = vx;
  return b;
}
