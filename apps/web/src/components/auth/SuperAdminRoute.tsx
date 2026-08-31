import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { useAuthStore } from '../../store/authStore';

/** Solo synapsisdev75@gmail.com — puerta trasera super admin. */
export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready);
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const email = profile?.email ?? firebaseUser?.email ?? null;

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-950 text-sm text-zinc-500">
        Verificando acceso…
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdminEmail(email)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
