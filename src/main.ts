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

async function start(tutorial: boolean): Promise<void> {
  if (started) return;
  started = true;
  sfx.unlock();
  if (isTouch()) await enterFullscreenLandscape();
  for (const b of document.querySelectorAll<HTMLButtonElement>('.play')) b.textContent = '🎅 Betöltés…';
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
