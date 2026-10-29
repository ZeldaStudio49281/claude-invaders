# Buggjakten – Claude mot buggarna

Ett eget pixel art-skjutspel (fixed shooter) med Claude-tema. Spelaren styr Claudes stjärnsymbol längst ner på skärmen och försvarar kodbasen mot vågor av buggar som rör sig nedåt. Spelet körs helt i webbläsaren som en statisk sida på GitHub Pages och all text är på svenska.

## Beslut

| Område | Val |
|---|---|
| Teknik | Vanilla JavaScript (ES-moduler) + HTML5 Canvas, inget byggsteg, inga beroenden |
| Stil | Pixel art i Claudes färgpalett (terrakotta/orange, beige, krämvit, mörkbrun) |
| Fiender | Buggar i koden: syntaxfel, null-pekare, minnesläckor, race conditions |
| Bossar | ”Den oändliga loopen” och ”Stack Overflow-monstret” (var femte nivå) |
| Funktioner | Highscore (localStorage), ljud och musik (Web Audio API), touchstöd, power-ups, bossar |
| Språk | Svenska i hela gränssnittet |
| Hosting | GitHub Pages från repots rot (`main` / `/`) |

## Spelidé och mekanik

- **Spelaren:** Claudes stjärnsymbol i pixel art. Den rör sig i sidled och skjuter ”tokens” uppåt. Man börjar med 3 liv.
- **Fiendevågor:** Buggarna rör sig i ett rutnät som byter riktning och sjunker när det når kanten. De skjuter ”felmeddelanden” nedåt.
- **Eget grepp – Kontextfönstret:** En mätare fylls när du träffar buggar i följd. När den är full kan du trycka på `Shift` för att utlösa ”Refaktorering”, som rensar en hel rad buggar.
- **Försvar – Tester:** I stället för bunkrar finns ”testsviter”, små block som absorberar skott och sakta går sönder. De byggs upp igen mellan nivåerna.
- **Förlust:** Spelet är slut om alla liv tar slut eller om en bugg når ”produktion” (botten av skärmen).

### Fiendetyper

| Fiende | Beteende | Poäng |
|---|---|---|
| Syntaxfel | Grundfiende, rör sig i rutnätet | 10 |
| Null-pekare | Skjuter oftare | 20 |
| Minnesläcka | Delar sig i två mindre när den träffas | 30 |
| Race condition | Teleporterar sig ibland till en annan ruta | 40 |
| Heisenbugg (bonus) | Dyker upp mellan rutnätet och spelaren, flimrar och försvinner efter några sekunder | 100–500 |

### Power-ups (släpps slumpvis av besegrade buggar)

| Power-up | Effekt |
|---|---|
| Extended thinking | Långsammare tid i 5 sekunder |
| Tool use | Trippelskott i 8 sekunder |
| Konstitution | Sköld som tål en träff |
| Kodgranskning | Genomträngande skott i 6 sekunder |
| Extra kontext | +1 liv |

### Bossar

- **Nivå 5 – Den oändliga loopen:** En roterande ring som skjuter i cirkelmönster. Den har flera faser.
- **Nivå 10 – Stack Overflow-monstret:** Ett torn av staplade block. Varje block måste skjutas bort och tornet staplar nya block ovanpå sig.
- Efter nivå 10 upprepas cykeln med högre svårighetsgrad.

## Kontroller

| Handling | Tangentbord | Touch |
|---|---|---|
| Flytta | `←` `→` / `A` `D` | Vänster-/högerknapp på skärmen |
| Skjut | `Mellanslag` | Skjutknapp |
| Refaktorering | `Shift` | Specialknapp |
| Paus | `P` / `Esc` | Pausknapp |
| Ljud av/på | `M` | Ljudikon |

## Filstruktur

