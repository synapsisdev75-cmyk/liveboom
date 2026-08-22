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
import { WalletView } from './views/WalletView';

function AuthHydrator() {
  const hydrate = useAuthStore((state) => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);
  return null;
}

/** Frontend + Firebase Auth sincronizado con PostgreSQL. */
export default function App() {
  return (
    <BrowserRouter>
      <AuthHydrator />
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/stream/:username" element={<LiveRoom />} />
        <Route element={<MainLayout />}>
          <Route index element={<HomeView />} />
          <Route path="u/:username" element={<UserProfileView />} />
          <Route path="billetera" element={<WalletView />} />
          <Route path="perfil" element={<ProfileRedirectView />} />
          <Route path="perfil/editar" element={<ProfileView />} />
          <Route path="buscar" element={<SearchView />} />
          <Route path="transmitir" element={<TransmitView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
