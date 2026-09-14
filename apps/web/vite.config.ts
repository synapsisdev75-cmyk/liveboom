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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('livekit') || id.includes('@livekit')) return 'livekit';
              if (id.includes('agora-rtc-sdk-ng')) return 'agora';
              if (id.includes('firebase')) return 'firebase';
            }
            return undefined;
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
