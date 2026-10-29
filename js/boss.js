// Bossar: Den oändliga loopen (nivå 5, 15, ...) och Stack Overflow-monstret (nivå 10, 20, ...)
import { WIDTH, HEIGHT, HUD_H, PLAYER_Y } from './config.js';
import { PALETTE } from './palette.js';
import { STR } from './strings.js';
import { drawText, textWidth } from './font.js';
import { drawSprite, getSprite } from './sprites.js';
import { makeAimedBullet, sweptRect } from './projectiles.js';
import { levelConfig } from './levels.js';
import * as rng from './rng.js';

const SHAKE_TIME = 0.5;    // sekunder bossen skakar innan den faller sönder
const DEATH_TIME = 2.4;    // total tid för dödsanimationen
const GRAVITY = 150;

// Cirkel mot rektangel (för skott mot runda mål)
export function rectCircle(r, cx, cy, rad) {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return (nx - cx) ** 2 + (ny - cy) ** 2 <= rad * rad;
}

function playerCenter(player) {
  return { x: player.x + player.w / 2, y: player.y + player.h / 2 };
}

class BossBase {
  constructor(kind, level) {
    this.kind = kind;
    this.level = level;
    this.cycle = levelConfig(level).cycle;
    this.name = STR.boss[kind];
    this.hpMul = 1 + 0.5 * this.cycle;        // tåligare för varje varv
    this.fireMul = 1 + 0.2 * this.cycle;      // skjuter snabbare för varje varv
    this.age = 0;
    this.dying = false;
    this.dyingT = 0;
    this.done = false;
    this.reward = 0;
    this.debris = [];
    this.events = [];      // t.ex. { kind: 'drop', x, y, chance } som game.js tar hand om
  }

  get hp() { return this._hp; }
  set hp(v) { this._hp = v; }

  // 1, 2 eller 3 beroende på kvarvarande liv (över 2/3, över 1/3, därunder)
  get phase() {
    const f = this.hp / this.maxHp;
    return f > 2 / 3 ? 1 : f > 1 / 3 ? 2 : 3;
  }

  get solid() { return !this.dying && !this.done; }

  setHp(n) {
    this.hp = Math.max(0, Math.round(n));
    if (this.hp <= 0 && !this.dying) this.defeat();
  }

  damage(n = 1) {
    if (!this.solid) return;
    this.setHp(this.hp - n);
  }

  defeat() {
    this.dying = true;
    this.dyingT = 0;
    this.shattered = false;
    this.reward = this.rewardPoints;
    this.rewardPending = true;
  }

  // Poäng för bossens död, hämtas en gång av game.js
  takeReward() {
    if (!this.rewardPending) return 0;
    this.rewardPending = false;
    return this.reward;
  }

  takeEvents() {
    return this.events.splice(0);
  }

  update(dt, bullets, player) {
    this.age += dt;
    this.updateDebris(dt);
    if (this.dying) {
      this.dyingT += dt;
      if (!this.shattered && this.dyingT >= SHAKE_TIME) {
        this.shattered = true;
        this.shatter(this.pieces(), 4);
      }
      if (this.dyingT >= DEATH_TIME) this.done = true;
      return;
    }
    this.tick(dt, bullets, player);
  }

  // Förvandlar rektanglar till små pixelbitar som faller
  shatter(rects, step = 3, spread = 1) {
    for (const r of rects) {
      for (let y = 0; y < r.h; y += step) {
        for (let x = 0; x < r.w; x += step) {
          const px = r.x + x;
          const py = r.y + y;
          this.debris.push({
            x: px, y: py, s: Math.min(step, 3) - 1 || 2, c: r.color,
            vx: (px - r.cx) * 1.2 * spread + rng.range(-25, 25),
            vy: (py - r.cy) * 0.8 * spread + rng.range(-70, 10),
          });
        }
      }
    }
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.debris = this.debris.filter((d) => d.y < HEIGHT + 4);
  }

