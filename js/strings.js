// Alla texter i spelet ska samlas här. Lägg inte in hårdkodad text i andra filer.

export const STR = Object.freeze({
  title: 'Buggjakten',
  subtitle: 'Claude mot buggarna',
  pressStart: 'Tryck på mellanslag för att starta',
  paused: 'Paus',
  resumeHint: 'Tryck på P eller Esc för att fortsätta',
  gameOver: 'Spelet är slut',
  finalScore: 'Poäng', // visas som "Poäng: 1234"
  restartHint: 'Tryck på mellanslag för att spela igen',
  hud: Object.freeze({ score: 'Poäng', lives: 'Liv', level: 'Nivå', highscore: 'Rekord', context: 'Kontext', refactorReady: 'Refaktorering redo! Tryck Shift' }),
  powerups: Object.freeze({
    think: 'Extended thinking',
    tool: 'Tool use',
    shield: 'Konstitution',
    review: 'Kodgranskning',
    life: 'Extra kontext',
  }),
  boss: Object.freeze({
    loop: 'Den oändliga loopen',
    stack: 'Stack Overflow-monstret',
  }),
  pressStartTouch: 'Tryck på skärmen för att starta',
  restartHintTouch: 'Tryck på skärmen för att spela igen',
  resumeHintTouch: 'Tryck på Paus för att fortsätta',
  newRecord: 'Nytt rekord!',
  enterName: 'Skriv dina initialer',
  nameHint: 'Skriv eller använd piltangenterna',
  nameHintDone: 'Enter eller mellanslag: klar',
  nameHintTouch: 'Välj med pilarna och tryck OK',
  noName: '---', // sparas om inga tecken valts
  scores: Object.freeze({ title: 'Topplista', name: 'Namn', score: 'Poäng', level: 'Nivå' }),
  // Touchknappar: label ritas med pixeltypsnittet, aria är den tillgängliga etiketten
  touch: Object.freeze({
    left: Object.freeze({ label: '←', aria: 'Flytta åt vänster' }),
    right: Object.freeze({ label: '→', aria: 'Flytta åt höger' }),
    fire: Object.freeze({ label: 'Skjut', aria: 'Skjut' }),
    special: Object.freeze({ label: 'Refakt', aria: 'Refaktorering' }),
    pause: Object.freeze({ label: 'Paus', aria: 'Paus eller fortsätt' }),
    mute: Object.freeze({ label: 'Ljud', aria: 'Ljud av eller på' }),
    up: Object.freeze({ label: '↑', aria: 'Nästa tecken' }),
    down: Object.freeze({ label: '↓', aria: 'Föregående tecken' }),
    confirm: Object.freeze({ label: 'OK', aria: 'Bekräfta' }),
    groupMove: 'Rörelse',
    groupAction: 'Handlingar',
    groupMenu: 'Meny',
  }),
  controlsTouch: Object.freeze([
    '← →  Flytta',
    'Skjut  Skjut',
    'Refakt  Refaktorering',
    'Paus  Paus',
    'Ljud  Ljud av/på',
  ]),
  controls: Object.freeze([ // rader som visas i startmenyn
    '← → / A D  Flytta',
    'Mellanslag  Skjut',
    'Shift  Refaktorering',
    'P / Esc  Paus',
    'M  Ljud av/på',
  ]),
});
