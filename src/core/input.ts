/** Platformfüggetlen bemenet egy szimulációs lépésre. */
export interface InputFrame {
  /** mozgás iránya és ereje, -1..1 (hossza legfeljebb 1) */
  mx: number;
  my: number;
  /** élre: ebben a lépésben nyomták meg */
  interact: boolean;
  /** csendben-mód (állapot, nem él) */
  quiet: boolean;
  /** elbújás (állapot): lassú, de nem látják */
  hide: boolean;
  /** közvetlen választás (pl. tárgy a szánról); null ha nincs */
  pick: string | null;
}

export const emptyInput = (): InputFrame => ({ mx: 0, my: 0, interact: false, quiet: false, hide: false, pick: null });

/** A mozgásvektor hosszát 1-re vágja. */
export function clampMove(f: InputFrame): InputFrame {
  const l = Math.hypot(f.mx, f.my);
  if (l > 1) {
    f.mx /= l;
    f.my /= l;
  }
  return f;
}
