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

export async function enterFullscreenLandscape(): Promise<void> {
  try {
    if (canFullscreen() && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* nem támogatott */
  }
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* nem támogatott vagy nincs teljes képernyő */
  }
}

export const isTouch = (): boolean => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
