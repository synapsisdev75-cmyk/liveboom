import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { emoticonesCatalogPlugin } from './scripts/emoticonesCatalogPlugin.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawApi = (env.VITE_API_URL || '').replace(/\/$/, '');
  const apiOnline =
    mode === 'production' && (/localhost|127\.0\.0\.1|vercel\.app/i.test(rawApi) || !rawApi)
      ? ''
      : rawApi;

  return {
    plugins: [react(), tailwindcss(), emoticonesCatalogPlugin()],
    optimizeDeps: {
      include: ['react-router-dom', 'firebase/app', 'firebase/auth'],
      exclude: ['deepar'],
    },
    assetsInclude: ['**/*.wasm'],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiOnline),
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // React primero: los grupos arrastran sus dependencias y sin esto React quedaba dentro de
              // LiveKit, obligando a descargar LiveKit en el arranque.
              { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
              { name: 'livekit', test: /[\\/]node_modules[\\/](livekit-client|@livekit)[\\/]/, priority: 2 },
              { name: 'agora', test: /[\\/]node_modules[\\/]agora-rtc-sdk-ng[\\/]/, priority: 2 },
              { name: 'firebase', test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/, priority: 1 },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
