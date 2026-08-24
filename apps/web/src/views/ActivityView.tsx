import { Link } from 'react-router-dom';
import { ActivityHistory } from '../components/live/ActivityHistory';
import { useAuthStore } from '../store/authStore';

export function ActivityView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-400">Cargando actividad…</div>;
  }
  if (!profile) {
    return (
      <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-400">
        <Link to="/login" className="text-cyan-400 underline">
          Inicia sesión
        </Link>{' '}
        para ver tu historial de lives.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <ActivityHistory username={profile.handle} limit={16} showAllLink={false} />
    </div>
  );
}
