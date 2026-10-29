// Touchknappar: HTML-knappar som anropar setVirtual() via pointer events (klarar multitouch).
// Etiketterna ritas med spelets pixeltypsnitt och kommer från strings.js.
import { STR } from './strings.js';
import { PALETTE } from './palette.js';
import { drawText, textWidth, GLYPH_H } from './font.js';
import { setVirtual } from './input.js';

const LABEL_TOP = 2; // font.js ritar accenter två rader ovanför basraden

// pad: vilken behållare knappen hamnar i. mode: 'play' (spel och menyer) eller 'name' (namninmatning)
const BUTTONS = [
  { id: 'pause', pad: 'menu', actions: ['pause'], small: true },
  { id: 'mute', pad: 'menu', actions: ['mute'], small: true },
  { id: 'left', pad: 'left', actions: ['left'] },
  { id: 'right', pad: 'left', actions: ['right'] },
  { id: 'fire', pad: 'right', actions: ['fire'], mode: 'play', wide: true },
  { id: 'special', pad: 'right', actions: ['special'], mode: 'play', wide: true },
  { id: 'up', pad: 'right', actions: ['up'], mode: 'name' },
  { id: 'down', pad: 'right', actions: ['down'], mode: 'name' },
  { id: 'confirm', pad: 'right', actions: ['confirm'], mode: 'name' },
];

function labelCanvas(text) {
  const LABEL_SCALE = text.length <= 2 && text !== 'OK' ? 4 : 2; // pilarna får större tecken
  const cv = document.createElement('canvas');
  const w = textWidth(text, LABEL_SCALE);
  const h = (GLYPH_H + LABEL_TOP) * LABEL_SCALE;
  cv.width = w;
  cv.height = h;
  cv.className = 'label';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.aspectRatio = `${w} / ${h}`;
  cv.style.width = `${w}px`;
  drawText(cv.getContext('2d'), text, 0, LABEL_TOP * LABEL_SCALE, { color: PALETTE.cream, scale: LABEL_SCALE });
  return cv;
}

function bindButton(el, actions) {
  const ids = new Set(); // aktiva pekare på knappen (flera fingrar på samma knapp räknas som en)
  const set = (on) => {
    for (const a of actions) setVirtual(a, on);
    el.classList.toggle('down', on);
  };
  const release = (e) => {
    if (!ids.delete(e.pointerId)) return;
    if (ids.size === 0) set(false);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* syntetiska pekare saknar capture */ }
    const first = ids.size === 0;
    ids.add(e.pointerId);
    if (first) set(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) {
    el.addEventListener(type, release);
  }
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('dragstart', (e) => e.preventDefault());
}

// Bygger knapparna i behållarna som finns i index.html
export function initTouchControls() {
  const pads = {};
  for (const name of ['menu', 'left', 'right']) pads[name] = document.getElementById(`pad-${name}`);
  pads.menu.setAttribute('aria-label', STR.touch.groupMenu);
  pads.left.setAttribute('aria-label', STR.touch.groupMove);
  pads.right.setAttribute('aria-label', STR.touch.groupAction);
  const els = {};
  for (const b of BUTTONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = `btn-${b.id}`;
    el.className = ['pad-btn', b.small ? 'small' : '', b.wide ? 'wide' : '', b.mode ? `mode-${b.mode}` : ''].join(' ').trim();
    el.setAttribute('aria-label', STR.touch[b.id].aria);
    el.appendChild(labelCanvas(STR.touch[b.id].label));
    bindButton(el, b.actions);
    pads[b.pad].appendChild(el);
    els[b.id] = el;
  }
  return els;
}
