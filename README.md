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
| Eszköz (csont, hal, csengő, szaloncukor ledobása) | kék gomb a sárga fölött | F / R |
| Csendben-mód (lassú, halk) | 🤫 gomb | Shift (nyomva) vagy Q |
| Bújás a házban (nem látnak, nagyon lassú) | 🪴 gomb | C |
| Szünet | ⏸️ | P / Esc |

Egy óra fogy az egész éjszakára: a gyárban, a szánúton és a faluban is. Az utolsó 20 másodpercben hajnalodik;
ha lejár az idő, a háziak kiszaladnak és sikítoznak – vége, a pályát elölről kell kezdeni. Ha végeztél,
a szán bakjánál (🏠 a rénszarvasok mellett) bármikor hazaindulhatsz.

1. **Pakolás a Mikulás-gyárban:** futószalagon jönnek az ajándékok és az eszközök (🦴 csont, 🐟 hal,
   🔔 csengő, 🍬 szaloncukor, 🔦 zseblámpa). A szánon pont annyi hely van, ahány ajándék kell: a rossz ajándék
   elveszi a jó helyét, dobd vissza a szalagra. Az eszközök a kis eszközládába kerülnek – nem fér el minden,
   választani kell. A zseblámpa a Mikulásnál marad. A 4. pályától vihar van a gyárban: becsöpög a víz
   (csúszós tócsák), villámlik, és néha elmegy az áram (megáll a szalag, sötét lesz – ilyenkor kell a zseblámpa).
2. **Szánút a faluba:** a szán magától halad; fel-le kormányozz (előre gyorsít, hátra fékez), kerüld ki
   az akadályokat (a jégen megcsúszik), és szedd fel a ⭐ csillagokat.
3. **Kézbesítés:** az ajándékok a szánon vannak, mindegyiken a ház száma. Vedd fel, vidd a házhoz (villogó
   keret), menj be ajtón 🚪 (zajos) vagy kéményen 🪜 (csendes), és tedd a fa alá a villogó helyre. Az eszközöket
   a szán melletti eszközládából veheted el, és a kék eszköz-gombbal használod.
4. **Eredmény:** a boldog házak ablakai kigyulladnak, a csillag az arányukon múlik.

Veszélyek: a gyerek ébrenléti mérője (zajra nő; 100-nál felébred), az ugatós kutya (🦴 csonttal elhallgat),
a macska a házban (ha közel mész, nyávog – elbújva is; 🐟 hallal lecsendesíthető), az álmatlan nagypapa a
látókúpjával (🔔 csengővel elterelhető). A 3. pályától kóbor kutyák is járnak: ha kiszúrnak, ugatva követnek;
csonttal leülnek és elhallgatnak. A jégen rohanva elcsúszol (csendben-módban nem). Köd és hóvihar váltakozva jöhet.

**Game over** (a pályát elölről kell kezdeni):
- lejár az idő – a háziak kiszaladnak és sikítoznak;
- a 4. pályától a **Krampusz**: ha meglát, üldöz, és ha elkap, vége. Elfuthatsz előle (kicsit lassabb nálad),
  bemenekülhetsz egy házba (ilyenkor az ajtó előtt ólálkodik egy darabig), vagy ledobhatsz neki szaloncukrot;
- a 7–8. pályán a **rendőrök**: az autó egy idő után megáll, és kiszáll két rendőr zseblámpával; az ugatásra
  odafutnak. Ha a fényszóró vagy a zseblámpájuk elkap (❓ → ❗), üldöznek, és ha elkapnak, megbilincselnek, és elvisznek.

**Horror mód:** minden pálya indításakor választható (a horrorban teljesített pálya 💀 jelet kap). Ijesztő, hangos
meglepetések (arc, áramszünet, dörömbölés), üldözéskor kék-piros villogás, a Krampusz közelében szívdobogás,
Androidon telefonrezgés. A szünet menüben a hangerő és a rezgés állítható.

Az ajándék bárhol letehető az utcára, és később felvehető.

Időbónusz: minden kért ajándék a szánra téve +3 mp, minden boldog ház +6 mp, csillag a szánúton +1,5 mp.

## Pályák

8 éjszaka, fokozatosan nehezedik (egy csillag kell a következőhöz):

| # | Név | Ház | Újdonság |
|---|-----|-----|----------|
| 1 | Kis utca | 4 | tanuló kör |
| 2 | Falu | 5 | eszközláda, kutya, macska a házban, tévéző nagypapa |
| 3 | Csúszós utca | 6 | sok jég, kóbor kutya, kötögető nagymama |
| 4 | Hegyi falu | 7 | vihar a gyárban, zseblámpa, hóvihar, Krampusz |
| 5 | Viharos éjszaka | 8 | sűrű hóvihar, éhes Krampusz |
| 6 | Kóborkutya-negyed | 8 | sok kóbor kutya |
| 7 | Éber háztömb | 8 | szinte minden házban ébren van valaki, köd, rendőrök |
| 8 | Szenteste | 8 | minden veszély egyszerre (köd és rendőrök is) |

A nehézséget a robot-játékossal hangoltuk (`npm run sim -- --level N --runs 40`): a boldog házak aránya
pályánként kb. 94% → 87% → 78% → 71% → 58% → 62% → 16% → 9%. A 7–8. pálya (rendőrök, agresszív Krampusz) a gépi játékosnak most túl nehéz – a következő körben, okosabb gépi játékossal hangoljuk újra.

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
