import Phaser from 'phaser';
import { C, CX, RX, Z, emo, txt } from '../view';

/**
 * Virtuális joystick (bal oldal, lebegő) és gombok a jobb oldalon: művelet, eszköz, csendben-mód, bújás.
 * Többérintéses: mozgás közben is nyomhatók a gombok.
 */
export class TouchControls {
  mx = 0;
  my = 0;
  quiet = false;
  /** a házban: elbújás (virág mögé guggol) */
  hide = false;
  private inHouse = false;
  private interactPressed = false;
  private toolPressed = false;
  private toolBg: Phaser.GameObjects.Graphics;
  private toolIcon: Phaser.GameObjects.Text;
  private toolKey = '-';
  private toolOn = false;
  private stickId = -1;
  private ox = 0;
  private oy = 0;
  private base: Phaser.GameObjects.Graphics;
  private knob: Phaser.GameObjects.Graphics;
  private hint: Phaser.GameObjects.Graphics;
  private actBg: Phaser.GameObjects.Graphics;
  private actIcon: Phaser.GameObjects.Text;
  private quietBg: Phaser.GameObjects.Graphics;
  private quietIcon: Phaser.GameObjects.Text;
  private readonly R = 70;
  readonly act = { x: RX(878), y: 446, r: 66 };
  /** eszköz-gomb: a zsebben lévő eszköz használata */
  readonly tb = { x: RX(884), y: 314, r: 46 };
  readonly qb = { x: RX(760), y: 484, r: 46 };
  readonly hb = { x: RX(760), y: 384, r: 42 };
  private hideBg!: Phaser.GameObjects.Graphics;
  private hideIcon!: Phaser.GameObjects.Text;
  private hideLabel!: Phaser.GameObjects.Text;
  private enabled = true;
  private targetKey = '-';

  constructor(
    private scene: Phaser.Scene,
    private isBlocked: (x: number, y: number) => boolean,
  ) {
    const D = 1500;
    this.hint = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(D).setVisible(false);
    this.knob = scene.add.graphics().setScrollFactor(0).setDepth(D + 1).setVisible(false);
    this.base.fillStyle(0xffffff, 0.12).fillCircle(0, 0, this.R).lineStyle(3, 0xffffff, 0.35).strokeCircle(0, 0, this.R);
    this.knob.fillStyle(0xffffff, 0.45).fillCircle(0, 0, 30).lineStyle(2, 0xffffff, 0.7).strokeCircle(0, 0, 30);
    if (scene.sys.game.device.input.touch) {
      this.hint.lineStyle(3, 0xffffff, 0.15).strokeCircle(130, 420, this.R);
      this.hint.fillStyle(0xffffff, 0.08).fillCircle(130, 420, 28);
    }

    this.actBg = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.actIcon = emo(scene, this.act.x, this.act.y - 2, '✋', 46).setScrollFactor(0).setDepth(D + 1);
    this.toolBg = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.toolIcon = emo(scene, this.tb.x, this.tb.y - 2, '', 34).setScrollFactor(0).setDepth(D + 1);
    this.quietBg = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.quietIcon = emo(scene, this.qb.x, this.qb.y - 4, '🤫', 34).setScrollFactor(0).setDepth(D + 1);
    this.hideBg = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.hideIcon = emo(scene, this.hb.x, this.hb.y - 6, '🪴', 32).setScrollFactor(0).setDepth(D + 1);
    this.hideLabel = txt(scene, this.hb.x, this.hb.y + 24, 'Bújás', 12, '#ffffff', { fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(D + 1);
    this.drawQuiet();
    this.drawHide();
    this.setTarget(null);
    this.setTool(null, false);

    scene.input.addPointer(3);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
  }

  /** pointer → logikai képernyő-koordináta */
  private pos(p: Phaser.Input.Pointer): [number, number] {
    return [p.x / Z, p.y / Z];
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const [x, y] = this.pos(p);
    if (Math.hypot(x - this.act.x, y - this.act.y) < this.act.r + 12) {
      this.interactPressed = true;
      this.flash(this.actBg);
      return;
    }
    if (this.toolOn && Math.hypot(x - this.tb.x, y - this.tb.y) < this.tb.r + 10) {
      this.toolPressed = true;
      this.flash(this.toolBg);
      return;
    }
    if (Math.hypot(x - this.qb.x, y - this.qb.y) < this.qb.r + 10) {
      this.toggleQuiet();
      return;
    }
    if (this.inHouse && Math.hypot(x - this.hb.x, y - this.hb.y) < this.hb.r + 8) {
      this.toggleHide();
      return;
    }
    if (this.isBlocked(x, y)) return;
    if (this.stickId < 0 && x < CX + 80) {
      this.stickId = p.id;
      this.ox = x;
      this.oy = y;
      this.base.setPosition(x, y).setVisible(true);
      this.knob.setPosition(x, y).setVisible(true);
      this.hint.setVisible(false);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickId) return;
    const [x, y] = this.pos(p);
    let dx = x - this.ox;
    let dy = y - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > this.R) {
      // a joystick követi az ujjat, ha messzire húzzák
      this.ox += (dx / l) * (l - this.R);
      this.oy += (dy / l) * (l - this.R);
      this.base.setPosition(this.ox, this.oy);
      dx = x - this.ox;
      dy = y - this.oy;
    }
    this.knob.setPosition(this.ox + dx, this.oy + dy);
    const m = Math.min(1, Math.hypot(dx, dy) / this.R);
    const dead = 0.15;
    if (m < dead) {
      this.mx = this.my = 0;
      return;
    }
    const a = Math.atan2(dy, dx);
    const s = (m - dead) / (1 - dead);
    this.mx = Math.cos(a) * s;
    this.my = Math.sin(a) * s;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickId) return;
    this.stickId = -1;
    this.mx = this.my = 0;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.hint.setVisible(true);
  }

