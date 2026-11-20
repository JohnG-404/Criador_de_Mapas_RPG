import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installFullscreenKey } from './desktop';
import { isPlayerWindow } from './editor/playerSync';
import { App } from './ui/App';
import { PlayerApp } from './ui/PlayerApp';
import './ui/styles.css';

installFullscreenKey();

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPlayerWindow() ? <PlayerApp /> : <App />}</StrictMode>,
);
