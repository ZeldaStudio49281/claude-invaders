// Spelets tillståndsmaskin: menu -> playing <-> paused -> (enterName ->) gameover -> playing
import { STR } from './strings.js';
import { PALETTE } from './palette.js';
import { wasPressed, wasPressedNav, isDown, typedChars } from './input.js';
import { WIDTH, HEIGHT, HUD_H, CONTEXT_MAX, DROP_CHANCE } from './config.js';
import { drawText, textWidth } from './font.js';
import { Player } from './player.js';
import { EnemyGrid, CELL_H } from './enemies.js';
import { ShieldSet, SHIELD_Y } from './shields.js';
import { overlaps, makeErrorBullet } from './projectiles.js';
import { drawSprite, spriteSize } from './sprites.js';
import { levelConfig } from './levels.js';
import { createBoss } from './boss.js';
import * as pu from './powerups.js';
import * as rng from './rng.js';
import { GameAudio, tempoFor } from './audio.js';
import { Particles, cosmeticRandom } from './particles.js';
import * as hs from './highscore.js';

export { WIDTH, HEIGHT, PALETTE };

// Heisenbuggen: dyker upp mellan rutnätet och spelaren, flimrar och försvinner av sig själv
export const HEIS_LIFE = 6;          // sekunder den finns kvar
export const HEIS_PERIOD = 0.5;      // flimmerperiod
export const HEIS_VISIBLE = 0.2;     // så länge syns den per period
const HEIS_WAIT = [12, 25];          // sekunder mellan uppdykningar
const FLOAT_LIFE = 1;                // sekunder flytande poängtext syns
const BEAM_TIME = 0.5;               // sekunder Refaktoreringens stråle sveper
const SLOW_FACTOR = 0.5;             // Extended thinking: fiender och fiendeskott i halv fart
const SHIELD_GRACE = 0.6;            // osårbarhet efter att en sköld tagit en träff
const MENU_PANEL_TIME = 4;           // sekunder per panel i startmenyn (kontroller / topplista)
const SPLASH_TIME = 1.5;             // sekunder topplistesplashen syns
const NAME_KEYS = ['left', 'right', 'up', 'down', 'fire', 'confirm'];
const SHAKE = { hurt: [3, 0.35], boss: [5, 0.6], refactor: [2, 0.3] }; // [amplitud i px, sekunder]

// Poäng 500..100 beroende på hur snabbt den träffas
export function heisPoints(age) {
  return 500 - 100 * Math.min(4, Math.floor((age / HEIS_LIFE) * 5));
}


export class Game {
  constructor() {
    this.state = 'menu';
    this.audio = new GameAudio();   // ljud och musik (tyst tills första interaktionen)
    this.particles = new Particles();
    this.shake = 0;          // aktuell skakamplitud i px (0 = stilla)
    this.shakeStart = 0;
    this.shakeDur = 0;
    this.shakeT = 0;
    this.shakePeak = 0;      // största amplitud sedan start, för e2e-testerna
    this.shakeCount = 0;     // antal skakningar som faktiskt startats
    this.shakeOffset = { x: 0, y: 0 }; // senaste heltalsförskjutning
    this.reducedMotionOverride = null;
    this.heisWasVisible = false;
    this.scores = hs.loadScores();     // topp 10, sorterad fallande
    this.highScore = this.scores[0]?.score ?? 0;
    this.lastRank = -1;                // senaste placeringen på topplistan (-1 = ingen)
    this.rankBase = this.scores.slice(); // topplistan som den såg ut när matchen startade
    this.liveRank = null;              // placering (1-10) som poängen ger just nu, annars null
    this.bestRank = Infinity;          // bästa placeringen hittills i matchen
    this.rankSplash = null;            // { text, t, dur } eller null
    this.nameEntry = null;             // { name, pos } under enterName
    this.nameBlocked = new Set();      // knappar som hölls nere när spelet tog slut, ignoreras tills de släpps
    this.touchMode = false;            // sätts av touch.js när touchknapparna visas
    this.menuT = 0;                    // tid i menyn, växlar mellan kontroller och topplista
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.player = new Player();
    this.grid = new EnemyGrid(1);
    this.bullets = [];       // spelarens skott
    this.shields = new ShieldSet();
    this.context = 0;        // Kontextfönstret: träffar i följd
    this.heisenbug = null;
    this.shotsFired = 0; // antal spelarskott sedan sidan laddades (används av testerna)
    this.heisTimer = rng.range(...HEIS_WAIT);
    this.floaters = [];      // flytande poängtexter
    this.fx = [];            // visuella effekter, t.ex. Refaktoreringens stråle
    this.effects = pu.newEffects(); // aktiva power-up-effekter (sekunder kvar, shield = sann/falsk)
    this.powerups = [];      // fallande power-ups
    this.dropChance = DROP_CHANCE;
    this.boss = null;
    this.enemyBullets = [];  // fiendernas "felmeddelanden"
    this.frames = 0; // antal update-anrop, för e2e-testerna
    this.debug = this.makeDebug();
    this.audio.listen();
  }