  toggleQuiet(): void {
    this.quiet = !this.quiet;
    this.drawQuiet();
  }

  toggleHide(): void {
    if (!this.inHouse) return;
    this.hide = !this.hide;
    this.drawHide();
  }

  /** a bújás gomb csak házban látszik; kilépéskor kikapcsol */
  setInHouse(v: boolean): void {
    if (v === this.inHouse) return;
    this.inHouse = v;
    if (!v) this.hide = false;
    this.drawHide();
  }

  private drawHide(): void {
    const b = this.hb;
    const on = this.inHouse && this.enabled;
    this.hideBg.clear().setVisible(on);
    this.hideIcon.setVisible(on).setAlpha(this.hide ? 1 : 0.75);
    this.hideLabel.setVisible(on).setText(this.hide ? 'Elbújva' : 'Bújás');
    if (!on) return;
    this.hideBg.fillStyle(0x000000, 0.3).fillCircle(b.x, b.y + 4, b.r);
    this.hideBg.fillStyle(this.hide ? 0x5ad17a : 0x55607a, this.hide ? 0.95 : 0.6).fillCircle(b.x, b.y, b.r);
    this.hideBg.lineStyle(3, 0xffffff, this.hide ? 0.9 : 0.3).strokeCircle(b.x, b.y, b.r);
  }

  /** egyszer olvasható: megnyomták-e az INTERACT gombot */
  consumeInteract(): boolean {
    const v = this.interactPressed;
    this.interactPressed = false;
    return v;
  }

  /** egyszer olvasható: megnyomták-e az eszköz-gombot */
  consumeTool(): boolean {
    const v = this.toolPressed;
    this.toolPressed = false;
    return v;
  }

  release(): void {
    this.onUp({ id: this.stickId } as Phaser.Input.Pointer);
    this.interactPressed = false;
    this.toolPressed = false;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.release();
    for (const o of [this.actBg, this.actIcon, this.quietBg, this.quietIcon, this.hint]) o.setVisible(on);
    this.drawHide();
    this.toolKey = '-';
    this.setTool(null, false);
  }

  /**
   * Az eszköz-gomb: a zsebben lévő eszköz jele (null: nincs eszköz, a gomb rejtve);
   * `ready`: van mire használni (világít).
   */
  setTool(icon: string | null, ready: boolean): void {
    const key = `${icon}|${ready}|${this.enabled}`;
    if (key === this.toolKey) return;
    this.toolKey = key;
    const b = this.tb;
    this.toolOn = icon !== null && this.enabled;
    this.toolBg.clear().setVisible(this.toolOn);
    this.toolIcon.setVisible(this.toolOn).setText(icon ?? '').setAlpha(ready ? 1 : 0.6);
    if (!this.toolOn) return;
    this.toolBg.fillStyle(0x000000, 0.3).fillCircle(b.x, b.y + 4, b.r);
    this.toolBg.fillStyle(ready ? 0x7ad1ff : 0x55607a, ready ? 0.95 : 0.6).fillCircle(b.x, b.y, b.r);
    this.toolBg.lineStyle(3, 0xffffff, ready ? 0.9 : 0.3).strokeCircle(b.x, b.y, b.r);
  }

  setTarget(t: { icon: string } | null): void {
    const key = t ? t.icon : '';
    if (key === this.targetKey) return;
    this.targetKey = key;
    const a = this.act;
    const on = t !== null;
    this.actBg.clear();
    this.actBg.fillStyle(0x000000, 0.3).fillCircle(a.x, a.y + 4, a.r);
    this.actBg.fillStyle(on ? C.warm : 0x55607a, on ? 0.95 : 0.55).fillCircle(a.x, a.y, a.r);
    this.actBg.lineStyle(3, 0xffffff, on ? 0.8 : 0.3).strokeCircle(a.x, a.y, a.r);
    this.actIcon.setText(on ? t.icon : '✋').setAlpha(on ? 1 : 0.5);
  }

  private drawQuiet(): void {
    const q = this.qb;
    this.quietBg.clear();
    this.quietBg.fillStyle(0x000000, 0.3).fillCircle(q.x, q.y + 4, q.r);
    this.quietBg.fillStyle(this.quiet ? 0x7ad1ff : 0x55607a, this.quiet ? 0.95 : 0.6).fillCircle(q.x, q.y, q.r);
    this.quietBg.lineStyle(3, 0xffffff, this.quiet ? 0.9 : 0.3).strokeCircle(q.x, q.y, q.r);
    this.quietIcon.setAlpha(this.quiet ? 1 : 0.7);
  }

  private flash(g: Phaser.GameObjects.Graphics): void {
    this.scene.tweens.add({ targets: g, alpha: 0.6, duration: 60, yoyo: true });
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
  }
}
