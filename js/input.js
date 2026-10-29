// Tangentbordsindata mappat till abstrakta handlingar

const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'fire',
  ShiftLeft: 'special',
  ShiftRight: 'special',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

const down = new Set();     // handlingar som hålls nere
const pressed = new Set();  // handlingar som trycktes ner denna frame
const typed = [];             // tecken som skrivits denna frame (versaler, '\b' = backsteg)
const fromText = new Set();   // handlingar som utlöstes av en bokstavstangent denna frame
const heldCodes = new Set();  // tangenter som hålls nere (för auto-repeat-filter)

// Sätt en handling (används även av touchknappar i Fas 6)
export function setVirtual(action, isDown) {
  if (isDown) {
    if (!down.has(action)) pressed.add(action);
    down.add(action);
  } else {
    down.delete(action);
  }
}

// Som wasPressed, men bara om handlingen inte kom från en bokstavstangent (A/D/W/S).
// Används vid namninmatning där bokstäverna skrivs in direkt och bara piltangenter/knappar navigerar.
export function wasPressedNav(action) {
  return pressed.has(action) && !fromText.has(action);
}

// Tecken som skrivits sedan förra framen (A-Z, Å, Ä, Ö, 0-9 i versaler, '\b' för backsteg)
export function typedChars() {
  return typed.slice();
}

export function isDown(action) {
  return down.has(action);
}

export function wasPressed(action) {
  return pressed.has(action);
}

// Rensa "pressed" i slutet av varje frame
export function endFrame() {
  pressed.clear();
  fromText.clear();
  typed.length = 0;
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.code];
    // Backspace används i namninmatningen och får inte låta webbläsaren gå bakåt (äldre Safari)
    if (action || e.key === 'Backspace') e.preventDefault();
    if (e.repeat || heldCodes.has(e.code)) return;
    heldCodes.add(e.code);
    const isText = !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-zåäö0-9]$/i.test(e.key);
    if (isText) typed.push(e.key.toUpperCase());
    else if (e.key === 'Backspace') typed.push('\b');
    if (action) {
      if (isText) fromText.add(action);
      setVirtual(action, true);
    }
  });

  window.addEventListener('keyup', (e) => {
    heldCodes.delete(e.code);
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    // Behåll handlingen om en annan tangent för samma handling hålls nere
    const stillHeld = Object.keys(KEY_MAP).some(
      (code) => KEY_MAP[code] === action && heldCodes.has(code)
    );
    if (!stillHeld) setVirtual(action, false);
  });

  // Släpp allt om fönstret tappar fokus eller fliken göms
  const releaseAll = () => {
    heldCodes.clear();
    down.clear();
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseAll();
  });
}