```
claude-invaders/
├── index.html          # Startpunkt, canvas och UI-element
├── style.css           # Layout, pixelfont, responsivitet, touchknappar
├── js/
│   ├── main.js         # Startar spelet och kör spel-loopen (requestAnimationFrame)
│   ├── game.js         # Spelets tillstånd: meny, spel, paus, game over
│   ├── input.js        # Tangentbord och touch
│   ├── player.js       # Spelaren
│   ├── enemies.js      # Buggar, rutnätsrörelse, fiendetyper
│   ├── boss.js         # Bosslogik
│   ├── projectiles.js  # Skott
│   ├── powerups.js     # Power-ups
│   ├── shields.js      # Testsviter
│   ├── levels.js       # Nivådefinitioner och svårighetskurva
│   ├── sprites.js      # Pixel art definierad i kod (strängmatriser → canvas)
│   ├── particles.js    # Explosioner och effekter
│   ├── audio.js        # Ljudeffekter och chiptune-musik via Web Audio API
│   ├── highscore.js    # Topplista i localStorage
│   └── strings.js      # Alla svenska texter samlade på ett ställe
├── PLAN.md
└── README.md
```

Grafiken ritas i kod med pixelmatriser och ljuden genereras i webbläsaren. Spelet behöver därför inga externa resursfiler.

## Tasks

### Fas 1 – Grund
- [x] Skapa `index.html`, `style.css` och mappstrukturen
- [x] Sätt upp canvas med fast intern upplösning (t.ex. 320×240) som skalas pixelperfekt
- [x] Spel-loop med `requestAnimationFrame` och delta-tid
- [x] Tillståndsmaskin: startmeny → spel → paus → game over
- [x] Indatahantering för tangentbord
- [x] `strings.js` med alla svenska texter

### Fas 2 – Kärnspel
- [x] Sprite-system för pixel art i kod med Claude-palett
- [x] Spelaren (Claude-stjärnan): rörelse och skott
- [x] Fiendernas rutnät: rörelse, riktningsbyte och nedstigning
- [x] Fiendeskott
- [x] Kollisionsdetektering (AABB)
- [x] Liv, poäng och nivåräknare i HUD
- [x] Vinst-/förlustvillkor och nästa nivå

### Fas 3 – Innehåll
- [x] Fyra fiendetyper med egna beteenden
- [x] Heisenbugg som bonusfiende
- [x] Testsviter (förstörbara skydd)
- [x] Kontextfönster-mätare och Refaktorering
- [x] Nivådefinitioner och svårighetskurva

### Fas 4 – Power-ups och bossar
- [x] Power-up-system: släpp, plocka upp, tidsbegränsade effekter
- [x] Fem power-ups enligt tabellen
- [x] Boss: Den oändliga loopen (nivå 5)
- [x] Boss: Stack Overflow-monstret (nivå 10)
- [x] Bossens livsmätare och faser

### Fas 5 – Ljud och känsla
- [x] Ljudeffekter: skott, träff, explosion, power-up, skada
- [x] Chiptune-bakgrundsmusik som tempoökar med fiendernas hastighet
- [x] Partikeleffekter och skärmskakning
- [x] Ljud av/på-knapp (ljudet startar först efter användarens interaktion)

### Fas 6 – Highscore och mobil
- [x] Topplista (topp 10) i localStorage
- [x] Ange namn eller initialer vid nytt rekord
- [x] Touchknappar på skärmen (visas bara på touchenheter)
- [x] Responsiv layout för stående och liggande läge
- [x] Pausa automatiskt när fliken tappar fokus

### Fas 7 – Publicering
- [x] `README.md` på svenska med beskrivning och kontroller
- [x] Testa i Chrome, Firefox, Safari och på mobil (Playwright-motorerna Chromium, Firefox och WebKit samt mobilemulering med iPhone 13 och Pixel 7; det är emulerat, riktiga enheter återstår att testa)
- [x] Aktivera GitHub Pages och verifiera att spelet laddar
- [x] Favicon och meta-taggar (titel, beskrivning, förhandsbild)

## Notering om hosting

Spelet har ett eget repo (`ZeldaStudio49281/claude-invaders`) och filerna ligger i repots rot. GitHub Pages publiceras från grenen `main` och roten (`/`), och spelet hamnar på `https://zeldastudio49281.github.io/claude-invaders/`. Alla sökvägar i koden är relativa eftersom sidan ligger i en undersökväg.