  renderDebris(ctx) {
    for (const d of this.debris) {
      ctx.fillStyle = d.c;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s);
    }
  }

  // Skakning under dödsanimationens första del
  get shake() {
    if (!this.dying || this.dyingT >= SHAKE_TIME) return { dx: 0, dy: 0, hit: false };
    return {
      dx: Math.round(Math.sin(this.dyingT * 120) * 2),
      dy: Math.round(Math.cos(this.dyingT * 97)),
      hit: Math.floor(this.dyingT / 0.06) % 2 === 0,
    };
  }

  render(ctx) {
    if (!this.dying || this.dyingT < SHAKE_TIME) this.renderBody(ctx);
    this.renderDebris(ctx);
  }

  // Namn och livsmätare överst (under statusraden). Slutar till vänster om effekt-HUD:en.
  renderBar(ctx) {
    if (this.done) return;
    const y = HUD_H + 2;
    drawText(ctx, this.name, 4, y, { color: PALETTE.cream });
    const x0 = 4 + textWidth(this.name) + 6;
    const x1 = 204;
    const w = x1 - x0;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillRect(x0 - 1, y, w + 2, 7);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(x0, y + 1, w, 5);
    const frac = Math.max(0, Math.min(1, this.hp / this.maxHp));
    ctx.fillStyle = this.phase === 3 ? PALETTE.bug : this.phase === 2 ? PALETTE.amber : PALETTE.accent;
    ctx.fillRect(x0, y + 1, Math.ceil(w * frac), 5);
    // Streck vid fasgränserna
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(x0 + Math.round(w / 3), y + 1, 1, 5);
    ctx.fillRect(x0 + Math.round((2 * w) / 3), y + 1, 1, 5);
  }
}

// ---------------------------------------------------------------------------------------------
// Den oändliga loopen: en roterande ring av segment runt en sårbar kärna
// ---------------------------------------------------------------------------------------------
export const LOOP = {
  slots: 12,        // platser i ringen
  gaps: [0, 6],     // platser utan segment (hål där skott når kärnan)
  radius: 21,       // ringens radie (diameter ~ 50 px med segmenten)
  segR: 5,          // kollisionsradie per segment
  coreR: 7,
  startX: WIDTH / 2,
  y: 56,
  baseHp: 30,
  coreDamage: 2,    // kärnan tar dubbelt
  points: { seg: 10, core: 25, defeat: 1500 },
  rot: [0.9, 1.4, 2.4],        // rad/s per fas
  speed: [16, 20, 26],         // px/s i sidled per fas
};

export class LoopBoss extends BossBase {
  constructor(level) {
    super('loop', level);
    this.maxHp = Math.round(LOOP.baseHp * this.hpMul);
    this.hp = this.maxHp;
    this.rewardPoints = Math.round(LOOP.points.defeat * (1 + 0.5 * this.cycle));
    this.cx = LOOP.startX;
    this.cy = LOOP.y;
    this.dir = 1;
    this.rot = 0;
    this.segFlash = new Array(LOOP.slots).fill(0);
    this.coreFlash = 0;
    this.lastPhase = 1;
    this.shotTimer = 1.5;
    this.mode = 'rest';          // fas 2/3: 'burst' (spiral) eller 'rest'
    this.modeT = 1.2;
    this.spiralTimer = 0;
    this.spiralAng = 0;
    this.warpTimer = rng.range(5, 7);
    this.warping = 0;            // > 0 medan bossen blinkar inför att "loopa tillbaka"
    this.warpCount = 0;
  }

  get w() { return (LOOP.radius + 5) * 2; }
  get h() { return this.w; }

  slotPos(i) {
    const a = this.rot + (i * Math.PI * 2) / LOOP.slots;
    return { x: this.cx + Math.cos(a) * LOOP.radius, y: this.cy + Math.sin(a) * LOOP.radius, a };
  }

  hasSeg(i) {
    return !LOOP.gaps.includes(i);
  }

