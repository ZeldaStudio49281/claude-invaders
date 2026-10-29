// Pixel art som strängmatriser. Varje sprite renderas en gång till en offscreen-canvas och cachas.
import { PALETTE } from './palette.js';

// Teckentabell: tecken -> färg ('.' = genomskinlig)
const COLORS = {
  o: PALETTE.accent,
  d: PALETTE.accentDark,
  c: PALETTE.cream,
  r: PALETTE.bug,
  k: PALETTE.bugDark,
  a: PALETTE.amber,
  b: PALETTE.beige,
  C: PALETTE.cream,
  m: PALETTE.muted,
  g: PALETTE.pass,
};

export const SPRITES = {
  // Claudes stjärna/solfjäder (11x11)
  player: [
    '.....o.....',
    '.d...o...d.',
    '..d.ooo.d..',
    '...ooooo...',
    '.ooooooooo.',
    'oooooCooooo',
    '.ooooooooo.',
    '...ooooo...',
    '..d.ooo.d..',
    '.d...o...d.',
    '.....o.....',
  ],
  // Bugg: skalbagge sedd uppifrån med glitchpixlar, två frames för benanimation (11x9)
  bug0: [
    '..a.....a..',
    '...a...a...',
    '...kakak...',
    'k..rrkrr..k',
    '.k.rckrr.k.',
    'k.rrrkrrr.k',
    '..rrrkrrr..',
    '.k.rrkrr.k.',
    'k...rkr...k',
  ],
  bug1: [
    '...a...a...',
    '..a.....a..',
    '...kakak...',
    '.k.rrkrr.k.',
    'k..rrkcr..k',
    '.krrrkrrrk.',
    'k.rrrkrrr.k',
    '..k.rkr.k..',
    '.k..rkr..k.',
  ],
  // Null-pekare: orange spindel/fästing med ett "∅"-hål i ryggen (11x9)
  null0: [
    '.o.......o.',
    'o..ooooo..o',
    '.o.odddo.o.',
    'o..d.a.d..o',
    '.o.odddo.o.',
    'o..ooooo..o',
    '..o.ooo.o..',
    '.o...o...o.',
    'o.........o',
  ],
  null1: [
    'o.........o',
    '.o.ooooo.o.',
    'o..odddo..o',
    '.o.d.a.d.o.',
    'o..odddo..o',
    '.o.ooooo.o.',
    '..o.ooo.o..',
    'o...o.o...o',
    '.o.......o.',
  ],
  // Minnesläcka: droppformad bladlus/larv som läcker en droppe (11x9)
  leak0: [
    '...a...a...',
    '....aaa....',
    '...aabaa...',
    '..aaaaaaa..',
    'a.aaadaaa.a',
    '.aaaaaaaaa.',
    '..aaaaaaa..',
    '....aaa....',
    '.....a.....',
  ],
  leak1: [
    '...a...a...',
    '....aaa....',
    '...aabaa...',
    '..aaaaaaa..',
    '.aaaadaaaa.',
    'a.aaaaaaa.a',
    '..aaaaaaa..',
    '....aaa....',
    '.....b.....',
  ],
  // Liten läcka efter delning (7x6), samma formspråk
  leakS0: [
    '..a.a..',
    '..aaa..',
    '.aabaa.',
    'a.aaa.a',
    '..aaa..',
    '...a...',
  ],
  leakS1: [
    '..a.a..',
    '..aaa..',
    '.aabaa.',
    'a.aaa.a',
    '...a...',
    '...b...',
  ],
  // Race condition: krämvit tvestjärt (huvud med ögon och antenner, bröst med ben, bakkropp och tång)
  // med en förskjuten orange glitch-skugga (11x9)
  race0: [
    '.c.......c.',
    '..c.....c..',
    '...ckckc...',
    '.c.ccccc.c.',
    'c..ccccc..c',
    '.cocccccoc.',
    '..occcccoo.',
    '...cc.cc...',
    '..cc...cc..',
  ],
  race1: [
    '.c.......c.',
    '..c.....c..',
    '...ckckc...',
    'c..ccccc..c',
    '.c.ccccc.c.',
    'c.occcccoc.',
    '..occcccoo.',
    '..cc.c.cc..',
    '.cc.....cc.',
  ],
  // Heisenbugg: blek bagge med frågetecken (11x9)
  heis: [
    '..b.....b..',
    '...bbbbb...',
    '..bbcccbb..',
    '.bbbbbccbb.',
    '.bbbbccbbb.',
    '.bbbbcbbbb.',
    '..bbbbbbb..',
    '..bbbcbbb..',
    '...b...b...',
  ],
  // Spelarens skott: token (3x6)
  token: [
    '.c.',
    'cbc',
    'cbc',
    '.o.',
    '.o.',
    '.d.',
  ],
  // Fiendeskott: felmeddelanden, "!" (3x6) och "×" (5x5)
  err0: [
    'rrr',
    'rar',
    '.r.',
    '.r.',
    '...',
    '.a.',
  ],
  err1: [
    'r...r',
    '.r.r.',
    '..a..',
    '.r.r.',
    'r...r',
  ],
  // Power-ups: 8x8 kapslar med krämvit ram och en symbol per typ
  pu_think: [ // timglas
    '.cccccc.',
    'caaaaaac',
    'cmaaaamc',
    'cmmaammc',
    'cmmaammc',
    'cmaaaamc',
    'caaaaaac',
    '.cccccc.',
  ],
  pu_tool: [ // solfjäder: tre strålar
    '.cccccc.',
    'commmmoc',
    'cmommomc',
    'cmmoommc',
    'cmmoommc',
    'cmmoommc',
    'cmmoommc',
    '.cccccc.',
  ],
  pu_shield: [ // sköld
    '.cccccc.',
    'cggggggc',
    'cggggggc',
    'cggggggc',
    'cmggggmc',
    'cmmggmmc',
    'cmmmmmmc',
    '.cccccc.',
  ],
  pu_review: [ // pil som går igenom en linje
    '.cccccc.',
    'cmmCCmmc',
    'cmCCCCmc',
    'caaCCaac',
    'cmmooomc',
    'cmmoommc',
    'cmmoommc',
    '.cccccc.',
  ],
  pu_life: [ // hjärta
    '.cccccc.',
    'cmrmmrmc',
    'crrrrrrc',
    'crrrrrrc',
    'cmrrrrmc',
    'cmmrrmmc',
    'cmmmmmmc',
    '.cccccc.',
  ],
  // Bossskott: runda "orbs" (5x5), tydligt olika de smala felmeddelandena
  orb0: [
    '.ooo.',
    'oaaao',
    'oaaao',
    'oaaao',
    '.ooo.',
  ],
  orb1: [
    '.ddd.',
    'dcaco',
    'dacao',
    'dcaco',
    '.ooo.',
  ],
  // Genomträngande token (Kodgranskning): ljusare och längre än det vanliga skottet
  tokenP: [
    '.a.',
    'aca',
    'aca',
    'aca',
    '.a.',
    '.o.',
  ],
  // Den oändliga loopen: ringsegment (7x7) och kärna (13x13)
  loopSeg0: [
    '.ooooo.',
    'occoood',
    'ocooood',
    'ooooood',
    'ooooood',
    'doooodd',
    '.ddddd.',
  ],
  loopSeg1: [
    '.bbbbb.',
    'bbccbbd',
    'bcbbbbd',
    'bbbbbbd',
    'bbbbbbd',
    'dbbbbdd',
    '.ddddd.',
  ],
  loopCore0: [
    '....kkkkk....',
    '..kkrrrrrkk..',
    '.krrrrrrrrrk.',
    '.krrraaarrrk.',
    'krrraaaaarrrk',
    'krraaakaaarrk',
    'krraakkkaarrk',
    'krraaakaaarrk',
    'krrraaaaarrrk',
    '.krrraaarrrk.',
    '.krrrrrrrrrk.',
    '..kkrrrrrkk..',
    '....kkkkk....',
  ],
  loopCore1: [
    '....kkkkk....',
    '..kkrrrrrkk..',
    '.krrrrrrrrrk.',
    '.krrrcccrrrk.',
    'krrrcaaacrrrk',
    'krrcaakaaacrk',
    'krrcakkkaacrk',
    'krrcaakaaacrk',
    'krrrcaaacrrrk',
    '.krrrcccrrrk.',
    '.krrrrrrrrrk.',
    '..kkrrrrrkk..',
    '....kkkkk....',
  ],
  // Ljudikoner (9x7) för hörnet längst ner till höger
  sndOn: [
    '...b...b.',
    '..bb.b..b',
    'bbbb..b.b',
    'bbbb..b.b',
    'bbbb..b.b',
    '..bb.b..b',
    '...b...b.',
  ],
  sndOff: [
    '...b.....',
    '..bb.r..r',
    'bbbb..rr.',
    'bbbb..rr.',
    'bbbb..rr.',
    '..bb.r..r',
    '...b.....',
  ],
};

