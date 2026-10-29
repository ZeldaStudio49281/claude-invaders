// Spelaren: Claudes stjärna
import { WIDTH, PLAYER_Y } from './config.js';
import { isDown, wasPressed } from './input.js';
import { drawSprite, spriteSize } from './sprites.js';
import { makeToken, makePiercingToken } from './projectiles.js';

const SPEED = 130;       // px/s
const COOLDOWN = 0.3;    // sekunder mellan skott
const MAX_BULLETS = 2;   // högst så många egna skott åt gången
const INVULN_TIME = 2;   // sekunders osårbarhet efter träff
const MARGIN = 4;
const FAN_VX = 45;       // sidofart för trippelskottets sidoskott (px/s)

export class Player {
  constructor() {
    const { w, h } = spriteSize('player');
    this.w = w;
    this.h = h;
    this.reset();
  }

  reset() {
    this.x = (WIDTH - this.w) / 2;
    this.y = PLAYER_Y;
    this.cooldown = 0;
    this.invuln = 0;
    this.fireLock = true; // mellanslaget som startade spelet får inte skjuta; det måste släppas först
  }

  // Mindre hitbox än sprite (strålspetsarna räknas inte)
  get hitbox() {
    return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 };
  }

  hit() {
    this.invuln = INVULN_TIME;
  }

  // fx: aktiva power-up-effekter (se powerups.js): fx.tool = trippelskott, fx.review = genomträngande
  update(dt, bullets, fx = {}) {
    const dir = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    this.x = Math.min(WIDTH - MARGIN - this.w, Math.max(MARGIN, this.x + dir * SPEED * dt));
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    if (!isDown('fire') || wasPressed('fire')) this.fireLock = false;
    const wantsFire = !this.fireLock && (isDown('fire') || wasPressed('fire'));
    const triple = fx.tool > 0;
    if (wantsFire && this.cooldown === 0 && bullets.length < MAX_BULLETS * (triple ? 3 : 1)) {
      const x = this.x + this.w / 2 - 1.5;
      const y = this.y - 4;
      const make = (vx) => (fx.review > 0 ? makePiercingToken(x, y, vx) : makeToken(x, y, vx));
      if (triple) bullets.push(make(-FAN_VX), make(0), make(FAN_VX));
      else bullets.push(make(0));
      this.cooldown = COOLDOWN;
    }
  }

  render(ctx) {
    // Blinka under osårbarhet
    if (this.invuln > 0 && Math.floor(this.invuln / 0.1) % 2 === 0) return;
    drawSprite(ctx, 'player', this.x, this.y);
  }
}
