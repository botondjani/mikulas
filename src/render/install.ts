/** PWA-telepítés: Androidon a böngésző saját párbeszédablaka egy gombnyomásra. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});
window.addEventListener('appinstalled', () => (deferred = null));

const standalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const installPrompt = {
  available: (): boolean => deferred !== null && !standalone(),
  isIos: (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone(),
  async prompt(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    deferred = null;
  },
};
