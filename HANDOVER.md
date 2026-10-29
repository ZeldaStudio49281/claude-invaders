# Handover – Buggjakten (claude-invaders)

Senast uppdaterad: 2026-10-29

## Läge just nu

- **Fas 1–7 är klara** enligt [`PLAN.md`](PLAN.md). Spelet är publicerat på https://zeldastudio49281.github.io/claude-invaders/ (repot är publikt, Pages från `main` / root).
- Spelet är provat i emulerade webbläsare via Playwright, men inte på riktiga mobiler eller i en riktig Safari. Ljudet är inte provlyssnat.
- **E2E-tester (Playwright)** finns i `tests/e2e/`. Spelet exponerar `window.__game` och `__game.debug` för deterministiska tester.
  - `npm test` kör bara Chromium (cirka 1 min, 186 tester). **Det är standard.**
  - `npm run test:all` kör även Firefox, WebKit och mobil-Safari (över 10 min, WebKit har varit flakigt). Kör bara den när användaren ber om det.
- Bilderna `og-image.png` och `apple-touch-icon.png` genereras med `npm run assets`.
- Terminalen kan ha gammal PATH. Läs i så fall om den från registret före `node`/`npx`.
- Nästa steg: provspela på riktiga enheter, provlyssna ljudet och justera svårighetsgraden.

## Bakgrund

Användaren bad först om en ”Space Invaders-klon med Claude-tema”. Vi kom överens om att bygga ett **eget spel i samma genre (fixed shooter)** och inte en kopia av Space Invaders. Det innebär inga utomjordingar, inget UFO-moderskepp och inga bunkrar som i originalet. Spelet har eget tema, egen grafik och egna mekaniker, till exempel Kontextfönstret/Refaktorering, testsviter som skydd, buggar som fiender och egna bossar. Håll fast vid det när du designar grafik och mekanik.

## Beslut från användaren

| Fråga | Svar |
|---|---|
| Teknik | Vanilla JS + Canvas, inget byggsteg, inga beroenden |
| Stil | Pixel art i Claudes färger |
| Fiender | Buggar i koden |
| Funktioner i v1 | Highscore (localStorage), ljud och musik (Web Audio), touchstöd, power-ups och bossar |
| Språk | Allt i spelet på svenska |
| Hosting | GitHub Pages, statisk sida |

Spelets namn, namnen på fiender och power-ups samt poängvärdena är förslag. Användaren har inte ändrat dem än.

## Tekniska riktlinjer

- ES-moduler (`<script type="module">`) med **relativa sökvägar**. Sidan ligger under `/claude-invaders/` på GitHub Pages.
- Fast intern upplösning (t.ex. 320×240) som skalas pixelperfekt (`image-rendering: pixelated`).
- Sprites ritas i kod från pixelmatriser och ljud genereras med Web Audio. Inga externa resursfiler behövs.
- Ljudet får startas först efter användarens första interaktion, eftersom webbläsarna kräver det.
- Alla svenska texter samlas i `js/strings.js`.
- Obs: ES-moduler fungerar inte via `file://`. Testa lokalt med en enkel server, t.ex. `npx serve .` eller `python -m http.server`.

## Att göra för den som tar över

1. Läs `PLAN.md`.
2. Börja med Fas 1 och bocka av uppgifterna (`- [x]`) i `PLAN.md` när de är klara.
3. Committa och pusha bara när användaren ber om det.
4. Aktivera GitHub Pages (Settings → Pages → `main` / root) i Fas 7.

## Git

- Remote: `https://github.com/ZeldaStudio49281/claude-invaders.git`
- Gren: `main`
- `PLAN.md` och `HANDOVER.md` är inte committade än.
