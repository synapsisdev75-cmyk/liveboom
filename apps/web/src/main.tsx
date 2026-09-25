import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './appearance.css';
import './responsive/universal.css';
import './responsive/mobile-tablet/landscape-explore.css';
import { installViewportSync } from './responsive/syncViewport';

// Fuerza HTTPS en producción (evita “No es seguro” y Failed to fetch por mixed content).
if (
  typeof window !== 'undefined' &&
  window.location.protocol === 'http:' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
) {
  window.location.replace(
    `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró #root');
}

installViewportSync();

// APK: el WebView se dibuja detrás de la barra de estado, sin fondo nativo encima.
if (Capacitor.getPlatform() === 'android') {
  document.documentElement.classList.add('lb-android-native');
}
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: true }).catch(console.error);
  StatusBar.setStyle({ style: Style.Dark }).catch(console.error);
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
