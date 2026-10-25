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
