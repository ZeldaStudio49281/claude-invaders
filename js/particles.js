// Pixelpartiklar: små färgade rutor som flyger iväg och bleknar. Bara kosmetik.
// Egen slumpgenerator (inte rng.js) så att effekterna aldrig påverkar den seedade speldynamiken.
import { PALETTE } from './palette.js';

export const MAX_PARTICLES = 400; // tak: nya partiklar ignoreras när poolen är full

let cosmetic = 0x1234abcd;
export function cosmeticRandom() {
  cosmetic = (cosmetic + 0x6d2b79f5) >>> 0;
  let t = cosmetic;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + cosmeticRandom() * (b - a);

// Buggarnas färger (ur deras sprites)
const BUG_COLORS = {
  syntax: [PALETTE.bug, PALETTE.bugDark, PALETTE.amber],
  nullptr: [PALETTE.accent, PALETTE.accentDark, PALETTE.cream],
  leak: [PALETTE.amber, PALETTE.beige, PALETTE.accent],
  leakSmall: [PALETTE.amber, PALETTE.beige],
  race: [PALETTE.cream, PALETTE.accent],
  heis: [PALETTE.beige, PALETTE.cream],
};

export class Particles {
  constructor() {
    this.list = [];
  }

  get count() {
    return this.list.length;
  }

  clear() {
    this.list = [];
  }

  // Sprider n partiklar från (x, y). opts: speed, life, gravity, size, up (extra uppåtfart), spreadX, spreadY
  burst(x, y, colors, n, opts = {}) {
    const { speed = 60, life = 0.5, gravity = 120, size = 1, up = 0, spreadX = 0, spreadY = 0 } = opts;
    for (let i = 0; i < n && this.list.length < MAX_PARTICLES; i++) {
      const a = cosmeticRandom() * Math.PI * 2;
      const v = speed * (0.35 + 0.65 * cosmeticRandom());
      const l = life * between(0.6, 1.2);
      this.list.push({
        x: x + between(-spreadX, spreadX),
        y: y + between(-spreadY, spreadY),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - up,
        g: gravity,
        life: l,
        max: l,
        size: cosmeticRandom() < 0.3 ? size + 1 : size,
        color: colors[Math.floor(cosmeticRandom() * colors.length)],
      });
    }
  }

  // En bugg dör: pixlar i buggens färger
  bugDeath(x, y, type) {
    this.burst(x, y, BUG_COLORS[type] ?? BUG_COLORS.syntax, type === 'leak' ? 18 : 12, { speed: 70, life: 0.55 });
  }

  // Gnistor när något träffar en testsvit eller en boss
  sparks(x, y, colors = [PALETTE.beige, PALETTE.pass, PALETTE.cream]) {
    this.burst(x, y, colors, 6, { speed: 55, life: 0.3, gravity: 140, up: 25 });
  }

  // Stor explosion över rektanglar (bossens delar) eller en punkt
  explosion(rects, extra = 0) {
    for (const r of rects) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      this.burst(cx, cy, [r.color, PALETTE.amber, PALETTE.cream, PALETTE.bug], 8 + extra, {
        speed: 110, life: 0.9, size: 1, spreadX: r.w / 3, spreadY: r.h / 3,
      });
    }
  }

  // Ringformad glitter när spelaren plockar upp något
  pickup(x, y) {
    this.burst(x, y, [PALETTE.amber, PALETTE.cream, PALETTE.accent], 14, { speed: 50, life: 0.6, gravity: -30, up: 20 });
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  render(ctx) {
    for (const p of this.list) {
      // Sista tredjedelen blinkar bort (inga halvgenomskinliga pixlar)
      if (p.life < p.max * 0.35 && Math.floor(p.life * 30) % 2 === 0) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
}
