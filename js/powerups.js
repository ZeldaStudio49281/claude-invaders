// Power-ups: släpps av besegrade buggar, faller långsamt och ger tidsbegränsade effekter
import { HEIGHT, WIDTH, MAX_LIVES, DROP_CHANCE } from './config.js';
import { PALETTE } from './palette.js';
import { STR } from './strings.js';
import { drawSprite } from './sprites.js';
import * as rng from './rng.js';

export const FALL_SPEED = 36;   // px/s nedåt
export const SIZE = 8;          // ikonens storlek
export const MAX_EXTEND = 2;    // en effekt kan förlängas till högst så många gånger sin ordinarie tid

// dur = sekunder (0 = ingen tid). weight = hur ofta typen släpps. timed-effekter ligger i effects[type].
export const POWERUP_TYPES = {
  think: { sprite: 'pu_think', dur: 5, weight: 3 },  // Extended thinking: långsammare fiender
  tool: { sprite: 'pu_tool', dur: 8, weight: 3 },    // Tool use: trippelskott
  shield: { sprite: 'pu_shield', dur: 0, weight: 3 }, // Konstitution: tål en träff
  review: { sprite: 'pu_review', dur: 6, weight: 3 }, // Kodgranskning: genomträngande skott
  life: { sprite: 'pu_life', dur: 0, weight: 1 },     // Extra kontext: +1 liv
};
export const TIMED = ['think', 'tool', 'review'];
const TYPE_IDS = Object.keys(POWERUP_TYPES);

export function newEffects() {
  return { think: 0, tool: 0, review: 0, shield: false };
}

export function makePowerup(type, x, y) {
  if (!POWERUP_TYPES[type]) throw new Error(`Okänd power-up: ${type}`);
  return { type, x, y, w: SIZE, h: SIZE, age: 0 };
}

// Slumpar en typ (viktat)
export function randomType() {
  const total = TYPE_IDS.reduce((n, t) => n + POWERUP_TYPES[t].weight, 0);
  let r = rng.random() * total;
  for (const t of TYPE_IDS) {
    r -= POWERUP_TYPES[t].weight;
    if (r < 0) return t;
  }
  return TYPE_IDS[0];
}

// Slår om en power-up ska släppas
export function rollDrop(chance = DROP_CHANCE) {
  return rng.random() < chance;
}

// Flyttar power-ups nedåt och tar bort dem vid botten
export function updatePowerups(list, dt) {
  for (const p of list) {
    p.age += dt;
    p.y += FALL_SPEED * dt;
  }
  return list.filter((p) => p.y < HEIGHT);
}

// Ger spelaren en effekt. Returnerar namnet som ska visas som flytande text.
// effects är game.effects, lives är nuvarande antal liv. Returnerar { lives, name }.
export function applyPowerup(effects, type, lives) {
  const def = POWERUP_TYPES[type];
  if (type === 'shield') {
    effects.shield = true;
  } else if (type === 'life') {
    lives = Math.min(MAX_LIVES, lives + 1);
  } else {
    // Samma effekt igen förlänger den, upp till MAX_EXTEND gånger ordinarie tid
    effects[type] = Math.min(def.dur * MAX_EXTEND, effects[type] + def.dur);
  }
  return { lives, name: STR.powerups[type] };
}

// Räknar ner tidsbegränsade effekter
export function tickEffects(effects, dt) {
  for (const t of TIMED) effects[t] = Math.max(0, effects[t] - dt);
}

export function renderPowerups(ctx, list) {
  for (const p of list) {
    // Liten gungning i sidled gör dem lätta att se och skilja från skott
    const sway = Math.round(Math.sin(p.age * 4));
    drawSprite(ctx, POWERUP_TYPES[p.type].sprite, p.x + sway, p.y);
  }
}

// Sköldringen runt spelaren (17x17, spelaren är 11x11)
export function renderShield(ctx, player) {
  drawSprite(ctx, 'shieldRing', player.x + player.w / 2 - 8.5, player.y + player.h / 2 - 8.5);
}

// HUD: aktiva effekter som ikon + krympande stapel, högerjusterat på raden under statusfältet
export const HUD_FX_Y = 16;
const BAR_W = 20;
export function renderEffectsHud(ctx, effects, frames) {
  const slots = TIMED.filter((t) => effects[t] > 0);
  const slotW = SIZE + 2 + BAR_W + 4;
  let x = WIDTH - 4 - slots.length * slotW - (effects.shield ? SIZE + 4 : 0);
  if (effects.shield) {
    drawSprite(ctx, 'pu_shield', x, HUD_FX_Y);
    x += SIZE + 4;
  }
  for (const t of slots) {
    const left = effects[t];
    const blink = left < 1.5 && Math.floor(frames / 8) % 2 === 0;
    if (!blink) drawSprite(ctx, POWERUP_TYPES[t].sprite, x, HUD_FX_Y);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillRect(x + SIZE + 2, HUD_FX_Y + 2, BAR_W, 4);
    ctx.fillStyle = left < 1.5 ? PALETTE.bug : PALETTE.amber;
    ctx.fillRect(x + SIZE + 2, HUD_FX_Y + 2, Math.max(1, Math.round(BAR_W * Math.min(1, left / POWERUP_TYPES[t].dur))), 4);
    x += slotW;
  }
}