// Genererade sprites: träffvarianter (allt blir krämvitt) och sköldringen runt spelaren (17x17)
for (const n of ['loopSeg0', 'loopSeg1', 'loopCore0', 'loopCore1']) {
  SPRITES[n + 'Hit'] = SPRITES[n].map((r) => r.replace(/[^.]/g, 'c'));
}
SPRITES.shieldRing = Array.from({ length: 17 }, (_, y) => Array.from({ length: 17 }, (_, x) => {
  const d = Math.hypot(x - 8, y - 8);
  if (d < 7.4 || d > 8.6) return '.';
  return (Math.round((Math.atan2(y - 8, x - 8) + Math.PI) * 4) % 2) ? 'g' : 'c';
}).join(''));

const cache = new Map();

// Hämta (och vid första anropet rendera) en sprite som canvas
export function getSprite(name) {
  let cv = cache.get(name);
  if (cv) return cv;
  const rows = SPRITES[name];
  cv = document.createElement('canvas');
  cv.width = rows[0].length;
  cv.height = rows.length;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = COLORS[row[x]];
      if (color) {
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
  });
  cache.set(name, cv);
  return cv;
}

export function spriteSize(name) {
  const rows = SPRITES[name];
  return { w: rows[0].length, h: rows.length };
}

// Rita sprite med övre vänstra hörnet i (x, y), avrundat till hela pixlar
export function drawSprite(ctx, name, x, y) {
  ctx.drawImage(getSprite(name), Math.round(x), Math.round(y));
}

// Rita sprite centrerad i en box {x, y, w, h}
export function drawSpriteIn(ctx, name, box) {
  const { w, h } = spriteSize(name);
  drawSprite(ctx, name, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2);
}
