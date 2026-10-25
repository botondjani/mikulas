import Phaser from 'phaser';
import { BootScene } from './render/scenes/BootScene';
import { MenuScene } from './render/scenes/MenuScene';
import { LevelSelectScene } from './render/scenes/LevelSelectScene';
import { GameScene } from './render/scenes/GameScene';
import { ResultScene } from './render/scenes/ResultScene';
import { VIEW_H, VW, Z, C } from './render/view';
import { sfx } from './app';

/** A Phaser-játék indítása (a nyitóoldal után, külön töltődik be). */
export function startGame(opts: { tutorial: boolean }): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: C.night,
    width: VW * Z,
    height: VIEW_H * Z,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4 },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 },
    scene: [BootScene, MenuScene, LevelSelectScene, GameScene, ResultScene],
  });
  // a nyitóoldalról egyenesen a játékba (vagy a tanuló körbe), menü nélkül
  game.registry.set('startMode', opts.tutorial ? 'tutorial' : 'play');
  // tesztekhez és hibakereséshez
  (window as unknown as { __game: Phaser.Game }).__game = game;

  // forgatás, teljes képernyő, címsor eltűnése után újraméretezés (néhány böngésző késve jelez)
  const refresh = () => {
    game.scale.refresh();
    setTimeout(() => game.scale.refresh(), 250);
    setTimeout(() => game.scale.refresh(), 700);
  };
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  document.addEventListener('fullscreenchange', refresh);

  // játék közben: görgetés, nagyítás, hosszú érintés menü tiltása
  for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.events.emit('app-hidden');
      sfx.suspend();
    } else sfx.resume();
  });
  return game;
}
