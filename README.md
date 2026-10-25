# 🎅 Mikulás-éjszaka

Felülnézetes, lopakodós ajándékosztó játék telefonra és böngészőre. Egy éjszaka alatt kell az ajándékokat
a fenyőfák alá juttatni úgy, hogy a gyerekek ne ébredjenek fel. Overcooked-szerű időmenedzsment,
karácsonyi hangulat, magyar felirat.

**Játék:** https://botondjani.github.io/mikulas/ (minden push után frissül, és telefonon „főképernyőre” tehető)

A nyitóoldalról indul a játék vagy a **Tanuló kör**: ez lépésenként végigvezet egy kézbesítésen, és
amíg tart, áll az óra. Az 1. pálya első indításakor magától elindul.

## Hogyan játssz?

| | Telefon | Gép |
|---|---|---|
| Mozgás | lebegő joystick a bal oldalon | WASD / nyilak |
| Művelet (felvesz, lerak, ajtó, kémény…) | sárga gomb jobbra lent | E / Szóköz |
| Csendben-mód (lassú, halk) | 🤫 gomb | Shift (nyomva) vagy Q |
| Szünet | ⏸️ | P / Esc |

1. **Pakolás:** tedd a szánra, amit a gyerekek kértek (a felesleges ajándék pontlevonás).
2. **Kézbesítés:** a szán mellett sorakoznak az ajándékok, mindegyiken a ház száma és a gyerek neve.
   Állj mellé, és a művelet-gombbal vedd fel; a villogó keret és a nyíl mutatja a házat (alul a
   rendelés-sáv is). Ajtón 🚪 (gyors, de zajos) vagy kéményen 🪜 (csendes) menj be, és tedd a fa alá,
   a csillogó körbe. Szaloncukorral 🍬 a csizma is megtölthető. Az utcán hóember, fenyő, hókupac,
   csúszós jég és zörgő kuka nehezíti a dolgot.
3. **Hajnal:** irány vissza a szánhoz.
4. **Eredmény:** a boldog házak ablakai kigyulladnak, a csillag az arányukon múlik.

Veszélyek: a gyerek ébrenléti mérője (zajra nő; 100-nál felébred), az ugatós kutya (🦴 csont), a kéményt
elfoglaló macska (🐟 hal), az álmatlan nagypapa a látókúpjával (🔔 csengővel elterelhető), a 3. pályán
hóvihar és a Krampusz (ledobott szaloncukorral elcsalható).

## Futtatás

```bash
npm install
npm run dev -- --host     # a telefon a helyi hálózaton is eléri
npm test                  # vitest egységtesztek
npm run build             # statikus build a dist/ mappába (Netlify Drop-ra is tölthető)
npm run sim -- --level 2 --seed 7 [--runs 50] [--skill 0.7]   # fejnélküli kör robot-játékossal
npm run icons             # ikonok újragenerálása (public/icons)
```

URL-paraméterek: `?debug` (fázis, intenzitás, mérők, ütközők), `?fast` (3× sebesség), `?seed=N`
(reprodukálható kör), `?level=N` (egyenesen az adott pályára).

## Felépítés

```
src/core/            téma-független, Phaser nélküli játékmag (tesztelhető)
  rng, fsm, meter, director, scoring, geom, vision, noise, inventory, input, schema, save, events
src/games/mikulas/   a Mikulás-téma: adat (JSON) + szabályok
  data/levels/*.json, items.json, events.json (feliratok, director-súlyok), tuning.json (számok)
  game.ts            állapot és szabályok (fázisok, interakció, pontozás)
  agents/            gyerek, nagypapa, kutya, macska, Krampusz
src/main.ts          nyitóoldal (könnyű, a Phaser csak a „Játék” gomb után töltődik be)
src/render/          Phaser: csak megjelenít és bemenetet ad (tutorial: render/game/Tutorial.ts)
scripts/             sim, robot-játékos, ikon-generátor
tests/               vitest
```

- A director a teljes kör eseménysorát előre kiszámolja a seedből, így ugyanaz a seed ugyanazt az
  eseménysort adja, a játékos viselkedésétől függetlenül.
- A szimuláció fix, 60 Hz-es lépésközzel fut. A `sim` ugyanazt a kódot futtatja, mint a böngésző.
- Nincs külső asset: grafika Phaser Graphics és emoji, hang Web Audio, ikon kódból generálva.
- PWA: a build a teljes fájllistával generálja a service workert, így első betöltés után offline is indul.

Új téma (pl. stewardess, karácsonyi vásár) a `src/core` újrahasznosításával egy új `src/games/<téma>`
mappa: adatok JSON-ban, a szereplők viselkedése saját agentekben.
