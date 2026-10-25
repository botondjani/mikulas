import Phaser from 'phaser';
import { BootScene } from './render/scenes/BootScene';
import { MenuScene } from './render/scenes/MenuScene';
import { LevelSelectScene } from './render/scenes/LevelSelectScene';
import { GameScene } from './render/scenes/GameScene';
import { ResultScene } from './render/scenes/ResultScene';
import { VIEW_H, VIEW_W, Z, C, enterFullscreenLandscape } from './render/view';
import { sfx } from './app';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: C.night,
  width: VIEW_W * Z,
  height: VIEW_H * Z,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 4 },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, ResultScene],
});

document.getElementById('loading')?.remove();
// tesztekhez és hibakereséshez
(window as unknown as { __game: Phaser.Game }).__game = game;

// az AudioContext csak felhasználói érintés után indulhat
const unlock = () => sfx.unlock();
for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, unlock, { passive: true });
window.addEventListener('keydown', unlock);

document.getElementById('rotate-btn')?.addEventListener('click', () => {
  sfx.unlock();
  void enterFullscreenLandscape();
});

// görgetés, nagyítás, hosszú érintés menü tiltása
for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.events.emit('app-hidden');
    sfx.suspend();
  } else sfx.resume();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mód nélkül is működik */
    });
  });
}
