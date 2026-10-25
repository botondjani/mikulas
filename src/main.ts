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
  const fill = $('loader-fill');
  const tip = $('loader-tip');
  el.hidden = false;
  let p = 5;
  let i = Math.floor(Math.random() * TIPS.length);
  tip.textContent = TIPS[i];
  const tick = setInterval(() => {
    p = Math.min(92, p + (92 - p) * 0.12);
    fill.style.width = `${p}%`;
  }, 120);
  const tips = setInterval(() => (tip.textContent = TIPS[++i % TIPS.length]), 2600);
  return () => {
    clearInterval(tick);
    clearInterval(tips);
    fill.style.width = '100%';
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => (el.hidden = true), 400);
    }, 200);
  };
}

async function start(tutorial: boolean): Promise<void> {
  if (started) return;
  started = true;
  sfx.unlock();
  const done = showLoader();
  window.addEventListener('mikulas-ready', done, { once: true });
  if (isTouch()) await enterFullscreenLandscape();
  const { startGame } = await loadGame();
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mód nélkül is működik */
    });
  });
}
