import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { syncPublicGeo } from './lib/publicGeo';
import { prepareNativeLiveWebView, ensureNativeEssentialPermissions } from './lib/nativeLiveMedia';
import { registerPushNotifications } from './lib/pushNotifications';
import { GlobalBoomAnimationOverlay } from './components/global/GlobalBoomAnimationOverlay';
import { BootSplash } from './components/brand/BootSplash';
import { flushPendingShare, installSharedLinkOpener } from './lib/openSharedLink';
import { installShareIncomingListener, peekPendingIncomingShare, SHARE_INCOMING_EVENT } from './lib/shareIncoming';

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
const CreatorsView = lazy(() =>
  import('./views/CreatorsView').then((m) => ({ default: m.CreatorsView })),
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
const RewardsView = lazy(() =>
  import('./views/RewardsView').then((m) => ({ default: m.RewardsView })),
);
const LocationView = lazy(() => import('./views/LocationView'));
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
    installSharedLinkOpener();
    installShareIncomingListener();
    // Android: notificaciones / media / bluetooth al abrir.
    // Cámara y micrófono solo al transmitir, Sala Boom o llamadas (ensureNativeLiveAvPermissions).
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
    void flushPendingShare();
    // Reintentar share nativo por si el intent llegó tras el primer paint.
    installShareIncomingListener();
  }, [ready, uid]);

  useEffect(() => {
    if (!ready || !uid) return;
    const timer = window.setTimeout(() => {
      void syncPublicGeo(uid);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [ready, uid]);

  return null;
}

function ShareIncomingRouter() {
  const navigate = useNavigate();
  const ready = useAuthStore((state) => state.ready);

  useEffect(() => {
    function onShare() {
      navigate('/crear');
    }
    window.addEventListener(SHARE_INCOMING_EVENT, onShare);
    return () => window.removeEventListener(SHARE_INCOMING_EVENT, onShare);
  }, [navigate]);

  // Si el share llegó antes de montar /crear (o auth aún hidrataba), reintenta.
  useEffect(() => {
    if (!ready) return;
    if (peekPendingIncomingShare()) {
      navigate('/crear');
    }
  }, [ready, navigate]);

  return null;
}

function PendingEmailVerificationRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const pending = useAuthStore((state) => Boolean(state.pendingVerifyUser));

  useEffect(() => {
    if (!pending) return;
    const path = location.pathname;
    if (path === '/login' || path === '/registro' || path.startsWith('/legal/')) return;
    navigate('/login', { replace: true });
  }, [pending, location.pathname, navigate]);

  return null;
}

/** Frontend + Firebase Auth sincronizado con PostgreSQL. */
export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthHydrator />
      <ShareIncomingRouter />
      <PendingEmailVerificationRedirect />
      <BootSplash />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/registro" element={<LoginView />} />
          <Route path="/legal/:slug" element={<LegalView />} />
          <Route path="/ubicacion" element={<LocationView />} />
          <Route path="/stream/:username" element={<LiveRoom />} />
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="/explorar" replace />} />
            <Route path="inicio" element={<HomeView />} />
            <Route path="explorar" element={<ExploreView />} />
            <Route path="tendencias" element={<TrendsView />} />
            <Route path="grupos" element={<GroupsView />} />
            <Route path="crear" element={<CreateView />} />
            <Route path="espacio-gaming" element={<GamingSpaceView />} />
            <Route path="u/:username" element={<UserProfileView />} />
            <Route path="billetera" element={<WalletView />} />
            <Route path="recompensas" element={<RewardsView />} />
            <Route path="wallet/withdraw/verification" element={<WithdrawalVerificationView />} />
            <Route path="billetera/retiro/verificacion" element={<WithdrawalVerificationView />} />
            <Route path="perfil" element={<ProfileRedirectView />} />
            <Route path="perfil/editar" element={<ProfileView />} />
            <Route path="buscar" element={<SearchView />} />
            <Route path="creadores" element={<CreatorsView />} />
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
      <GlobalBoomAnimationOverlay />
      <CallOverlay />
      <CookieBanner />
    </BrowserRouter>
    </ThemeProvider>
  );
}
