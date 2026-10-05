import { Navigate } from 'react-router-dom';
import { AuthScreen } from '../components/auth/AuthScreen';
import { VerifyEmailScreen } from '../components/auth/VerifyEmailScreen';
import { useAuthStore } from '../store/authStore';

export function LoginView() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useAuthStore((state) => state.profile);
  const pendingVerifyUser = useAuthStore((state) => state.pendingVerifyUser);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) return null;

  if (firebaseUser && profile) {
    return <Navigate to="/explorar" replace />;
  }

  if (pendingVerifyUser) return <VerifyEmailScreen />;

  return <AuthScreen />;
}
