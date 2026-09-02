import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isOwnerEmail, isSuperAdminEmail } from '../../lib/superAdmin';
import { listenSuperAdmins } from '../../lib/superAdminsFirestore';
import { useAuthStore } from '../../store/authStore';

/** Owner o emails en config/superAdmins. */
export function SuperAdminRoute({ children }: { children: ReactNode }) {
  const ready = useAuthStore((s) => s.ready);
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const email = profile?.email ?? firebaseUser?.email ?? null;

  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [listReady, setListReady] = useState(isOwnerEmail(email));

  useEffect(() => {
    if (!ready || !profile) return;
    if (isOwnerEmail(email)) {
      setListReady(true);
      return;
    }
    const unsub = listenSuperAdmins(
      (doc) => {
        setAllowlist(doc?.emails ?? []);
        setListReady(true);
      },
      () => {
        setAllowlist([]);
        setListReady(true);
      },
    );
    return unsub;
  }, [ready, profile, email]);

  if (!ready || (profile && !listReady && !isOwnerEmail(email))) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-950 text-sm text-zinc-500">
        Verificando acceso…
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdminEmail(email, allowlist)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
