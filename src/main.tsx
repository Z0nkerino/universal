import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { Shell } from './app/Shell';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