  tick(dt, bullets, player) {
    const ph = this.phase;
    const sm = this.fireMul;
    this.rot += LOOP.rot[ph - 1] * (1 + 0.1 * this.cycle) * dt;
    this.segFlash = this.segFlash.map((t) => Math.max(0, t - dt));
    this.coreFlash = Math.max(0, this.coreFlash - dt);

    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      this.events.push({ kind: 'drop', x: this.cx, y: this.cy + LOOP.radius, chance: 1 });
      this.mode = 'rest';
      this.modeT = 0.8;
    }

    // Rör sig långsamt i sidled
    if (this.warping <= 0) {
      this.cx += this.dir * LOOP.speed[ph - 1] * dt;
      const min = 40;
      const max = WIDTH - 40;
      if (this.cx > max) { this.cx = max; this.dir = -1; }
      if (this.cx < min) { this.cx = min; this.dir = 1; }
    }

    // Fas 3: loopar tillbaka till startpositionen
    if (ph === 3) {
      if (this.warping > 0) {
        this.warping -= dt;
        if (this.warping <= 0) this.loopBack(bullets, sm);
      } else {
        this.warpTimer -= dt;
        if (this.warpTimer <= 0) this.warping = 0.6;
      }
    }
    if (this.warping > 0) return; // skjuter inte medan den blinkar