  get muted() {
    return this.audio.muted;
  }

  set muted(v) {
    this.audio.setMuted(v);
  }

  // Respekterar prefers-reduced-motion: ingen skärmskakning (partiklarna får vara kvar)
  get reducedMotion() {
    if (this.reducedMotionOverride !== null) return this.reducedMotionOverride;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Startar en kort skärmskakning som avtar linjärt
  addShake(kind) {
    if (this.reducedMotion) return;
    const [amp, dur] = SHAKE[kind];
    if (amp < this.shake) return; // pågående starkare skakning vinner
    this.shake = amp;
    this.shakeStart = amp;
    this.shakeDur = dur;
    this.shakeT = 0;
    this.shakePeak = Math.max(this.shakePeak, amp);
    this.shakeCount += 1;
  }

  updateShake(dt) {
    if (this.shake <= 0) return;
    this.shakeT += dt;
    const left = 1 - this.shakeT / this.shakeDur;
    this.shake = left > 0 ? this.shakeStart * left : 0;
  }

  // Fiendelistan (levande buggar)
  get enemies() {
    return this.grid.enemies;
  }

  start() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.player.reset();
    this.context = 0;
    this.floaters = [];
    this.fx = [];
    this.particles.clear();
    this.shake = 0;
    this.audio.resetMusic();
    this.effects = pu.newEffects();
    this.rankBase = this.scores.slice();
    this.liveRank = null;
    this.bestRank = Infinity;
    this.rankSplash = null;
    this.startLevel();
    this.state = 'playing';
  }

  startLevel() {
    const frozen = this.grid.frozen;
    this.grid = new EnemyGrid(this.level);
    this.grid.frozen = frozen;
    this.bullets = [];
    this.enemyBullets = [];
    this.shields = new ShieldSet();
    this.heisenbug = null;
    this.heisTimer = rng.range(...HEIS_WAIT);
    this.powerups = [];
    // Bossnivåer: bossen ersätter rutnätet
    const cfg = levelConfig(this.level);
    this.boss = cfg.boss ? createBoss(cfg.boss, this.level) : null;
    if (this.boss) this.grid.enemies = [];
  }

  endGame() {
    this.highScore = Math.max(this.highScore, this.score);
    this.audio.sfx('gameover');
    this.lastRank = -1;
    if (hs.qualifies(this.scores, this.score)) {
      this.nameEntry = { name: hs.loadLastName(), pos: 0 };
      this.nameBlocked = new Set(NAME_KEYS.filter((k) => isDown(k)));
      this.state = 'enterName';
    } else {
      this.state = 'gameover';
    }
  }

