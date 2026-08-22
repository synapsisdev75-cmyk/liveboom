import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function TransmitView() {
  const profile = useAuthStore((state) => state.profile);

  if (!profile) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl bg-zinc-900">
        <p className="text-sm text-zinc-400">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para transmitir.
        </p>
      </div>
    );
  }

  return <Navigate to={`/stream/${profile.handle}`} replace />;
}
