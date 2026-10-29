// Topplista (topp 10) i localStorage. Klarar saknad eller korrupt data och lagring som kastar.
const KEY = 'buggjakten.highscores';
const NAME_KEY = 'buggjakten.lastName';
export const MAX_SCORES = 10;
export const NAME_LEN = 3;
export const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ0123456789 ';
export const DEFAULT_NAME = 'AAA';

// Gör om valfritt värde till ett giltigt namn på exakt NAME_LEN tecken (eller null)
export function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = [...v.toUpperCase()].filter((c) => NAME_CHARS.includes(c) || c === '-').slice(0, NAME_LEN).join('');
  return s.padEnd(NAME_LEN, ' ');
}

function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const score = Math.floor(Number(e.score));
  if (!Number.isFinite(score) || score < 0) return null;
  const level = Math.floor(Number(e.level));
  return {
    name: cleanName(e.name) ?? '   ',
    score,
    level: Number.isFinite(level) && level > 0 ? level : 1,
    date: typeof e.date === 'string' ? e.date.slice(0, 10) : '',
  };
}

// Sorterar fallande (stabilt) och kapar till topp 10
function normalize(list) {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || a.i - b.i)
    .map((x) => x.e)
    .slice(0, MAX_SCORES);
}

export function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(data)) return [];
    return normalize(data.map(cleanEntry).filter(Boolean));
  } catch {
    return []; // saknad, korrupt eller blockerad lagring
  }
}

export function saveScores(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // privat läge: listan finns kvar i minnet under sessionen
  }
}

export function clearScores() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignorera */ }
}

// Kvalar poängen in på topp 10?
export function qualifies(list, score) {
  return score > 0 && (list.length < MAX_SCORES || score > list[list.length - 1].score);
}

// Lägger in en post. Returnerar { list, index } där index är placeringen (-1 om den föll bort).
export function insertScore(list, entry) {
  const clean = cleanEntry(entry);
  if (!clean) return { list, index: -1 };
  // Vid lika poäng hamnar den nya under de gamla
  const at = list.findIndex((e) => e.score < clean.score);
  const next = list.slice();
  next.splice(at === -1 ? next.length : at, 0, clean);
  const out = next.slice(0, MAX_SCORES);
  return { list: out, index: out.indexOf(clean) };
}

export function loadLastName() {
  try {
    return cleanName(localStorage.getItem(NAME_KEY)) ?? DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export function saveLastName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch { /* ignorera */ }
}
