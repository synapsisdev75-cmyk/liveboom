import { Compass, Home, MessageCircle, Radio, UserRound, Wallet } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const navItems = [
  { label: 'Inicio', icon: Home, to: '/' as const },
  { label: 'Explorar', icon: Compass, to: null },
  { label: 'Mensajes', icon: MessageCircle, to: null },
  { label: 'Mi Billetera', icon: Wallet, to: '/billetera' as const },
  { label: 'Perfil', icon: UserRound, to: '/perfil' as const },
];

const activeClass =
  'flex items-center gap-3 rounded-xl border border-cyan-400 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.35)]';
const idleClass =
  'flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-white';

export function MainLayout() {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 font-sans text-white">
      <aside className="flex w-[20%] min-w-[220px] shrink-0 flex-col border-r border-zinc-800 px-5 py-6">
        <Link
          to="/"
          className="bg-gradient-to-r from-cyan-400 to-fuchsia-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent"
        >
          Liveboom
        </Link>

        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (!item.to) {
              return (
                <span key={item.label} className={idleClass}>
                  <Icon size={18} strokeWidth={1.8} />
                  {item.label}
                </span>
              );
            }

            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? activeClass : idleClass)}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                    {item.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <NavLink
          to="/transmitir"
          className={({ isActive }) =>
            `mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-3 text-sm font-bold text-zinc-950 shadow-[0_0_24px_rgba(255,0,85,0.35)] transition hover:brightness-110 ${
              isActive ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-950' : ''
            }`
          }
        >
          <Radio size={16} />
          Transmitir
        </NavLink>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3">
          {profile ? (
            <>
              <p className="truncate text-sm font-semibold text-white">@{profile.handle}</p>
              <p className="mt-1 text-xs text-cyan-400">{profile.coinsBalance} coins</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-3 w-full text-left text-xs text-zinc-500 hover:text-white"
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link to="/login" className="text-sm font-medium text-cyan-400 hover:text-white">
              Iniciar sesión
            </Link>
          )}
        </div>
      </aside>

      <main className="w-[60%] min-w-[0] flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>

      <aside className="flex w-[20%] min-w-[240px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
        <section className="border-b border-zinc-800 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Top Donadores
          </h2>
          <p className="mt-3 text-sm text-zinc-400">El ranking aparecerá aquí.</p>
        </section>
        <section className="flex flex-1 flex-col p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Chat en vivo
          </h2>
          <p className="mt-3 text-sm text-zinc-400">Los mensajes del live se listarán aquí.</p>
        </section>
      </aside>
    </div>
  );
}
