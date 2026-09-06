import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { useAuthStore } from './store/authStore';
import { HomeView } from './views/HomeView';
import { LoginView } from './views/LoginView';
import { ProfileView } from './views/ProfileView';
import { ProfileRedirectView } from './views/ProfileRedirectView';
import { LiveRoom } from './views/LiveRoom';
import { TransmitView } from './views/TransmitView';
import { UserProfileView } from './views/UserProfileView';
import { SearchView } from './views/SearchView';
import { LegalView } from './views/LegalView';
import { CookieBanner } from './components/legal/CookieBanner';
import { CallOverlay } from './components/social/CallOverlay';
import { WalletView } from './views/WalletView';
import { ExploreView } from './views/ExploreView';
import { MessagesView } from './views/MessagesView';
import { ActivityView } from './views/ActivityView';
import { CreateView } from './views/CreateView';
import { TrendsView } from './views/TrendsView';
import { GroupsView } from './views/GroupsView';
import { SuperAdminView } from './views/SuperAdminView';
import { SuperAdminRoute } from './components/auth/SuperAdminRoute';
import { useLevelsConfigStore } from './store/levelsConfigStore';
import { useAppearanceStore } from './store/appearanceStore';
import { ThemeProvider } from './components/appearance/ThemeProvider';

function AuthHydrator() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrateLevels = useLevelsConfigStore((state) => state.hydrate);
  const hydrateAppearance = useAppearanceStore((state) => state.hydrateFromCloud);
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? null);
  const ready = useAuthStore((state) => state.ready);

  useEffect(() => {
    const unsubLevels = hydrateLevels();
    const unsubAuth = hydrate();
    return () => {
      unsubLevels();
      unsubAuth();
    };
  }, [hydrate, hydrateLevels]);

  useEffect(() => {
    if (!ready) return;
    void hydrateAppearance(uid);
  }, [ready, uid, hydrateAppearance]);

  return null;
}

/** Frontend + Firebase Auth sincronizado con PostgreSQL. */
export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthHydrator />
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
          <Route path="u/:username" element={<UserProfileView />} />
          <Route path="billetera" element={<WalletView />} />
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CallOverlay />
      <CookieBanner />
    </BrowserRouter>
    </ThemeProvider>
  );
}
