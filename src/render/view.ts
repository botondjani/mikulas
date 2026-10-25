import Phaser from 'phaser';

export const VIEW_W = 960;
export const VIEW_H = 540;

/**
 * A látható logikai szélesség a kijelző arányához igazodik (16:9 → 960, széles telefon → akár 1280),
 * így nincs fekete sáv két oldalt. A magasság mindig 540.
 */
export const VW = (() => {
  const touch = 'ontouchstart' in globalThis || (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
  let a = (globalThis.innerWidth || VIEW_W) / (globalThis.innerHeight || VIEW_H);
  if (touch && globalThis.screen) a = Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height);
  return Math.round(Math.max(VIEW_W, Math.min(1280, VIEW_H * a)));
})();
/**
 * Belső felbontás-szorzó: a 960×540-es logikai képet élesen rajzoljuk a nagy
 * pixelsűrűségű kijelzőkön is (legfeljebb 2×).
 */
export const Z = (() => {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const long = Math.max(globalThis.innerWidth || VIEW_W, globalThis.innerHeight || VIEW_H);
  const z = (long * dpr) / VW;
  return Math.max(1, Math.min(2, Math.round(z * 4) / 4));
})();

/** a képernyő vízszintes közepe */
export const CX = VW / 2;
/** jobb szélhez horgonyzott elem: a 960-as tervben megadott x eltolva */
export const RX = (x: number): number => VW - (VIEW_W - x);



/** A kamera a bal felső sarokból nagyít, így a UI-koordináták logikaiak maradnak. */
export function setupCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setOrigin(0, 0);
  cam.setZoom(Z);
  return cam;
}

export const FONT = "'Trebuchet MS', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

export const C = {
  night: 0x0b1a3a,
  deep: 0x132650,
  sky: 0x1d3a78,
  snow: 0xeef4ff,
  snowShade: 0xc9d7f2,
  warm: 0xffd36b,
  red: 0xd9413b,
  green: 0x3c8d5a,
  wood: 0x8a5a3c,
  dark: 0x06102a,
};

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size = 20,
  color = '#eef4ff',
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    resolution: Z,
    ...extra,
  });
  t.setOrigin(0.5);
  return t;
}

/** Nagy, kerekített gomb érintésre (lenyomáskor összenyomódik). */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { w?: number; h?: number; color?: number; textColor?: string; size?: number } = {},
): Phaser.GameObjects.Container {
  const w = opts.w ?? 240;
  const h = opts.h ?? 64;
  const g = scene.add.graphics();
  const color = opts.color ?? C.warm;
  const draw = (pressed: boolean) => {
    g.clear();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, h / 2);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + (pressed ? 3 : 0), w, h, h / 2);
    g.fillStyle(0xffffff, 0.25);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + 6 + (pressed ? 3 : 0), w - 20, h / 3, h / 6);
  };
  draw(false);
  const t = txt(scene, 0, 0, label, opts.size ?? 26, opts.textColor ?? '#3a2200', { fontStyle: 'bold' });
  const c = scene.add.container(x, y, [g, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    draw(true);
    t.y = 3;
  });
  c.on('pointerout', () => {
    draw(false);
    t.y = 0;
  });
  c.on('pointerup', () => {
    draw(false);
    t.y = 0;
    onClick();
  });
  return c;
}

/** Éjszakai égbolt csillagokkal (statikus). */
export function drawSky(scene: Phaser.Scene, w: number, h: number, seed = 3): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillGradientStyle(C.dark, C.dark, C.sky, C.sky, 1);
  g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    g.fillStyle(0xffffff, 0.3 + rnd() * 0.6);
    g.fillCircle(rnd() * w, rnd() * h * 0.7, rnd() < 0.85 ? 1 : 2);
  }
  return g;
}

export { toggleFullscreen, enterFullscreenLandscape } from '../fullscreen';

/** Kódból generált textúra képe; a textúrák Z-szeres felbontásúak. */
export function img(scene: Phaser.Scene, x: number, y: number, key: string, scale = 1): Phaser.GameObjects.Image {
  return scene.add.image(x, y, key).setScale(scale / Z);
}

/** Emoji szövegként, színezés nélkül. */
export const emo = (scene: Phaser.Scene, x: number, y: number, e: string, size: number): Phaser.GameObjects.Text =>
  txt(scene, x, y, e, size);

/**
 * Statikus rajz "sütése" textúrába: a Graphics-ot így nem kell minden
 * képkockán újra háromszögekre bontani.
 */
export function bake(scene: Phaser.Scene, gr: Phaser.GameObjects.Graphics, w: number, h: number): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, Math.ceil(w * Z), Math.ceil(h * Z)).setOrigin(0, 0).setScale(1 / Z);
  gr.setScale(Z);
  rt.draw(gr);
  gr.destroy();
  return rt;
}
