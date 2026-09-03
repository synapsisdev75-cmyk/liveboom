import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './responsive/mobile-tablet/landscape-explore.css';

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

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
