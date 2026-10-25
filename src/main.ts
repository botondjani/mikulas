import { params, sfx } from './app';
import { installPrompt } from './render/install';
import { enterFullscreenLandscape, isTouch } from './fullscreen';

// az AudioContext csak felhasználói érintés után indulhat
const unlock = () => sfx.unlock();
for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, unlock, { passive: true });

const $ = (id: string) => document.getElementById(id)!;
let started = false;
// a játékrészt a nyitóoldal után a háttérben előre letöltjük, így a gombnyomás után azonnal indul
let gameModule: Promise<typeof import('./boot-game')> | null = null;
const loadGame = () => (gameModule ??= import('./boot-game'));
window.addEventListener('load', () => setTimeout(loadGame, 300));

const TIPS = [
  'Tipp: a kéményen át 🪜 sokkal halkabb, mint az ajtón 🚪.',
  'Tipp: a 🤫 csendben-módban lassabb vagy, de alig hallani.',
  'Tipp: ha a nagymama abbahagyja a kötést, mindjárt felnéz!',
  'Tipp: az ugató kutyát egy 🦴 csont elhallgattatja.',
  'Tipp: a Krampuszt ledobott 🍬 szaloncukorral csalhatod el.',
  'Tipp: a szóló tévé elnyomja a zaj egy részét.',
];

/** Töltőképernyő: amíg a játék be nem töltődik, animáció és tippek. */
function showLoader(): () => void {
  const el = $('loader');
  const tip = $('loader-tip');
  el.classList.remove('fade');
  el.hidden = false;
  let i = Math.floor(Math.random() * TIPS.length);
  tip.textContent = TIPS[i];
  const tips = setInterval(() => (tip.textContent = TIPS[++i % TIPS.length]), 2600);
  const shownAt = performance.now();
  return () => {
    clearInterval(tips);
    // legalább egy pillanatig látszódjon, hogy érthető legyen, mi történik
    const wait = Math.max(0, 900 - (performance.now() - shownAt));
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => (el.hidden = true), 400);
    }, wait);
  };
}

async function start(tutorial: boolean): Promise<void> {
  if (started) return;
  started = true;
  sfx.unlock();
  const done = showLoader();
  window.addEventListener('mikulas-ready', done, { once: true });
  // a teljes képernyő kérése nem tarthatja fel az indulást
  if (isTouch()) await Promise.race([enterFullscreenLandscape(), new Promise((r) => setTimeout(r, 900))]);
  const { startGame } = await loadGame();
  // a töltőképernyő kirajzolódjon, mielőtt a játék felépítése lefoglalja a gépet
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
  document.body.classList.add('playing');
  $('landing').hidden = true;
  startGame({ tutorial });
}

$('play-btn').addEventListener('click', () => void start(false));
$('tutorial-btn').addEventListener('click', () => void start(true));
$('rotate-btn').addEventListener('click', () => {
  sfx.unlock();
  void enterFullscreenLandscape();
});

// telepítés a főképernyőre
const install = $('install-btn');
const showInstall = () => {
  install.hidden = !installPrompt.available();
  $('ios-tip').hidden = !installPrompt.isIos();
};
install.addEventListener('click', () => void installPrompt.prompt().then(showInstall));
window.addEventListener('beforeinstallprompt', () => setTimeout(showInstall));
showInstall();

// fejlesztéshez: ?level=N vagy ?debug esetén rögtön a játék
if (params.level || params.debug) void start(false);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // ha új változat érkezett, amíg még a nyitóoldalon vagyunk: újratöltjük
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !started) location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
      /* offline mód nélkül is működik */
    });
  });
}
