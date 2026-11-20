import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installFullscreenKey } from './desktop';
import { isPlayerWindow } from './editor/playerSync';
import { App } from './ui/App';
import { PlayerApp } from './ui/PlayerApp';
import './ui/styles.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './ui/theme.css';
import { applyA11y, syncA11yAcrossWindows } from './ui/a11y/settings';
import { installResponsiveLayout } from './ui/layout';

applyA11y();
syncA11yAcrossWindows();
installResponsiveLayout();

installFullscreenKey();

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPlayerWindow() ? <PlayerApp /> : <App />}</StrictMode>,
);