  // Autopaus när fliken eller fönstret tappar fokus. Återupptas aldrig av sig själv.
  autoPause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.updateMusic(this.musicParams()); // rAF stannar i dold flik, så tysta musiken direkt
  }

  // Sparar poängen med valt namn och går vidare till game over
  confirmName() {
    let name = this.nameEntry.name;
    if (name.trim() === '') name = hs.cleanName(STR.noName);
    const r = hs.insertScore(this.scores, { name, score: this.score, level: this.level, date: new Date().toISOString().slice(0, 10) });
    this.scores = r.list;
    this.lastRank = r.index;
    hs.saveScores(this.scores);
    hs.saveLastName(name);
    this.highScore = Math.max(this.highScore, this.scores[0]?.score ?? 0);
    this.nameEntry = null;
    this.state = 'gameover';
  }

  updateNameEntry() {
    // Knappar som hölls nere när spelet tog slut (t.ex. mellanslag eller vänster) får inte slå igenom
    for (const k of this.nameBlocked) if (!isDown(k)) this.nameBlocked.delete(k);
    if (this.nameBlocked.size > 0) return;
    const ne = this.nameEntry;
    const chars = hs.NAME_CHARS;
    const set = (c) => { ne.name = ne.name.slice(0, ne.pos) + c + ne.name.slice(ne.pos + 1); };
    for (const c of typedChars()) {
      if (c === '') ne.pos = Math.max(0, ne.pos - 1);
      else if (chars.includes(c)) {
        set(c);
        ne.pos = Math.min(hs.NAME_LEN - 1, ne.pos + 1);
      }
    }
    if (wasPressedNav('left')) ne.pos = Math.max(0, ne.pos - 1);
    if (wasPressedNav('right')) ne.pos = Math.min(hs.NAME_LEN - 1, ne.pos + 1);
    const step = (wasPressedNav('up') ? 1 : 0) - (wasPressedNav('down') ? 1 : 0);
    if (step) {
      const i = chars.indexOf(ne.name[ne.pos]);
      set(chars[(i + step + chars.length) % chars.length]);
    }
    if (wasPressed('confirm') || wasPressed('fire')) this.confirmName();
  }

  update(dt) {
    this.frames += 1;
    if (this.state === 'enterName' ? wasPressedNav('mute') : wasPressed('mute')) this.audio.toggleMuted();

    switch (this.state) {
      case 'menu':
        this.menuT += dt;
        if (wasPressed('fire') || wasPressed('confirm') || wasPressed('tap')) this.start();
        break;
      case 'playing':
        if (wasPressed('pause')) this.state = 'paused';
        else this.updatePlaying(dt);
        break;
      case 'paused':
        // Ingen logik eller tid går under paus
        if (wasPressed('pause')) this.state = 'playing';
        break;
      case 'enterName':
        this.updateNameEntry();
        break;
      case 'gameover':
        if (wasPressed('fire') || wasPressed('confirm') || wasPressed('tap')) this.start();
        break;
    }
    this.audio.updateMusic(this.musicParams());
  }

  // Vad musiken ska göra just nu: spela under match, bossvariant under bossar, tempo efter fartökning
  musicParams() {
    const boss = this.boss && !this.boss.done ? this.boss : null;
    const speedRatio = this.grid.enemies.length ? this.grid.speed / this.grid.cfg.baseSpeed : 1;
    return {
      active: this.state === 'playing',
      boss: !!boss,
      tempo: tempoFor({ boss: !!boss, phase: boss?.phase ?? 1, speedRatio }),
    };
  }

  updatePlaying(dt) {
    // Extended thinking gör att fiender och fiendeskott går i halv fart
    const edt = this.effects.think > 0 ? dt * SLOW_FACTOR : dt;
    pu.tickEffects(this.effects, dt);
    this.particles.update(dt);
    this.updateShake(dt);
    this.powerups = pu.updatePowerups(this.powerups, dt);
    this.collectPowerups();

    const shotsBefore = this.bullets.length;
    this.player.update(dt, this.bullets, this.effects);
    if (this.bullets.length > shotsBefore) {
      this.shotsFired += this.bullets.length - shotsBefore;
      this.audio.sfx('shoot');
    }
    this.grid.update(edt, this.enemyBullets);
    if (this.boss && (!this.grid.frozen || this.boss.dying)) this.boss.update(edt, this.enemyBullets, this.player);
    this.handleBossEvents();
    this.checkBossExplosion();
    for (const b of this.bullets) b.update(dt);
    for (const b of this.enemyBullets) b.update(edt);

    this.updateHeisenbug(dt);
    this.floaters.forEach((f) => { f.t += dt; });
    this.floaters = this.floaters.filter((f) => f.t < FLOAT_LIFE);
    this.fx.forEach((f) => { f.t += dt; });
    this.fx = this.fx.filter((f) => f.t < f.dur);

    // Spelarens skott mot Heisenbuggen (bara när den syns), buggar och testsviter
    // (genomträngande skott fortsätter efter träff och träffar varje mål högst en gång)
    for (const b of this.bullets) {
      const heis = this.heisenbug;
      let used = false;
      if (heis && this.heisVisible && overlaps(b, heis)) {
        const pts = heisPoints(heis.age);
        this.score += pts;
        this.addFloater(heis.x + heis.w / 2, heis.y, pts);
        this.heisenbug = null;
        used = !b.pierce;
        this.audio.sfx('hit');
        this.particles.bugDeath(heis.x + heis.w / 2, heis.y + heis.h / 2, 'heis');
        this.registerHit();
      }
      if (!used) {
        for (const e of this.enemies.filter((x) => overlaps(b, x) && !b.seen?.has(x))) {
          this.score += this.grid.hit(e);
          this.killFx(e);
          this.registerHit();
          this.maybeDrop(e.x + e.w / 2, e.y + e.h / 2);
          b.seen?.add(e);
          if (!b.pierce) { used = true; break; }
        }
      }
      if (!used && this.boss) {
        const r = this.boss.hitBy(b);
        if (r.hit) {
          this.score += r.points;
          this.audio.sfx('hit');
          this.particles.sparks(b.x + b.w / 2, b.y, [PALETTE.accent, PALETTE.amber, PALETTE.cream]);
          this.registerHit();
          this.handleBossEvents();
          used = r.consume;
        }
      }
      if (!used && this.shields.hitBullet(b, -1)) {
        used = true;
        this.particles.sparks(b.x + b.w / 2, b.y);
      }
      if (used) b.dead = true;
    }
    // Ett skott som lämnar skärmen utan att träffa nollställer Kontextfönstret
    if (this.bullets.some((b) => !b.dead && b.offscreen)) this.context = 0;
    this.bullets = this.bullets.filter((b) => !b.dead && !b.offscreen);

    // Fiendeskott mot testsviterna, och buggar som äter dem
    for (const b of this.enemyBullets) {
      if (this.shields.hitBullet(b, 1)) {
        b.dead = true;
        this.particles.sparks(b.x + b.w / 2, b.y + b.h);
      }
    }
    this.shields.eat(this.enemies);
    if (this.boss?.eatRects) this.shields.eat(this.boss.eatRects());

    if (wasPressed('special')) this.refactor();
    this.updateRank(dt);

    // Fiendeskott mot spelaren (ingen träff under osårbarhet)
    for (const b of this.enemyBullets) {
      if (this.player.invuln === 0 && overlaps(b, this.player.hitbox)) {
        if (this.effects.shield) {
          // Konstitution: skölden tål en träff
          this.effects.shield = false;
          this.player.invuln = SHIELD_GRACE;
          this.audio.sfx('shieldbreak');
          this.particles.sparks(this.player.x + this.player.w / 2, this.player.y, [PALETTE.pass, PALETTE.cream]);
        } else {
          this.lives -= 1;
          this.player.hit();
          this.audio.sfx('hurt');
          this.addShake('hurt');
          this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, [PALETTE.accent, PALETTE.accentDark, PALETTE.cream], 16, { speed: 80, life: 0.6 });
        }
        b.dead = true;
      }
    }
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead && !b.offscreen);

    // Förlust: inga liv kvar, eller en bugg (eller bosstornet) når produktion (spelarens rad)
    if (this.lives <= 0 || (this.enemies.length > 0 && this.grid.bottom >= this.player.y) || this.boss?.reachedProduction) {
      this.lives = Math.max(0, this.lives);
      this.endGame();
      return;
    }

    // Vinst: alla buggar borta (eller bossen besegrad och upplöst), nästa nivå
    if (this.boss ? this.boss.done : this.enemies.length === 0) {
      this.audio.sfx('levelclear');
      this.level += 1;
      this.startLevel();
    }
  }

  // Placering på topplistan (mot listan vid matchstart) och splash när den förbättras. Splashen blockerar inget.
  updateRank(dt) {
    const sp = this.rankSplash;
    if (sp) {
      sp.t += dt;
      if (sp.t >= sp.dur) this.rankSplash = null;
    }
    const idx = hs.rankFor(this.rankBase, this.score);
    this.liveRank = idx === -1 ? null : idx + 1;
    if (this.liveRank !== null && this.liveRank < this.bestRank) {
      this.bestRank = this.liveRank;
      const record = this.liveRank === 1 && this.rankBase.length > 0;
      const text = record ? STR.rank.record : `${STR.rank.splash} ${this.liveRank}!`;
      this.rankSplash = { text, rank: this.liveRank, record, t: 0, dur: SPLASH_TIME }; // ersätter en pågående splash
      this.audio.sfx('rank');
    }
  }

  // Ljud och partiklar när en bugg dör (Minnesläckan får en större explosion)
  killFx(e) {
    this.particles.bugDeath(e.x + e.w / 2, e.y + e.h / 2, e.type);
    if (e.type === 'leak') this.audio.sfx('explosion', { scale: 0.4 });
    else this.audio.sfx('hit');
  }

  // Bossen faller sönder: stor explosion, skakning och ljud (en gång per boss)
  checkBossExplosion() {
    const b = this.boss;
    if (!b || !b.shattered || b.boomed) return;
    b.boomed = true;
    this.audio.sfx('explosion', { scale: 1 });
    this.addShake('boss');
    this.particles.explosion(b.pieces(), 6);
  }

  // Bossens händelser: poäng vid död samt power-up-släpp
  handleBossEvents() {
    const boss = this.boss;
    if (!boss) return;
    for (const ev of boss.takeEvents()) {
      if (ev.kind === 'drop') this.maybeDrop(ev.x, ev.y, ev.chance);
    }
    const pts = boss.takeReward();
    if (pts) {
      this.score += pts;
      this.addFloater(WIDTH / 2, boss.cy ?? 80, pts);
      this.enemyBullets = []; // bossens skott försvinner när den dör
    }
  }

  // Slår om en besegrad fiende ska släppa en power-up (chance 1 = alltid)
  maybeDrop(x, y, chance = this.dropChance) {
    if (!pu.rollDrop(chance)) return null;
    return this.spawnPowerup(pu.randomType(), x - pu.SIZE / 2, y - pu.SIZE / 2);
  }

  spawnPowerup(type, x, y) {
    const p = pu.makePowerup(type, x, y);
    this.powerups.push(p);
    return p;
  }

  // Spelaren plockar upp power-ups som den nuddar
  collectPowerups() {
    const p = this.player;
    const box = { x: p.x, y: p.y, w: p.w, h: p.h };
    this.powerups = this.powerups.filter((up) => {
      if (!overlaps(up, box)) return true;
      this.givePowerup(up.type);
      return false;
    });
  }

  // Ger en effekt och visar dess namn som flytande text
  givePowerup(type) {
    const r = pu.applyPowerup(this.effects, type, this.lives);
    this.lives = r.lives;
    this.audio.sfx('powerup');
    this.particles.pickup(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
    const half = (r.name.length * 6) / 2;
    const x = this.player.x + this.player.w / 2;
    this.addFloater(Math.min(WIDTH - half - 2, Math.max(half + 2, x)), this.player.y - 6, r.name);
  }

  registerHit() {
    this.context = Math.min(CONTEXT_MAX, this.context + 1);
  }

  addFloater(x, y, text) {
    this.floaters.push({ x, y, text: String(text), t: 0 });
  }

  get heisVisible() {
    const h = this.heisenbug;
    return !!h && h.age % HEIS_PERIOD < HEIS_VISIBLE;
  }

  spawnHeisenbug(x, y) {
    const { w, h } = spriteSize('heis');
    this.heisenbug = { x, y, w, h, age: 0 };
    this.heisWasVisible = false;
  }

  updateHeisenbug(dt) {
    const h = this.heisenbug;
    if (h) {
      h.age += dt;
      if (h.age >= HEIS_LIFE) this.heisenbug = null;
      else if (this.heisVisible !== this.heisWasVisible) {
        this.heisWasVisible = this.heisVisible;
        if (this.heisWasVisible) this.audio.sfx('flicker');
      }
      return;
    }
    if (this.grid.frozen || this.enemies.length === 0) return;
    this.heisTimer -= dt;
    if (this.heisTimer <= 0) {
      this.heisTimer = rng.range(...HEIS_WAIT);
      // Slumpad plats mellan rutnätet och spelaren (ovanför testsviterna)
      const minY = Math.ceil(this.grid.bottom) + 6;
      const maxY = SHIELD_Y - 14;
      if (maxY > minY) this.spawnHeisenbug(Math.round(rng.range(10, WIDTH - 21)), Math.round(rng.range(minY, maxY)));
    }
  }

  // Refaktorering: rensar nedersta raden när Kontextfönstret är fullt
  refactor() {
    if (this.context < CONTEXT_MAX || this.enemies.length === 0) return;
    const row = Math.max(...this.enemies.map((e) => e.row));
    const victims = this.enemies.filter((e) => e.row === row);
    const pts = victims.reduce((n, e) => n + e.points, 0);
    this.grid.enemies = this.enemies.filter((e) => e.row !== row);
    this.score += pts;
    this.context = 0;
    this.audio.sfx('refactor');
    this.addShake('refactor');
    for (const e of victims) this.particles.bugDeath(e.x + e.w / 2, e.y + e.h / 2, e.type);
    const y = Math.min(...victims.map((e) => e.y));
    this.fx.push({
      kind: 'beam', t: 0, dur: BEAM_TIME, y: y - 2, h: CELL_H,
      ghosts: victims.map((e) => ({ x: e.x, y: e.y, sprite: this.grid.spriteName(e) })),
    });
    this.addFloater(WIDTH / 2, y, pts);
  }

  // Testkrokar (harmlösa i produktion), nås via window.__game.debug
  makeDebug() {
    return {
      seed: (n) => rng.seed(n),
      killAllEnemies: () => { this.grid.enemies = []; },
      setLives: (n) => { this.lives = n; },
      clearEnemyBullets: () => { this.enemyBullets = []; },
      freezeEnemies: (on = true) => { this.grid.frozen = on; },
      spawnEnemyBulletAt: (x, y) => { this.enemyBullets.push(makeErrorBullet(x, y)); },
      shiftEnemies: (dx, dy) => this.grid.shift(dx, dy),
      spawnHeisenbug: (x, y) => this.spawnHeisenbug(x, y),
      setContext: (n) => { this.context = Math.max(0, Math.min(CONTEXT_MAX, n)); },
      setLevel: (n) => { this.level = n; this.startLevel(); },
      placeEnemy: (type, col, row) => this.grid.place(type, col, row),
      spawnPowerup: (type, x, y) => this.spawnPowerup(type, x, y),
      givePowerup: (type) => this.givePowerup(type),
      setDropChance: (p) => { this.dropChance = p; },
      startBoss: (kind, cycle = 0) => { this.level = (kind === 'stack' ? 10 : 5) + 10 * cycle; this.startLevel(); },
      setBossHp: (n) => this.boss?.setHp(n),
      damageBoss: (n = 1) => this.boss?.damage(n),
      // Testkrokarna uppdaterar också matchstartens lista, så att de går att använda under pågående match
      clearHighscores: () => { hs.clearScores(); this.scores = []; this.rankBase = []; this.highScore = 0; this.lastRank = -1; },
      addHighscore: (name, score, level = 1) => {
        const r = hs.insertScore(this.scores, { name, score, level, date: new Date().toISOString().slice(0, 10) });
        this.scores = r.list;
        this.rankBase = r.list.slice();
        hs.saveScores(this.scores);
        this.highScore = Math.max(this.highScore, this.scores[0]?.score ?? 0);
        return r.index;
      },
      reducedMotion: (on) => { this.reducedMotionOverride = on === null || on === undefined ? null : !!on; },
    };
  }

  render(ctx) {
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    switch (this.state) {
      case 'menu':
        this.renderMenu(ctx);
        break;
      case 'playing':
        this.renderShaken(ctx, () => this.renderPlaying(ctx));
        this.renderRankSplash(ctx);
        this.renderHud(ctx); // HUD sist och utan skakning, så att inget ritas ovanpå den
        break;
      case 'paused':
        this.renderPlaying(ctx);
        this.renderRankSplash(ctx);
        this.renderHud(ctx);
        this.renderPaused(ctx);
        break;
      case 'enterName':
        this.renderNameEntry(ctx);
        break;
      case 'gameover':
        this.renderGameOver(ctx);
        break;
    }
    drawSprite(ctx, this.muted ? 'sndOff' : 'sndOn', WIDTH - 11, 229);
  }

  // Ritar med heltalsförskjutning (skärmskakning), så att pixlarna förblir skarpa
  renderShaken(ctx, draw) {
    const amp = this.shake;
    const x = amp > 0 ? Math.round((cosmeticRandom() * 2 - 1) * amp) : 0;
    const y = amp > 0 ? Math.round((cosmeticRandom() * 2 - 1) * amp) : 0;
    this.shakeOffset = { x, y };
    ctx.save();
    ctx.translate(x, y);
    draw();
    ctx.restore();
  }

  // Hjälpfunktion för centrerad text
  text(ctx, str, y, scale, color) {
    drawText(ctx, str, WIDTH / 2, y, { color, scale, align: 'center' });
  }

  // Vilken panel startmenyn visar: kontroller, eller topplistan varannan period om det finns poster
  get menuView() {
    return this.scores.length > 0 && Math.floor(this.menuT / MENU_PANEL_TIME) % 2 === 1 ? 'scores' : 'controls';
  }

  renderMenu(ctx) {
    this.text(ctx, STR.title, 30, 4, PALETTE.accent);
    this.text(ctx, STR.subtitle, 70, 2, PALETTE.beige);
    if (this.menuView === 'scores') {
      this.renderScores(ctx, 94, -1);
    } else {
      (this.touchMode ? STR.controlsTouch : STR.controls).forEach((line, i) => {
        this.text(ctx, line, 105 + i * 14, 1, PALETTE.cream);
      });
    }
    this.text(ctx, this.touchMode ? STR.pressStartTouch : STR.pressStart, 216, 1, PALETTE.accent);
  }

  // Topplistan: rubrikrad och upp till tio rader. Raden `mark` markeras som ny placering.
  renderScores(ctx, y, mark, rowH = 9) {
    const X = { rank: 76, name: 96, score: 196, level: 244 };
    drawText(ctx, STR.scores.title, WIDTH / 2, y, { color: PALETTE.accent, align: 'center' });
    const hy = y + 11;
    const head = { color: PALETTE.accentDark };
    drawText(ctx, STR.scores.name, X.name, hy, head);
    drawText(ctx, STR.scores.score, X.score, hy, { ...head, align: 'right' });
    drawText(ctx, STR.scores.level, X.level, hy, { ...head, align: 'right' });
    this.scores.forEach((e, i) => {
      const ry = hy + 11 + i * rowH;
      const hot = i === mark;
      const o = { color: hot ? PALETTE.amber : i === 0 ? PALETTE.cream : PALETTE.beige };
      if (hot) drawText(ctx, '→', X.rank - 12, ry, o);
      drawText(ctx, `${i + 1}.`, X.rank, ry, { ...o, align: 'right' });
      drawText(ctx, e.name, X.name, ry, o);
      drawText(ctx, String(e.score), X.score, ry, { ...o, align: 'right' });
      drawText(ctx, String(e.level), X.level, ry, { ...o, align: 'right' });
    });
  }

  renderHud(ctx) {
    // Solid bakgrund under HUD-fälten, så att skott och partiklar aldrig syns i dem
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, WIDTH, HUD_H);
    ctx.fillRect(0, 227, WIDTH, HEIGHT - 227);
    if ((this.boss && !this.boss.done) || pu.TIMED.some((t) => this.effects[t] > 0) || this.effects.shield) {
      ctx.fillRect(0, HUD_H + 1, WIDTH, 10);
    }
    const o = { color: PALETTE.cream };
    drawText(ctx, `${STR.hud.score}: ${this.score}`, 4, 5, o);
    drawText(ctx, `${STR.hud.highscore}: ${Math.max(this.highScore, this.score)}`, 92, 5, { color: PALETTE.beige });
    drawText(ctx, `${STR.hud.lives}: ${this.lives}`, 196, 5, { color: this.lives <= 1 ? PALETTE.bug : PALETTE.cream });
    drawText(ctx, `${STR.hud.level}: ${this.level}`, WIDTH - 4, 5, { ...o, align: 'right' });
    ctx.fillStyle = PALETTE.muted;
    ctx.fillRect(0, HUD_H, WIDTH, 1);
    this.renderContext(ctx);
    if (this.boss) this.boss.renderBar(ctx);
    pu.renderEffectsHud(ctx, this.effects, this.frames);
  }

  // Kontextfönstret: mätare längst ner, med text när Refaktorering är redo
  renderContext(ctx) {
    const y = 229;
    const full = this.context >= CONTEXT_MAX;
    drawText(ctx, STR.hud.context, 4, y, { color: PALETTE.beige });
    const x0 = 50;
    const segW = 7;
    for (let i = 0; i < CONTEXT_MAX; i++) {
      const filled = i < this.context;
      ctx.fillStyle = filled ? (full ? PALETTE.amber : PALETTE.accent) : PALETTE.muted;
      ctx.fillRect(x0 + i * (segW + 1), y, segW, 7);
    }
    if (this.liveRank !== null && !full) {
      drawText(ctx, `${STR.rank.hud} ${this.liveRank}`, WIDTH - 16, y, { color: PALETTE.amber, align: 'right' });
    }
    if (full) {
      const color = Math.floor(this.frames / 20) % 2 === 0 ? PALETTE.amber : PALETTE.cream;
      drawText(ctx, STR.hud.refactorReady, x0 + CONTEXT_MAX * (segW + 1) + 6, y, { color });
    }
  }

  renderEffects(ctx) {
    for (const f of this.fx) {
      const p = f.t / f.dur;
      const bx = p * (WIDTH + 12);
      // Buggarna syns tills strålen har passerat dem
      for (const gh of f.ghosts) if (gh.x + 5 > bx) drawSprite(ctx, gh.sprite, gh.x, gh.y);
      ctx.fillStyle = PALETTE.accent;
      ctx.globalAlpha = 0.35 * (1 - p);
      ctx.fillRect(0, f.y, WIDTH, f.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.amber;
      ctx.fillRect(0, Math.round(f.y + f.h / 2 - 1), Math.min(WIDTH, Math.round(bx)), 2);
      ctx.fillStyle = PALETTE.cream;
      ctx.fillRect(Math.round(bx) - 3, f.y, 3, f.h);
      ctx.fillStyle = PALETTE.amber;
      ctx.fillRect(Math.round(bx) - 6, f.y + 2, 3, f.h - 4);
    }
  }

  renderPlaying(ctx) {
    // Streckad "produktionslinje" strax ovanför spelaren
    ctx.fillStyle = PALETTE.muted;
    for (let x = 0; x < WIDTH; x += 8) ctx.fillRect(x, this.player.y - 3, 4, 1);
    this.shields.render(ctx);
    this.grid.render(ctx);
    if (this.boss) this.boss.render(ctx);
    if (this.heisenbug && this.heisVisible) drawSprite(ctx, 'heis', this.heisenbug.x, this.heisenbug.y);
    this.renderEffects(ctx);
    pu.renderPowerups(ctx, this.powerups);
    for (const b of this.bullets) b.render(ctx);
    for (const b of this.enemyBullets) b.render(ctx);
    this.player.render(ctx);
    this.particles.render(ctx);
    if (this.effects.shield) pu.renderShield(ctx, this.player);
    for (const f of this.floaters) {
      drawText(ctx, f.text, f.x, f.y - f.t * 14, { color: PALETTE.amber, align: 'center' });
    }
  }

  // Splash mitt på skärmen: växer in, står still och blinkar sista fjärdedelen
  renderRankSplash(ctx) {
    const sp = this.rankSplash;
    if (!sp) return;
    if (sp.dur - sp.t < 0.4 && Math.floor(sp.t / 0.07) % 2 === 1) return;
    const scale = sp.t < 0.12 ? 1 : 2;
    const w = textWidth(sp.text, scale);
    const y = 135;
    const x = Math.round((WIDTH - w) / 2) - 6;
    const top = y - 5 - 2 * scale;
    const h = 7 * scale + 8 + 2 * scale;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(x, top, w + 12, h);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillRect(x, top, w + 12, 1);
    ctx.fillRect(x, top + h - 1, w + 12, 1);
    this.text(ctx, sp.text, y, scale, sp.record ? PALETTE.amber : PALETTE.cream);
  }

  renderPaused(ctx) {
    ctx.fillStyle = 'rgba(31, 26, 23, 0.7)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.text(ctx, STR.paused, 95, 3, PALETTE.accent);
    this.text(ctx, this.touchMode ? STR.resumeHintTouch : STR.resumeHint, 135, 1, PALETTE.cream);
  }

  renderGameOver(ctx) {
    this.text(ctx, STR.gameOver, 12, 3, PALETTE.accent);
    this.text(ctx, `${STR.finalScore}: ${this.score}`, 40, 2, PALETTE.cream);
    if (this.scores.length) this.renderScores(ctx, 64, this.lastRank);
    else this.text(ctx, `${STR.hud.highscore}: ${this.highScore}`, 70, 1, PALETTE.beige);
    this.text(ctx, this.touchMode ? STR.restartHintTouch : STR.restartHint, 208, 1, PALETTE.beige);
  }

  // Namninmatning vid nytt rekord: tre tecken i arkadstil
  renderNameEntry(ctx) {
    const ne = this.nameEntry;
    this.text(ctx, STR.newRecord, 24, 3, PALETTE.amber);
    this.text(ctx, `${STR.finalScore}: ${this.score}`, 60, 2, PALETTE.cream);
    this.text(ctx, STR.enterName, 86, 1, PALETTE.beige);
    const step = 40;
    for (let i = 0; i < hs.NAME_LEN; i++) {
      const cx = WIDTH / 2 + (i - (hs.NAME_LEN - 1) / 2) * step;
      const active = i === ne.pos;
      const color = active ? PALETTE.accent : PALETTE.cream;
      drawText(ctx, ne.name[i], cx, 118, { color, scale: 4, align: 'center' });
      ctx.fillStyle = active ? PALETTE.accent : PALETTE.muted;
      ctx.fillRect(cx - 14, 150, 28, 3);
      if (active) {
        // Små trianglar som visar att tecknet kan ändras uppåt och nedåt
        ctx.fillStyle = PALETTE.amber;
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(cx - k, 104 + k, 1 + 2 * k, 1);
          ctx.fillRect(cx - (2 - k), 160 + k, 1 + 2 * (2 - k), 1);
        }
      }
    }
    if (this.touchMode) {
      this.text(ctx, STR.nameHintTouch, 182, 1, PALETTE.beige);
    } else {
      this.text(ctx, STR.nameHint, 178, 1, PALETTE.beige);
      this.text(ctx, STR.nameHintDone, 192, 1, PALETTE.accent);
    }
  }
}
