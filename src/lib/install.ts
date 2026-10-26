import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const useInstall = create<{ event: BeforeInstallPromptEvent | null; installed: boolean; prompt: () => Promise<void> }>((set, get) => ({
  event: null,
  installed: typeof window !== 'undefined' && standalone(),
  prompt: async () => {
    const e = get().event;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ event: null, installed: outcome === 'accepted' });
  },
}));

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  useInstall.setState({ event: e as BeforeInstallPromptEvent });
});
addEventListener('appinstalled', () => useInstall.setState({ installed: true, event: null }));

export const platform = (() => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'other';
})();
