import { Navigate } from 'react-router-dom';
import { AuthScreen } from '../components/auth/AuthScreen';
import { useAuthStore } from '../store/authStore';

export function LoginView() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-zinc-950 text-sm text-zinc-400">
        Cargando sesión…
      </div>
    );
  }

  if (firebaseUser && profile) {
    return <Navigate to="/" replace />;
  }

  return <AuthScreen />;
}
