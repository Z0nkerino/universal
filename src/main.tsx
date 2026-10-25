import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { Shell } from './app/Shell';
import { useSettings } from './lib/settings';
import './lib/install';

void useSettings.getState().hydrate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
