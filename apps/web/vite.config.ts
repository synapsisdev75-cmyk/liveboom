import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const defaultApi = 'https://liveboom.vercel.app';
  const rawApi = (env.VITE_API_URL || defaultApi).replace(/\/$/, '');
  // .env.local suele tener localhost; en build de producción nunca debe publicarse.
  const apiOnline =
    mode === 'production' && /localhost|127\.0\.0\.1/.test(rawApi)
      ? 'https://liveboom.vercel.app'
      : rawApi;

  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: ['react-router-dom', 'firebase/app', 'firebase/auth'],
      exclude: ['deepar'],
    },
    assetsInclude: ['**/*.wasm'],
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
