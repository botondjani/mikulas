import Phaser from 'phaser';
import { C, CX, VIEW_H, VW, button, drawSky, emo, img, setupCamera, txt } from '../view';
import { addSnow } from '../fx/pools';
import { isUnlocked, newSeed, recordResult, save, sfx } from '../../app';
import { getLevel, LEVELS } from '../../games/mikulas/levels';
import type { GameResult, ScoreKey } from '../../games/mikulas/game';
import type { ScoreEntry } from '../../core/scoring';

const LABELS: Partial<Record<ScoreKey, string>> = {
  gift: '🎁 Helyes ajándék',
  boot: '🥾 Csizma',
  quiet: '🤫 Csendes bónusz',
  fast: '⚡ Gyors bónusz',
  wrongGift: '😢 Rossz ajándék',
  caught: '🚨 Lebukás',
  packWrong: '🎒 Felesleges ajándék',
  star: '⭐ Csillag a szánúton',
  giftRevoked: '❌ Elveszett ajándék',
  fastRevoked: '❌ Elveszett gyors bónusz',
  bootRevoked: '❌ Elveszett csizma',
};

/** Eredmény: a falu ablakai egyenként kigyulladnak a boldog házaknál. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: { result: GameResult; level: number; seed: number; log: ScoreEntry<ScoreKey>[] }): void {
    setupCamera(this);
    const r = data.result;
    const prevBest = save.get().best[r.levelId];
    recordResult(r.levelId, r.stars, r.score);
    drawSky(this, VW, VIEW_H, 5);
    addSnow(this);
    this.cameras.main.fadeIn(400);

    const lvl = getLevel(data.level);
    txt(this, CX, 40, `${lvl.name} – reggel lett!`, 34, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 6 });

    // falu sziluett
    const g = this.add.graphics();
    g.fillStyle(C.snowShade, 1).fillRect(0, 300, VW, 40);
    const n = r.total;
    const span = Math.min(110, 860 / n);
    const x0 = CX - ((n - 1) * span) / 2;
    const wins: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * span;
      const w = span * 0.7;
      g.fillStyle(0x1b2c55, 1).fillRect(x - w / 2, 250, w, 54);
      g.fillStyle(0x16244a, 1).fillTriangle(x - w / 2 - 8, 252, x + w / 2 + 8, 252, x, 212);
      g.fillStyle(C.snow, 1).fillTriangle(x - w / 2 - 8, 252, x - 2, 214, x - w / 2 + 6, 252);
      const wg = this.add.graphics();
      wg.fillStyle(0x24345e, 1).fillRect(x - w / 4 - 7, 266, 14, 14).fillRect(x + w / 4 - 7, 266, 14, 14);
      wins.push(wg);
    }

    // ablakok egyenként
    let delay = 500;
    r.statuses.forEach((st, i) => {
      const x = x0 + i * span;
      const w = span * 0.7;
      this.time.delayedCall(delay, () => {
        const wg = wins[i];
        if (st === 'happy') {
          wg.clear().fillStyle(C.warm, 1).fillRect(x - w / 4 - 7, 266, 14, 14).fillRect(x + w / 4 - 7, 266, 14, 14);
          const gl = img(this, x, 274, 'glow', 0.9).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
          this.tweens.add({ targets: gl, alpha: 0.9, duration: 500 });
          const st2 = emo(this, x, 200, '⭐', 24).setScale(0);
          this.tweens.add({ targets: st2, scale: 1, duration: 300, ease: 'Back.out' });
          sfx.play('window');
        } else {
          emo(this, x, 200, st === 'sad' ? '😢' : st === 'lost' ? '😴' : '🌑', 22).setAlpha(0.8);
        }
      });
      delay += 380;
    });

    // csillagok és pont
    this.time.delayedCall(delay + 200, () => {
      for (let i = 0; i < 3; i++) {
        const s = txt(this, CX - 80 + i * 80, 400, i < r.stars ? '★' : '☆', 64, i < r.stars ? '#ffd36b' : '#5a6a90').setScale(0);
        this.tweens.add({
          targets: s,
          scale: 1,
          delay: i * 260,
          duration: 300,
          ease: 'Back.out',
          onStart: () => i < r.stars && sfx.play('star'),
        });
      }
      if (r.stars >= 1) this.time.delayedCall(800, () => sfx.play('win'));
    });

    txt(this, CX, 360, `Boldog házak: ${r.happy}/${r.total}`, 22, '#ffffff', { fontStyle: 'bold' });
    const best = prevBest === undefined || r.score > prevBest ? '  🏆 új rekord!' : '';
    txt(this, CX, 446, `${r.score} pont${best}`, 24, '#ffd36b', { fontStyle: 'bold' });

    // pont-összesítő
    const sums = new Map<ScoreKey, { n: number; p: number }>();
    for (const e of data.log) {
      const s = sums.get(e.key) ?? { n: 0, p: 0 };
      s.n++;
      s.p += e.points;
      sums.set(e.key, s);
    }
    const lines = [...sums.entries()].map(([k, s]) => `${LABELS[k] ?? k} ×${s.n}: ${s.p > 0 ? '+' : ''}${s.p}`);
    if (lines.length) txt(this, 130, 410, lines.join('\n'), 13, '#c9d7f2', { align: 'left', lineSpacing: 4 });

    const nextLevel = LEVELS.find((l) => l.id === data.level + 1);
    const canNext = nextLevel && isUnlocked(nextLevel.id);
    const y = 500;
    button(this, CX + (canNext ? -180 : -100), y, '↻ Újra', () => this.go('Game', { level: data.level, seed: newSeed() }), {
      w: 180,
      h: 56,
      color: 0xeef4ff,
    });
    if (canNext)
      button(this, CX + 40, y, 'Következő éjszaka ▶', () => this.go('Game', { level: nextLevel.id, seed: newSeed() }), {
        w: 260,
        h: 56,
        size: 22,
      });
    else if (nextLevel)
      txt(this, CX + 120, y, 'A következő éjszakához\nlegalább 1 csillag kell', 15, '#ffe7a8', { align: 'center' });
    button(this, CX + (canNext ? 260 : 340), y, '🏠 Menü', () => this.go('Menu'), { w: 160, h: 56, color: 0xc9d7f2 });
  }

  private go(key: string, data?: object): void {
    sfx.play('click');
    this.scene.start(key, data);
  }
}
