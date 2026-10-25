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
| Bújás a házban (nem látnak, nagyon lassú) | 🪴 gomb | C |
| Szünet | ⏸️ | P / Esc |

1. **Pakolás a Mikulás-gyárban:** futószalagon jönnek az ajándékok; kapd le, amit a gyerekek kértek,
   és tedd a szánra (a felesleges ajándék pontlevonás, ami nem kell, visszadobható a szalagra).
2. **Szánút a faluba:** a szán magától halad; fel-le kormányozz (előre gyorsít, hátra fékez), kerüld ki
   a fenyőket, hóembereket, hókupacokat (a jégen csúszik), és szedd fel a ⭐ csillagokat.
3. **Kézbesítés:** az ajándékok a szánon vannak, mindegyiken a ház száma. Állj a szán mellé (a felső
   sort felülről, az alsót alulról éred el), és a művelet-gombbal vedd fel; a villogó keret és a nyíl mutatja a házat (alul a
   rendelés-sáv is). Ajtón 🚪 (gyors, de zajos) vagy kéményen 🪜 (csendes) menj be, és tedd a fa alá,
   a csillogó körbe. Szaloncukorral 🍬 a csizma is megtölthető. Az utcán hóember, fenyő, hókupac,
   csúszós jég és zörgő kuka nehezíti a dolgot.
4. **Hajnal:** irány vissza a szánhoz.
5. **Eredmény:** a boldog házak ablakai kigyulladnak, a csillag az arányukon múlik.

Veszélyek: a gyerek ébrenléti mérője (zajra nő; 100-nál felébred), az ugatós kutya (🦴 csont), a kéményt
elfoglaló macska (🐟 hal), az álmatlan nagypapa a látókúpjával (🔔 csengővel elterelhető), a 4. pályától
hóvihar és a Krampusz (ledobott szaloncukorral elcsalható). A 3. pályától kóbor kutyák is járnak: ha
kiszúrnak, ugatva követnek (felébresztik a házakat); csonttal barátok lesznek: leülnek, és elkergetik a közelükbe érő Krampuszt.
A jégen rohanva elcsúszol (csendben-módban nem): elesel, zajt csapsz, és ami a kezedben volt, leesik.
A szánúton a jégre érve a szán oldalra csúszik.

Időbónusz: minden kért ajándék a szánra téve +3 mp, minden boldog ház +6 mp, csizma +3 mp, csillag
a szánúton +1,5 mp (a kézbesítés idejéhez).

## Pályák

8 éjszaka, fokozatosan nehezedik (egy csillag kell a következőhöz):

| # | Név | Ház | Újdonság |
|---|-----|-----|----------|
| 1 | Kis utca | 4 | tanuló kör |
| 2 | Falu | 5 | kutya, macska, tévéző nagypapa |
| 3 | Csúszós utca | 6 | sok jég, kóbor kutya, kötögető nagymama |
| 4 | Hegyi falu | 7 | hóvihar, Krampusz |
| 5 | Viharos éjszaka | 8 | sűrű hóvihar, éhes Krampusz |
| 6 | Kóborkutya-negyed | 8 | sok kóbor kutya |
| 7 | Éber háztömb | 8 | szinte minden házban ébren van valaki |
| 8 | Szenteste | 8 | minden veszély egyszerre |

A nehézséget a robot-játékossal hangoltuk (`npm run sim -- --level N --runs 40`): a boldog házak aránya
pályánként kb. 96% → 84% → 79% → 73% → 68% → 64% → 61% → 52%, és minden pálya teljesíthető.

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
- A házbelsők seedből generálódnak (tükrözés, fa, kandalló, ajtó, csizma, fotel, bútorok helye);
  útkereséssel ellenőrizve, hogy minden fontos pont elérhető. Idős szereplők: szundikáló nagypapa,
  tévéző nagypapa (a tévé elnyomja a zaj egy részét), kötögető nagymama (ha elhallgat a kötőtű, felnéz).
- A játéktér szélessége a kijelző arányához igazodik (960–1280 logikai pixel), így nincs fekete sáv.

Új téma (pl. stewardess, karácsonyi vásár) a `src/core` újrahasznosításával egy új `src/games/<téma>`
mappa: adatok JSON-ban, a szereplők viselkedése saját agentekben.
