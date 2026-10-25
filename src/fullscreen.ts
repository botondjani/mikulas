/** Teljes képernyő és fekvő tájolás – hibatűrően (iPhone Safari nem támogatja). */
export const canFullscreen = (): boolean => !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await enterFullscreenLandscape();
  } catch {
    /* nem támogatott */
  }
}

/** Legfeljebb `ms` ideig vár a promise-ra (egyes böngészőkben sosem teljesül). */
const atMost = (p: Promise<unknown> | undefined, ms: number): Promise<unknown> =>
  Promise.race([Promise.resolve(p).catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);

/**
 * Teljes képernyő és fekvő tájolás. Soha nem blokkol: a tájolás-zár ígérete néhány
 * Androidon sosem teljesül (csak a teljes képernyőből kilépve), ezért nem várunk rá.
 */
export async function enterFullscreenLandscape(): Promise<void> {
  try {
    if (canFullscreen() && !document.fullscreenElement)
      await atMost(document.documentElement.requestFullscreen({ navigationUI: 'hide' }), 800);
  } catch {
    /* nem támogatott */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    void o.lock?.('landscape').catch(() => undefined);
  } catch {
    /* nem támogatott */
  }
}

export const isTouch = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
