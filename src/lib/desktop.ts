import { create } from 'zustand';
import { isNewer } from './version';

export type UpdateState =
  | { state: 'idle' | 'checking'; current?: string }
  | { state: 'current'; version: string; current?: string }
  | { state: 'downloading'; version: string; current?: string }
  | { state: 'ready'; version: string; notes?: string; current?: string }
  | { state: 'installer'; version: string; notes?: string; url: string; current?: string }
  | { state: 'unavailable' | 'error'; message: string; current?: string };

interface Updater {
  status: () => Promise<UpdateState>;
  check: () => Promise<UpdateState>;
  apply: () => Promise<void>;
  download: (url: string) => Promise<void>;
  onStatus: (cb: (s: UpdateState) => void) => () => void;
}

interface DesktopBridge {
  platform: string;
  ready: () => void;
  updates: Updater;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: { CapacitorHttp?: { get: (o: { url: string; responseType?: string }) => Promise<{ status: number; data: unknown }> } };
}

/** Present only inside the Mac/Windows desktop app. */
export const desktop = (window as Window & { desktop?: DesktopBridge }).desktop;

const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
/** True inside the Android app (Capacitor). */
export const android = !!capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === 'android';

export const useUpdates = create<{ status: UpdateState; dismissed: string | null; dismiss: () => void }>((set, get) => ({
  status: { state: 'idle' },
  dismissed: null,
  dismiss: () => set({ dismissed: 'version' in get().status ? (get().status as { version: string }).version : null }),
}));

const FEED = `https://github.com/${__UPDATE_REPO__}/releases/latest/download/latest.json`;

/**
 * Android: the app reads the same release feed as the desktop apps and offers the new APK.
 * The request goes through the native HTTP plugin because GitHub's download redirects have no CORS headers.
 */
function androidUpdater(): Updater {
  const store = createStore();
  const current = __APP_VERSION__;
  const set = (s: UpdateState) => (store.status = { ...s, current }, store.listeners.forEach((cb) => cb(store.status)), store.status);
  const check = async (): Promise<UpdateState> => {
    set({ state: 'checking' });
    try {
      const http = capacitor?.Plugins?.CapacitorHttp;
      const res = http ? await http.get({ url: FEED, responseType: 'json' }) : await fetch(FEED, { cache: 'no-store' }).then(async (r) => ({ status: r.status, data: await r.json() }));
      const feed = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as { version?: string; notes?: string; downloads?: { android?: string } };
      if (res.status !== 200 || !feed.version) throw new Error('No update information found.');
      if (isNewer(feed.version, current) && feed.downloads?.android) return set({ state: 'installer', version: feed.version, notes: feed.notes, url: feed.downloads.android });
      return set({ state: 'current', version: current });
    } catch {
      return set({ state: 'error', message: 'Couldn’t check for updates. Are you online?' });
    }
  };
  return {
    status: async () => store.status,
    check,
    apply: async () => {},
    // Leaving the app's own origin hands the link to the system browser, which downloads the APK.
    download: async (url) => void (window.location.href = url),
    onStatus: (cb) => (store.listeners.add(cb), () => store.listeners.delete(cb)),
  };
}

function createStore() {
  return { status: { state: 'idle' } as UpdateState, listeners: new Set<(s: UpdateState) => void>() };
}

/** Whatever can update this copy of the app: the desktop shell, the Android app, or nothing (the PWA updates itself). */
export const appUpdater: Updater | undefined = desktop?.updates ?? (android ? androidUpdater() : undefined);

if (appUpdater) {
  void appUpdater.status().then((status) => useUpdates.setState({ status }));
  appUpdater.onStatus((status) => useUpdates.setState({ status }));
  if (android) {
    void appUpdater.check();
    setInterval(() => void appUpdater.check(), 6 * 3600_000);
  }
}
