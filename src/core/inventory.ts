/** Több eszközt tartó zseb (legfeljebb `cap` darab). */
export class Pocket<T> {
  items: T[] = [];
  constructor(readonly cap: number) {}

  /** az első eszköz (vagy null) */
  get item(): T | null {
    return this.items[0] ?? null;
  }

  get full(): boolean {
    return this.items.length >= this.cap;
  }

  has(item: T): boolean {
    return this.items.includes(item);
  }

  put(item: T): boolean {
    if (this.full) return false;
    this.items.push(item);
    return true;
  }

  /** a megadott eszközt veszi ki (vagy az elsőt) */
  take(item?: T): T | null {
    const i = item === undefined ? 0 : this.items.indexOf(item);
    if (i < 0 || i >= this.items.length) return null;
    return this.items.splice(i, 1)[0];
  }
}

/** Egyhelyes tároló (kéz, zseb). */
export class Slot<T> {
  item: T | null = null;

  get empty(): boolean {
    return this.item === null;
  }

  put(item: T): boolean {
    if (this.item !== null) return false;
    this.item = item;
    return true;
  }

  take(): T | null {
    const i = this.item;
    this.item = null;
    return i;
  }
}
