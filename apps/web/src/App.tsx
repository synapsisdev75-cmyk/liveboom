import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { useAuthStore } from './store/authStore';
import { LoginView } from './views/LoginView';
import { CookieBanner } from './components/legal/CookieBanner';
import { CallOverlay } from './components/social/CallOverlay';
import { SuperAdminRoute } from './components/auth/SuperAdminRoute';
import { useLevelsConfigStore } from './store/levelsConfigStore';
import { useCatalogConfigStore } from './store/catalogConfigStore';
import { useCommunityHeaderStore } from './store/communityHeaderStore';
import { useAppearanceStore } from './store/appearanceStore';
import { ThemeProvider } from './components/appearance/ThemeProvider';
import { useLocaleStore } from './store/localeStore';
import { idlePrefetchRoutes } from './lib/routePrefetch';
import { prepareNativeLiveWebView, ensureNativeEssentialPermissions } from './lib/nativeLiveMedia';
import { registerPushNotifications } from './lib/pushNotifications';

const HomeView = lazy(() =>
  import('./views/HomeView').then((m) => ({ default: m.HomeView })),
);
const ProfileView = lazy(() =>
  import('./views/ProfileView').then((m) => ({ default: m.ProfileView })),
);
const ProfileRedirectView = lazy(() =>
  import('./views/ProfileRedirectView').then((m) => ({ default: m.ProfileRedirectView })),
);
const LiveRoom = lazy(() =>
  import('./views/LiveRoom').then((m) => ({ default: m.LiveRoom })),
);
const TransmitView = lazy(() =>
  import('./views/TransmitView').then((m) => ({ default: m.TransmitView })),
);
const UserProfileView = lazy(() =>
  import('./views/UserProfileView').then((m) => ({ default: m.UserProfileView })),
);
const SearchView = lazy(() =>
  import('./views/SearchView').then((m) => ({ default: m.SearchView })),
);
const LegalView = lazy(() =>
  import('./views/LegalView').then((m) => ({ default: m.LegalView })),
);
const WalletView = lazy(() =>
  import('./views/WalletView').then((m) => ({ default: m.WalletView })),
);
const ExploreView = lazy(() =>
  import('./views/ExploreView').then((m) => ({ default: m.ExploreView })),
);
const MessagesView = lazy(() =>
  import('./views/MessagesView').then((m) => ({ default: m.MessagesView })),
);
const ActivityView = lazy(() =>
  import('./views/ActivityView').then((m) => ({ default: m.ActivityView })),
);
const CreateView = lazy(() =>
  import('./views/CreateView').then((m) => ({ default: m.CreateView })),
);
const GamingSpaceView = lazy(() =>
  import('./views/GamingSpaceView').then((m) => ({ default: m.GamingSpaceView })),
);
const TrendsView = lazy(() =>
  import('./views/TrendsView').then((m) => ({ default: m.TrendsView })),
);
const GroupsView = lazy(() =>
  import('./views/GroupsView').then((m) => ({ default: m.GroupsView })),
);
const SuperAdminView = lazy(() =>
  import('./views/SuperAdminView').then((m) => ({ default: m.SuperAdminView })),
);
const WithdrawalVerificationView = lazy(() =>
  import('./views/WithdrawalVerificationView').then((m) => ({
    default: m.WithdrawalVerificationView,
  })),
);

function RouteFallback() {
  return (
    <div className="grid min-h-[40dvh] w-full place-items-center text-sm text-zinc-500">
      Cargando…
    </div>
  );
}

function AuthHydrator() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrateLevels = useLevelsConfigStore((state) => state.hydrate);
  const hydrateCatalog = useCatalogConfigStore((state) => state.hydrate);
  const hydrateCommunityHeader = useCommunityHeaderStore((state) => state.hydrate);
  const hydrateAppearance = useAppearanceStore((state) => state.hydrateFromCloud);
  const hydrateLocale = useLocaleStore((state) => state.hydrateFromCloud);
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? null);
  const ready = useAuthStore((state) => state.ready);

  useEffect(() => {
    const unsubLevels = hydrateLevels();
    const unsubCatalog = hydrateCatalog();
    const unsubCommunity = hydrateCommunityHeader();
    const unsubAuth = hydrate();
    void prepareNativeLiveWebView();
    // Android: pide cámara, mic, notificaciones, galería y Bluetooth al abrir.
    // El push FCM se registra después (necesita POST_NOTIFICATIONS concedido).
    void ensureNativeEssentialPermissions();
    return () => {
      unsubLevels();
      unsubCatalog();
      unsubCommunity();
      unsubAuth();
    };
  }, [hydrate, hydrateLevels, hydrateCatalog, hydrateCommunityHeader]);

  useEffect(() => {
    if (!ready) return;
    void hydrateAppearance(uid);
    void hydrateLocale(uid);
    // Primero permisos nativos, luego token FCM (avisos tipo Facebook en barra).
    void ensureNativeEssentialPermissions()
      .then(() => registerPushNotifications(uid))
      .catch(() => {
        void registerPushNotifications(uid);
      });
  }, [ready, uid, hydrateAppearance, hydrateLocale]);

  useEffect(() => {
    if (!ready) return;
    idlePrefetchRoutes();
  }, [ready]);

  return null;
}

/** Frontend + Firebase Auth sincronizado con PostgreSQL. */
export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthHydrator />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/registro" element={<LoginView />} />
          <Route path="/legal/:slug" element={<LegalView />} />
          <Route path="/stream/:username" element={<LiveRoom />} />
          <Route element={<MainLayout />}>
            <Route index element={<HomeView />} />
            <Route path="explorar" element={<ExploreView />} />
            <Route path="tendencias" element={<TrendsView />} />
            <Route path="grupos" element={<GroupsView />} />
            <Route path="crear" element={<CreateView />} />
            <Route path="espacio-gaming" element={<GamingSpaceView />} />
            <Route path="u/:username" element={<UserProfileView />} />
            <Route path="billetera" element={<WalletView />} />
            <Route path="wallet/withdraw/verification" element={<WithdrawalVerificationView />} />
            <Route path="billetera/retiro/verificacion" element={<WithdrawalVerificationView />} />
            <Route path="perfil" element={<ProfileRedirectView />} />
            <Route path="perfil/editar" element={<ProfileView />} />
            <Route path="buscar" element={<SearchView />} />
            <Route path="mensajes" element={<MessagesView />} />
            <Route path="actividad" element={<ActivityView />} />
            <Route path="transmitir" element={<TransmitView />} />
            <Route
              path="super-admin"
              element={
                <SuperAdminRoute>
                  <SuperAdminView />
                </SuperAdminRoute>
              }
            />
            <Route
              path="super-admin/verificaciones-retiro"
              element={
                <SuperAdminRoute>
                  <SuperAdminView />
                </SuperAdminRoute>
              }
            />
            <Route
              path="superadmin/withdrawal-verifications"
              element={
                <SuperAdminRoute>
                  <SuperAdminView />
                </SuperAdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <CallOverlay />
      <CookieBanner />
    </BrowserRouter>
    </ThemeProvider>
  );
}
