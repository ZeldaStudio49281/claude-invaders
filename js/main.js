// Startar spelet och kör spel-loopen
import { Game, WIDTH, HEIGHT } from './game.js';
import { initInput, endFrame, setVirtual } from './input.js';
import { initTouchControls } from './touch.js';
import { PAD_SIDE_W, PAD_BOTTOM_H } from './config.js';

const canvas = document.getElementById('game');
const app = document.getElementById('app');
const root = document.documentElement;
const ctx = canvas.getContext('2d');
canvas.width = WIDTH;
canvas.height = HEIGHT;

initInput();
const game = new Game();
window.__game = game; // krok för e2e-testerna (tests/e2e)
const buttons = initTouchControls();

// Skalan räknas i hela enhetspixlar (devicePixelRatio), så att varje spelpixel blir lika stor och skarp
// även på mobiler där CSS-skalan inte blir ett heltal. Får inget plats blir skalan under 1 hellre än
// att canvasen hamnar utanför skärmen. Touchknapparna tar plats bredvid/under canvasen.
function resize() {
  const cs = getComputedStyle(app);
  let w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (root.classList.contains('touch')) {
    if (window.matchMedia('(orientation: portrait)').matches) h -= PAD_BOTTOM_H;
    else w -= 2 * PAD_SIDE_W;
  }
  const fit = Math.min(w / WIDTH, h / HEIGHT);
  const dpr = window.devicePixelRatio || 1;
  const devFit = Math.floor(fit * dpr);
  const scale = devFit >= 1 ? devFit / dpr : Math.max(0.1, fit);
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
  ctx.imageSmoothingEnabled = false; // återställs ibland vid ändrad storlek
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// Touchläge: (pointer: coarse) eller första touch-händelsen slår på knapparna
function setTouch(on) {
  if (root.classList.contains('touch') === on) return;
  root.classList.toggle('touch', on);
  game.touchMode = on;
  resize();
}
const coarse = window.matchMedia('(pointer: coarse)');
setTouch(coarse.matches);
coarse.addEventListener?.('change', (e) => { if (e.matches) setTouch(true); });
window.addEventListener('touchstart', () => setTouch(true), { passive: true });
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); }, true);
resize();

// Ett tryck på canvasen startar spelet i menyn och på game over-skärmen
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  setVirtual('tap', true);
});
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => setVirtual('tap', false));
for (const el of [canvas, ...document.querySelectorAll('.pad')]) {
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Autopaus när fliken eller fönstret tappar fokus. Spelaren återupptar själv.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') game.autoPause();
});
window.addEventListener('blur', () => game.autoPause());

// Speglar spelets tillstånd till DOM: knapparna byter läge i namninmatningen
let shownState = '';
let shownMuted = null;
function syncDom() {
  if (game.state !== shownState) {
    shownState = game.state;
    document.body.dataset.state = shownState;
  }
  if (game.muted !== shownMuted) {
    shownMuted = game.muted;
    buttons.mute.setAttribute('aria-pressed', String(shownMuted));
    buttons.mute.classList.toggle('off', shownMuted);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); // max 0,1 s
  last = now;
  game.update(dt);
  game.render(ctx);
  syncDom();
  endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
