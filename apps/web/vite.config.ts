import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawApi = (env.VITE_API_URL || '').replace(/\/$/, '');
  const apiOnline =
    mode === 'production' && (/localhost|127\.0\.0\.1|vercel\.app/i.test(rawApi) || !rawApi)
      ? ''
      : rawApi;

  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: ['react-router-dom', 'firebase/app', 'firebase/auth'],
      exclude: ['deepar'],
    },
    assetsInclude: ['**/*.wasm'],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiOnline),
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
