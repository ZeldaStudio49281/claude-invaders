// Nivådefinitioner och svårighetskurva.
// Nivå 1-10 är definierade för hand, därefter upprepas cykeln med högre svårighet.
// rows: fiendetyp per rad, uppifrån och ner. boss: reserverat för Fas 4 (nivå 5 och 10).
const R = (...types) => types;

const LEVELS = [
  // speed = px/s i sidled, bulletSpeed = fiendeskottens fart, startRow = hur många steg lägre rutnätet startar
  { rows: R('nullptr', 'syntax', 'syntax', 'syntax', 'syntax'), cols: 8, speed: 22, bulletSpeed: 75, startRow: 0, shoot: [0.6, 1.4], maxBullets: 3, boss: null },
  { rows: R('leak', 'nullptr', 'syntax', 'syntax', 'syntax'), cols: 8, speed: 26, bulletSpeed: 78, startRow: 1, shoot: [0.56, 1.3], maxBullets: 4, boss: null },
  { rows: R('race', 'leak', 'nullptr', 'syntax', 'syntax'), cols: 8, speed: 30, bulletSpeed: 82, startRow: 1, shoot: [0.52, 1.2], maxBullets: 4, boss: null },
  { rows: R('race', 'leak', 'nullptr', 'nullptr', 'syntax'), cols: 8, speed: 34, bulletSpeed: 86, startRow: 2, shoot: [0.48, 1.1], maxBullets: 5, boss: null },
  { rows: R('race', 'race', 'leak', 'nullptr', 'syntax'), cols: 8, speed: 37, bulletSpeed: 90, startRow: 2, shoot: [0.45, 1.05], maxBullets: 5, boss: 'loop' }, // bossnivå (Fas 4)
  { rows: R('race', 'leak', 'leak', 'nullptr', 'nullptr'), cols: 8, speed: 40, bulletSpeed: 94, startRow: 3, shoot: [0.42, 1.0], maxBullets: 5, boss: null },
  { rows: R('race', 'race', 'leak', 'leak', 'nullptr', 'syntax'), cols: 8, speed: 43, bulletSpeed: 98, startRow: 3, shoot: [0.4, 0.95], maxBullets: 6, boss: null },
  { rows: R('race', 'leak', 'leak', 'nullptr', 'nullptr', 'syntax'), cols: 8, speed: 46, bulletSpeed: 102, startRow: 4, shoot: [0.37, 0.9], maxBullets: 6, boss: null },
  { rows: R('race', 'race', 'leak', 'nullptr', 'nullptr', 'nullptr'), cols: 8, speed: 49, bulletSpeed: 106, startRow: 4, shoot: [0.35, 0.85], maxBullets: 6, boss: null },
  { rows: R('race', 'race', 'leak', 'leak', 'nullptr', 'nullptr'), cols: 8, speed: 52, bulletSpeed: 110, startRow: 5, shoot: [0.33, 0.8], maxBullets: 6, boss: 'stack' }, // bossnivå (Fas 4)
];

export const CYCLE_LENGTH = LEVELS.length;
const START_Y = 24;
const ROW_STEP = 8;

export function levelConfig(level) {
  const idx = (level - 1) % CYCLE_LENGTH;
  const cycle = Math.floor((level - 1) / CYCLE_LENGTH);
  const d = LEVELS[idx];
  const fast = 1 + 0.3 * cycle;
  const startRow = Math.min(d.startRow + cycle, 6);
  return {
    level,
    cycle,
    boss: d.boss,
    rowTypes: d.rows,
    rows: d.rows.length,
    cols: d.cols,
    startRow,
    startY: START_Y + startRow * ROW_STEP,
    baseSpeed: d.speed * fast,
    bulletSpeed: d.bulletSpeed * (1 + 0.12 * cycle),
    shootMin: Math.max(0.2, d.shoot[0] * 0.85 ** cycle),
    shootMax: Math.max(0.45, d.shoot[1] * 0.85 ** cycle),
    maxEnemyBullets: Math.min(d.maxBullets + cycle, 8),
  };
}