    const target = playerCenter(player);
    if (ph === 1) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.shotTimer = 1.5 / sm;
        this.aimedShot(bullets, target, 80 * sm);
      }
      return;
    }
    // Fas 2 och 3: omväxlande spiral och vila
    this.modeT -= dt;
    if (this.mode === 'burst') {
      this.spiralTimer -= dt;
      if (this.spiralTimer <= 0) {
        // Jämnt fördelade armar och ett litet, konstant vinkelsteg per salva ger tydliga spiralarmar
        const arms = ph === 2 ? 3 : 4;
        this.spiralTimer = 0.11 / sm;
        this.emitSpiral(bullets, arms, ph === 2 ? 0.2 : 0.17, (ph === 2 ? 64 : 74) * sm);
      }
      if (this.modeT <= 0) { this.mode = 'rest'; this.modeT = (ph === 2 ? 1.2 : 0.9) / sm; this.shotTimer = 0.5; }
    } else {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.shotTimer = 99;
        this.aimedShot(bullets, target, 85 * sm);
      }
      if (this.modeT <= 0) { this.mode = 'burst'; this.modeT = 2.2; this.spiralTimer = 0; }
    }
  }

  aimedShot(bullets, target, speed) {
    const dx = target.x - this.cx;
    const dy = target.y - this.cy;
    const len = Math.hypot(dx, dy) || 1;
    bullets.push(makeAimedBullet(this.cx, this.cy, (dx / len) * speed, (dy / len) * speed));
  }

  emitSpiral(bullets, arms, step, speed) {
    for (let k = 0; k < arms; k++) {
      const a = this.spiralAng + (k * Math.PI * 2) / arms;
      bullets.push(makeAimedBullet(this.cx, this.cy, Math.cos(a) * speed, Math.sin(a) * speed));
    }
    this.spiralAng += step;
  }

  loopBack(bullets, sm) {
    this.warpCount += 1;
    this.warpTimer = rng.range(5, 7);
    this.cx = LOOP.startX;
    this.dir = rng.random() < 0.5 ? -1 : 1;
    // Ring av skott där den dyker upp
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI * 2) / 12 + this.rot;
      bullets.push(makeAimedBullet(this.cx, this.cy, Math.cos(a) * 55 * sm, Math.sin(a) * 55 * sm));
    }
  }

  // Skott mot bossen. Segment tar 1 skada, kärnan 2. Returnerar { hit, points, consume }.
  hitBy(b) {
    if (!this.solid) return { hit: false, points: 0, consume: false };
    const rect = sweptRect(b);
    const cands = [];
    for (let i = 0; i < LOOP.slots; i++) {
      if (!this.hasSeg(i)) continue;
      const p = this.slotPos(i);
      if (rectCircle(rect, p.x, p.y, LOOP.segR)) cands.push({ id: `s${i}`, i, y: p.y });
    }
    if (rectCircle(rect, this.cx, this.cy, LOOP.coreR)) cands.push({ id: 'core', i: -1, y: this.cy });
    let list = cands.filter((c) => !b.seen?.has(c.id));
    if (list.length === 0) return { hit: false, points: 0, consume: false };
    if (!b.pierce) list = [list.reduce((a, c) => (c.y > a.y ? c : a))]; // det lägst placerade först
    let points = 0;
    let dmg = 0;
    for (const c of list) {
      b.seen?.add(c.id);
      if (c.i < 0) { dmg += LOOP.coreDamage; points += LOOP.points.core; this.coreFlash = 0.1; }
      else { dmg += 1; points += LOOP.points.seg; this.segFlash[c.i] = 0.1; }
      this.sparks(c.i < 0 ? { x: this.cx, y: this.cy } : this.slotPos(c.i), c.i < 0 ? PALETTE.amber : PALETTE.accent);
    }
    this.damage(dmg);
    return { hit: true, points, consume: !b.pierce };
  }

  sparks(p, color) {
    for (let k = 0; k < 4; k++) {
      this.debris.push({ x: p.x, y: p.y, s: 1, c: color, vx: rng.range(-50, 50), vy: rng.range(-70, -10) });
    }
  }

  pieces() {
    const out = [];
    for (let i = 0; i < LOOP.slots; i++) {
      if (!this.hasSeg(i)) continue;
      const p = this.slotPos(i);
      out.push({ x: Math.round(p.x) - 3, y: Math.round(p.y) - 3, w: 7, h: 7, cx: this.cx, cy: this.cy, color: i % 2 ? PALETTE.beige : PALETTE.accent });
    }
    out.push({ x: Math.round(this.cx) - 6, y: Math.round(this.cy) - 6, w: 13, h: 13, cx: this.cx, cy: this.cy, color: PALETTE.bug });
    return out;
  }

  renderBody(ctx) {
    if (this.warping > 0 && Math.floor(this.warping / 0.05) % 2 === 0) return;
    const sh = this.shake;
    const ox = sh.dx;
    const oy = sh.dy;
    for (let i = 0; i < LOOP.slots; i++) {
      const p = this.slotPos(i);
      if (this.hasSeg(i)) {
        const hit = sh.hit || this.segFlash[i] > 0;
        drawSprite(ctx, `loopSeg${i % 2}${hit ? 'Hit' : ''}`, p.x - 3 + ox, p.y - 3 + oy);
      } else {
        this.renderArrow(ctx, p, ox, oy);
      }
    }
    const frame = Math.floor(this.age / 0.25) % 2;
    const hit = sh.hit || this.coreFlash > 0;
    drawSprite(ctx, `loopCore${frame}${hit ? 'Hit' : ''}`, this.cx - 6 + ox, this.cy - 6 + oy);
  }

  // Pilspets (↻) i ringens hål: pekar åt rotationsriktningen (medurs)
  renderArrow(ctx, p, ox, oy) {
    const tx = -Math.sin(p.a);
    const ty = Math.cos(p.a);   // tangent (medurs)
    const nx = Math.cos(p.a);
    const ny = Math.sin(p.a);   // radiellt utåt
    ctx.fillStyle = PALETTE.cream;
    const tip = { x: p.x + tx * 5, y: p.y + ty * 5 };
    for (let k = 0; k <= 4; k++) {
      for (const side of [-1, 1]) {
        const x = tip.x - tx * k + nx * side * k;
        const y = tip.y - ty * k + ny * side * k;
        ctx.fillRect(Math.round(x + ox) - 1, Math.round(y + oy) - 1, 2, 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Stack Overflow-monstret: ett torn av stackramar som växer uppifrån och sjunker mot produktion
// ---------------------------------------------------------------------------------------------
export const STACK = {
  bw: 46,
  bh: 11,
  topY: 28,
  startBlocks: 6,
  baseReserve: 14,        // block som ännu inte staplats
  sway: 55,               // px sidledes svängning
  stackEvery: 4.0,        // sekunder mellan nya block i fas 1
  blockPoints: 25,
  defeatPoints: 3000,
  dropChance: 0.12,
};
const LABELS = ['f()', 'g()', 'main()', 'run()', 'init()', 'sort()', 'parse()', 'f(f())', 'loop()', 'new()', 'try()', 'get()'];
const BODY = [PALETTE.accentDark, PALETTE.muted, PALETTE.bugDark];
const TEXT = [PALETTE.cream, PALETTE.beige, PALETTE.amber];

export class StackBoss extends BossBase {
  constructor(level) {
    super('stack', level);
    this.reserve = STACK.baseReserve + 8 * this.cycle;
    this.blocks = [];            // index 0 = överst
    this.nextId = 0;
    this.cx = WIDTH / 2;
    for (let i = 0; i < STACK.startBlocks; i++) this.blocks.push(this.makeBlock(STACK.topY + i * STACK.bh));
    this.maxHp = this.blocks.length + this.reserve;
    this.rewardPoints = Math.round(STACK.defeatPoints * (1 + 0.5 * this.cycle));
    this.stackTimer = STACK.stackEvery;
    this.shotTimer = 2;
    this.stacked = 0;            // antal block som staplats under striden
  }

  get hp() { return this.blocks.length + this.reserve; }
  set hp(n) {
    if (n >= this.blocks.length) this.reserve = n - this.blocks.length;
    else { this.blocks.length = n; this.reserve = 0; } // tar bort underifrån
  }

  makeBlock(by) {
    const id = this.nextId++;
    return { id, label: LABELS[id % LABELS.length], by };
  }

  get left() { return this.cx - STACK.bw / 2; }
  // Tornets nedre kant (logisk position)
  get bottom() { return STACK.topY + this.blocks.length * STACK.bh; }
  get reachedProduction() { return this.solid && this.blocks.length > 0 && this.bottom >= PLAYER_Y - 3; }
  get w() { return STACK.bw; }
  get h() { return this.bottom - STACK.topY; }

  blockRect(b) {
    return { x: this.left, y: b.by, w: STACK.bw, h: STACK.bh };
  }

  // Rektanglar som äter upp testsviter (nedersta blocket)
  eatRects() {
    const last = this.blocks.at(-1);
    return last && this.solid ? [this.blockRect(last)] : [];
  }

  // Vid död sparas tornet som det såg ut, så att det kan skaka och falla sönder
  setHp(n) {
    if (!this.dying) this.snap = this.blocks.slice();
    super.setHp(n);
  }

  defeat() {
    super.defeat();
    this.dyingBlocks = this.snap ?? this.blocks.slice();
  }

  // Lägger ett nytt block överst; tornet sjunker ett block. force = utan att dra från reserven.
  addBlock(force = false) {
    if (!force) {
      if (this.reserve <= 0) return false;
      this.reserve -= 1;
    }
    this.blocks.unshift(this.makeBlock(STACK.topY - STACK.bh - 2));
    this.stacked += 1;
    this.maxHp = Math.max(this.maxHp, this.hp);
    return true;
  }

  tick(dt, bullets, player) {
    const ph = this.phase;
    const frac = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const sm = this.fireMul;
    this.cx = WIDTH / 2 + Math.sin(this.age * 0.6) * STACK.sway;
    // Blocken glider mjukt till sina platser (nya block faller in uppifrån, resten sjunker)
    this.blocks.forEach((b, i) => {
      b.by += (STACK.topY + i * STACK.bh - b.by) * Math.min(1, dt * 10);
    });

    // Staplar nya block, snabbare ju färre som återstår
    this.stackTimer -= dt;
    if (this.blocks.length === 0 && this.reserve > 0) this.stackTimer = Math.min(this.stackTimer, 0.5);
    if (this.stackTimer <= 0) {
      this.stackTimer = (STACK.stackEvery * (0.55 + 0.45 * frac)) / (1 + 0.15 * this.cycle);
      this.addBlock();
    }

    // Skjuter från toppblocket
    const top = this.blocks[0];
    if (!top) return;
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      this.shotTimer = ([1.7, 1.35, 1.0][ph - 1]) / sm;
      const t = playerCenter(player);
      const ox = this.cx;
      const oy = top.by + STACK.bh;
      const base = Math.atan2(t.y - oy, t.x - ox);
      const speed = [80, 90, 100][ph - 1] * (1 + 0.1 * this.cycle);
      const spread = ph === 1 ? [0] : [-0.3, 0, 0.3];
      for (const d of spread) {
        const a = base + d;
        bullets.push(makeAimedBullet(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed, ['err0', 'err1']));
      }
    }
  }

  hitBy(b) {
    if (!this.solid) return { hit: false, points: 0, consume: false };
    const rect = sweptRect(b);
    let list = this.blocks.filter((k) => {
      const r = this.blockRect(k);
      return r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y && !b.seen?.has(k.id);
    });
    if (list.length === 0) return { hit: false, points: 0, consume: false };
    if (!b.pierce) list = [list.reduce((a, k) => (k.by > a.by ? k : a))]; // underifrån: nedersta först
    this.snap = this.blocks.slice();
    for (const k of list) {
      b.seen?.add(k.id);
      this.removeBlock(k, this.hp <= 1);
    }
    if (this.hp <= 0 && !this.dying) this.defeat();
    return { hit: true, points: STACK.blockPoints * list.length, consume: !b.pierce };
  }

  removeBlock(k, last = false) {
    this.blocks = this.blocks.filter((x) => x !== k);
    const r = this.blockRect(k);
    if (last) return; // sista blocket faller sönder i dödsanimationen
    this.shatter([{ x: Math.round(r.x), y: Math.round(r.y), w: r.w, h: r.h, cx: r.x + r.w / 2, cy: r.y + r.h / 2, color: BODY[k.id % 3] }], 4, 0.5);
    this.events.push({ kind: 'drop', x: r.x + r.w / 2, y: r.y + r.h / 2, chance: STACK.dropChance });
  }

  pieces() {
    return this.dyingBlocks.map((k) => {
      const r = this.blockRect(k);
      return { x: Math.round(r.x), y: Math.round(r.y), w: r.w, h: r.h, cx: r.x + r.w / 2, cy: r.y + r.h / 2, color: BODY[k.id % 3] };
    });
  }

  renderBody(ctx) {
    const sh = this.shake;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_H + 1, WIDTH, HEIGHT);
    ctx.clip();
    (this.dying ? this.dyingBlocks : this.blocks).forEach((k, i) => {
      const r = this.blockRect(k);
      const x = Math.round(r.x) + sh.dx;
      const y = Math.round(r.y) + sh.dy;
      const isTop = i === 0;
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(x, y, r.w, r.h);
      ctx.fillStyle = sh.hit ? PALETTE.cream : isTop ? PALETTE.bug : BODY[k.id % 3];
      ctx.fillRect(x + 1, y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = isTop ? PALETTE.accent : PALETTE.accent;
      ctx.fillRect(x + 1, y + 1, r.w - 2, 1);
      drawText(ctx, k.label, x + r.w / 2, y + 2, { color: TEXT[k.id % 3], align: 'center' });
      // Toppblocket laddar med en gul ram precis innan det skjuter
      if (isTop && this.shotTimer < 0.3) {
        ctx.fillStyle = PALETTE.amber;
        ctx.fillRect(x, y, r.w, 1);
        ctx.fillRect(x, y + r.h - 1, r.w, 1);
        ctx.fillRect(x, y, 1, r.h);
        ctx.fillRect(x + r.w - 1, y, 1, r.h);
      }
    });
    ctx.restore();
  }
}

export function createBoss(kind, level) {
  return kind === 'stack' ? new StackBoss(level) : new LoopBoss(level);
}
