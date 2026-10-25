/** Minimális típusos eseménybusz. */
export class Emitter<M extends Record<string, unknown>> {
  private map = new Map<keyof M, ((p: never) => void)[]>();

  on<K extends keyof M>(k: K, fn: (p: M[K]) => void): () => void {
    const list = this.map.get(k) ?? [];
    list.push(fn as (p: never) => void);
    this.map.set(k, list);
    return () => {
      const l = this.map.get(k);
      if (l) l.splice(l.indexOf(fn as (p: never) => void), 1);
    };
  }

  emit<K extends keyof M>(k: K, p: M[K]): void {
    const list = this.map.get(k);
    if (list) for (const fn of list.slice()) (fn as (p: M[K]) => void)(p);
  }

  clear(): void {
    this.map.clear();
  }
}
