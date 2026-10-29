// Seedbar slumpgenerator (mulberry32). All slump i spelet ska gå via den här filen.
let state = (Date.now() ^ 0x9e3779b9) >>> 0;

export function seed(n) {
  state = n >>> 0;
}

// Slumptal i [0, 1)
export function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Slumptal i [min, max)
export function range(min, max) {
  return min + random() * (max - min);
}

// Heltal i [0, n)
export function int(n) {
  return Math.floor(random() * n);
}
