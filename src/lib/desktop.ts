import { create } from 'zustand';

export type UpdateState =
  | { state: 'idle' | 'checking'; current?: string }
  | { state: 'current'; version: string; current?: string }
  | { state: 'downloading'; version: string; current?: string }
  | { state: 'ready'; version: string; notes?: string; current?: string }
  | { state: 'installer'; version: string; notes?: string; url: string; current?: string }
  | { state: 'unavailable' | 'error'; message: string; current?: string };

interface DesktopBridge {
  platform: string;
  ready: () => void;
  updates: {
    status: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    apply: () => Promise<void>;
    download: (url: string) => Promise<void>;
    onStatus: (cb: (s: UpdateState) => void) => () => void;
  };
}

/** Present only inside the Mac/Windows desktop app. */
export const desktop = (window as Window & { desktop?: DesktopBridge }).desktop;

export const useUpdates = create<{ status: UpdateState; dismissed: string | null; dismiss: () => void }>((set, get) => ({
  status: { state: 'idle' },
  dismissed: null,
  dismiss: () => set({ dismissed: 'version' in get().status ? (get().status as { version: string }).version : null }),
}));

if (desktop) {
  void desktop.updates.status().then((status) => useUpdates.setState({ status }));
  desktop.updates.onStatus((status) => useUpdates.setState({ status }));
}
