# Buggjakten – Claude mot buggarna

Buggjakten är ett eget pixel art-skjutspel (fixed shooter) med Claude-tema. Du styr Claudes stjärnsymbol längst ner på skärmen och försvarar kodbasen mot vågor av buggar som sjunker nedåt.

## Spela

Spelet körs i webbläsaren: **https://zeldastudio49281.github.io/claude-invaders/**

## Kontroller

| Handling | Tangentbord | Touch |
|---|---|---|
| Flytta | `←` `→` / `A` `D` | Vänster- och högerknapp på skärmen |
| Skjut | `Mellanslag` | Knappen Skjut |
| Refaktorering | `Shift` | Knappen Refakt |
| Paus | `P` / `Esc` | Knappen Paus |
| Ljud av/på | `M` | Knappen Ljud |

Touchknapparna visas bara på touchenheter. I namnregistreringen för highscore används piltangenterna och `Enter`.

## Spelmekanik

- **Spelaren:** Claudes stjärnsymbol rör sig i sidled och skjuter uppåt. Du börjar med 3 liv.
- **Fiendevågor:** Buggarna rör sig i ett rutnät som byter riktning och sjunker när det når kanten. De skjuter nedåt.
- **Kontextfönstret:** En mätare längst ner fylls när du träffar buggar i följd. Ett missat skott nollställer den. När mätaren är full kan du trycka `Shift` för Refaktorering, som rensar en rad buggar.
- **Testsviter:** Block av små celler som absorberar skott och buggar och sakta går sönder. De byggs upp igen varje nivå.
- **Förlust:** Spelet är slut när alla liv är slut eller när en bugg når botten av skärmen.

### Fiendetyper

| Fiende | Beteende | Poäng |
|---|---|---|
| Syntaxfel | Grundfiende, rör sig i rutnätet | 10 |
| Null-pekare | Skjuter oftare än övriga | 20 |
| Minnesläcka | Delar sig i två mindre läckor när den träffas (15 poäng vardera) | 30 |
| Race condition | Byter plats med en annan bugg eller hoppar till en tom ruta | 40 |
| Heisenbugg (bonus) | Dyker upp mellan rutnätet och spelaren och flimrar i några sekunder | 100–500 |

Heisenbuggen ger mer poäng ju snabbare du träffar den: 500 poäng i början, minskande med 100 för varje femtedel av dess livstid.

### Power-ups

Besegrade buggar släpper ibland power-ups som faller nedåt. Om du tar en tidsbegränsad effekt igen förlängs den, upp till dubbla ordinarie tid.

| Power-up | Effekt |
|---|---|
| Extended thinking | Fiender och fiendeskott går i halv fart i 5 sekunder |
| Tool use | Trippelskott i 8 sekunder |
| Konstitution | Sköld som tål en träff |
| Kodgranskning | Genomträngande skott i 6 sekunder |
| Extra kontext | +1 liv |

### Bossar

- **Nivå 5 – Den oändliga loopen:** En roterande ring som skjuter i cirkelmönster. Den har flera faser.
- **Nivå 10 – Stack Overflow-monstret:** Ett torn av staplade block. Varje block måste skjutas bort, och tornet staplar nya block ovanpå sig. Når tornet produktionslinjen är spelet slut.

Efter nivå 10 börjar cykeln om med högre svårighet: snabbare buggar och tåligare bossar.

## Teknik

- Vanilla JavaScript med ES-moduler och HTML5 Canvas.
- Inget byggsteg och inga beroenden i spelet självt. Utvecklingsberoenden (Playwright och serve) används bara för tester och lokal server.
- Grafiken är pixel art som definieras i kod och ritas till canvas. Ljudet (ljudeffekter och chiptune-musik) genereras med Web Audio API.
- Highscore sparas i webbläsarens localStorage.

## Köra lokalt

```bash
npm install
npm start
```

Öppna sedan http://localhost:8000 i webbläsaren.

ES-moduler fungerar inte via `file://`, så spelet måste köras via servern.

## Tester

End-to-end-tester med Playwright ligger i `tests/e2e/`. Kör dem med:

```bash
npm test
```

Första gången behöver du installera webbläsarna för Playwright:

```bash
npx playwright install
```

## Filstruktur

```
claude-invaders/
├── index.html          # Startsida med canvas och UI-element
├── style.css           # Layout, responsivitet och touchknappar
├── js/
│   ├── main.js         # Startar spelet och kör spel-loopen
│   ├── game.js         # Spelets tillstånd: meny, spel, paus, game over
│   ├── input.js        # Tangentbord
│   ├── touch.js        # Touchknappar på skärmen
│   ├── player.js       # Spelaren
│   ├── enemies.js      # Buggar, rutnätsrörelse och fiendetyper
│   ├── boss.js         # Bossarna
│   ├── projectiles.js  # Skott
│   ├── powerups.js     # Power-ups
│   ├── shields.js      # Testsviter
│   ├── levels.js       # Nivådefinitioner och svårighetskurva
│   ├── sprites.js      # Pixel art som strängmatriser
│   ├── font.js         # Eget bitmap-typsnitt
│   ├── palette.js      # Claudes färgpalett
│   ├── particles.js    # Explosioner och effekter
│   ├── audio.js        # Ljudeffekter och musik via Web Audio API
│   ├── highscore.js    # Topplista i localStorage
│   ├── rng.js          # Slumpgenerator
│   ├── config.js       # Gemensamma konstanter
│   └── strings.js      # Alla svenska texter
├── tests/e2e/          # Playwright-tester
├── package.json
├── playwright.config.js
├── PLAN.md
└── README.md
```
