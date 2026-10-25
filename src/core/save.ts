/** localStorage-alapú mentés; ha nem elérhető, memóriában tárol. */
export interface Store<T> {
  get(): T;
  set(v: T): void;
  update(fn: (v: T) => T): T;
}

export function createStore<T>(key: string, defaults: T): Store<T> {
  let mem: T = load();

  function load(): T {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (raw) return { ...defaults, ...JSON.parse(raw) } as T;
    } catch {
      /* privát mód, tiltott tároló vagy hibás JSON: alapértékek */
    }
    return structuredClone(defaults);
  }

  return {
    get: () => mem,
    set(v) {
      mem = v;
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(v));
      } catch {
        /* nem baj, memóriában megmarad */
      }
    },
    update(fn) {
      this.set(fn(mem));
      return mem;
    },
  };
}
