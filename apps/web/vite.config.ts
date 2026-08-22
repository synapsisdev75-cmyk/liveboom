import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOnline = (env.VITE_API_URL || 'https://liveboom.vercel.app').replace(/\/$/, '');

  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: ['react-router-dom', 'firebase/app', 'firebase/auth'],
    },
    define: {
      // Garantiza API en línea aunque .env venga vacío en el build de Hosting/Vercel
      'import.meta.env.VITE_API_URL': JSON.stringify(apiOnline),
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
