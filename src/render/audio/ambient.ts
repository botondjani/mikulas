import { FACTORY, STREET } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';
import type { Sfx } from './synth';

/**
 * Környezeti hangok: horkolás, tévé, kötés, kutyaugatás, macskanyávogás, Krampusz.
 * Csak megjelenítés: a játéklogikára nincs hatásuk. A hangerő a távolsággal csökken.
 */
export class Ambient {
  private timers = new Map<string, number>();

  constructor(
    private g: MikulasGame,
    private sfx: Sfx,
  ) {}

  /** `every`: [min, max] mp; ha lejárt, lejátssza és újraindítja */
  private tick(key: string, dt: number, every: [number, number], id: string, vol: number): void {
    const t = (this.timers.get(key) ?? Math.random() * every[1]) - dt;
    if (t <= 0) {
      this.sfx.play(id, vol);
      this.timers.set(key, every[0] + Math.random() * (every[1] - every[0]));
    } else this.timers.set(key, t);
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player;
    // a gyárban a futószalag zakatol
    if (g.phase === 'pack') {
      if (p.zone === FACTORY) this.tick('belt', dt, [0.42, 0.5], 'belt', 0.5);
      return;
    }
    if (g.phase !== 'deliver' && g.phase !== 'dawn') return;
    const falloff = (x: number, y: number, r: number) => Math.max(0, 1 - Math.hypot(p.x - x, p.y - y) / r);

    for (const h of g.houses) {
      const gp = h.grandpa;
      // a ház belsejében teljes hangerő, az utcán a ház közelében halkan
      const inside = p.zone === h.idx;
      const outside = p.zone === STREET ? falloff(h.street.door.x, h.street.door.y, 260) * 0.3 : 0;
      const v = inside ? 1 : outside;
      if (gp && v > 0) {
        if (gp.mode === 'dozing') this.tick(`snore${h.idx}`, dt, [3.2, 3.6], 'snore', v);
        if (gp.kind === 'tv' && gp.mode === 'awake') this.tick(`tv${h.idx}`, dt, [0.16, 0.34], 'tv', v * 0.8);
        if (gp.kind === 'grandma' && gp.mode === 'knit') this.tick(`knit${h.idx}`, dt, [0.42, 0.55], 'knit', v);
      }
      // kutyák: időnként maguktól is ugatnak; a csontot rágcsálják
      if (h.dog && p.zone === STREET && h.status !== 'lost') {
        const dv = falloff(h.dog.x, h.dog.y, 650);
        if (h.dog.mode === 'alert') this.tick(`dog${h.idx}`, dt, [18, 30], 'bark', dv * 0.8);
        else this.tick(`chew${h.idx}`, dt, [1.2, 2.2], 'chew', falloff(h.dog.x, h.dog.y, 220));
      }
    }

    const k = g.krampus;
    if (k.active && p.zone === STREET) {
      const kv = Math.max(0.15, falloff(k.x, k.y, 700));
      this.tick('growl', dt, k.mode === 'chase' ? [1.6, 2.4] : [3, 4.5], 'growl', kv);
      this.tick('chain', dt, [0.9, 1.6], 'chain', kv);
    }
  }
}
