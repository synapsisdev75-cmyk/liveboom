import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function ProfileRedirectView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-400">Cargando perfil…</div>;
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={`/u/${encodeURIComponent(profile.handle)}`} replace />;
}
