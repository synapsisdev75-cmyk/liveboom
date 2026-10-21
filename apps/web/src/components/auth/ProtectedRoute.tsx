import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/** Exige sesión de Firebase + perfil en PostgreSQL para entrar al MainLayout. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready);
  const profile = useAuthStore((s) => s.profile);

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-500">
        Cargando Liveboom…
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
