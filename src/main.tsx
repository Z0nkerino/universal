import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { Shell } from './app/Shell';
import { useSettings } from './lib/settings';
import './lib/install';

// Running inside the desktop app (Electron)? Lets CSS make room for the macOS window controls.
const desktop = (window as Window & { desktop?: { platform: string } }).desktop;
if (desktop) document.documentElement.dataset.shell = desktop.platform === 'darwin' ? 'mac' : 'desktop';

void useSettings.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
