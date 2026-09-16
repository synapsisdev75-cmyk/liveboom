/**
 * Precarga silenciosa de chunks de vistas (React.lazy).
 * Idempotente: cada ruta se importa una sola vez.
 */

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  '/': () => import('../views/HomeView'),
  '/explorar': () => import('../views/ExploreView'),
  '/tendencias': () => import('../views/TrendsView'),
  '/grupos': () => import('../views/GroupsView'),
  '/crear': () => import('../views/CreateView'),
  '/espacio-gaming': () => import('../views/GamingSpaceView'),
  '/billetera': () => import('../views/WalletView'),
  '/perfil': () => import('../views/ProfileRedirectView'),
  '/perfil/editar': () => import('../views/ProfileView'),
  '/buscar': () => import('../views/SearchView'),
  '/mensajes': () => import('../views/MessagesView'),
  '/actividad': () => import('../views/ActivityView'),
  '/transmitir': () => import('../views/TransmitView'),
  '/stream': () => import('../views/LiveRoom'),
  '/super-admin': () => import('../views/SuperAdminView'),
  '/legal': () => import('../views/LegalView'),
};

const cache = new Map<string, Promise<unknown>>();

function resolveLoader(path: string): Loader | null {
  const clean = path.split('?')[0]?.split('#')[0] || path;
  const exact = loaders[clean];
  if (exact) return exact;
  if (clean.startsWith('/stream/') || clean === '/stream') return loaders['/stream'] ?? null;
  if (clean.startsWith('/u/')) return () => import('../views/UserProfileView');
  if (clean.startsWith('/legal/')) return loaders['/legal'] ?? null;
  if (clean.startsWith('/perfil/editar')) return loaders['/perfil/editar'] ?? null;
  return null;
}

/** Precarga el chunk de una ruta si existe loader. */
export function prefetchRoute(path: string): void {
  if (typeof window === 'undefined') return;
  const loader = resolveLoader(path);
  if (!loader) return;
  const key = path.startsWith('/stream')
    ? '/stream'
    : path.startsWith('/u/')
      ? '/u/:username'
      : path.startsWith('/legal/')
        ? '/legal'
        : path.split('?')[0] || path;
  if (cache.has(key)) return;
  const promise = loader().catch(() => {
    cache.delete(key);
  });
  cache.set(key, promise);
}

const IDLE_PATHS = ['/explorar', '/mensajes', '/transmitir', '/buscar', '/billetera', '/'] as const;

/** Precarga rutas frecuentes en idle (tras auth / shell listo). */
export function idlePrefetchRoutes(paths: readonly string[] = IDLE_PATHS): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    for (const path of paths) prefetchRoute(path);
  };
  const ric = window.requestIdleCallback?.bind(window);
  if (ric) {
    ric(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1200);
  }
}

/** Warm de chunks LIVE (sala + SDKs) sin abrir cámara. */
export function warmLiveGoLiveChunks(): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    prefetchRoute('/stream');
    void import('livekit-client').catch(() => undefined);
    void import('agora-rtc-sdk-ng').catch(() => undefined);
  };
  const ric = window.requestIdleCallback?.bind(window);
  if (ric) {
    ric(run, { timeout: 3000 });
  } else {
    window.setTimeout(run, 800);
  }
}
