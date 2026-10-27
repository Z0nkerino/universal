import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { Shell } from './app/Shell';

import { ConfirmHost } from './ui/Confirm';
import { useProfiles } from './lib/profiles';
import { likelyRussian, loadRussian } from './lib/i18n';

const LockScreen = lazy(() => import('./features/account/LockScreen').then((m) => ({ default: m.LockScreen })));
import { useSettings } from './lib/settings';
import './lib/install';
import { desktop } from './lib/desktop';

// Running inside the desktop app (Electron)? Lets CSS make room for the macOS window controls.
if (desktop) {
  document.documentElement.dataset.shell = desktop.platform === 'darwin' ? 'mac' : 'desktop';
  // Confirms this version booted, so the updater doesn't roll it back.
  requestAnimationFrame(() => desktop?.ready());
}

void useSettings.getState().hydrate();

/** A profile with a PIN shows the lock screen until it's unlocked. */
function Root() {
  const unlocked = useProfiles((s) => s.unlocked);
  return unlocked ? (
    <Shell />
  ) : (
    <Suspense fallback={null}>
      <LockScreen />
      <ConfirmHost />
    </Suspense>
  );
}

// Russian speakers get their dictionary before the first render, so nothing flashes in English.
void (likelyRussian() ? loadRussian().catch(() => {}) : Promise.resolve()).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  ),
);
