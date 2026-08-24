import { Home, Menu, MessageCircle, Compass, Radio, Search, Settings, UserRound, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { CoinModal, RechargeButton } from '../wallet/CoinModal';
import { NotificationBell, SideRailPanel } from './SideRailPanel';
import { LegalFooter } from '../legal/LegalFooter';
import { Logo } from '../brand/Logo';

const sideNavItems = [
  { label: 'Inicio', icon: Home, to: '/' as const },
  { label: 'Explorar', icon: Compass, to: '/explorar' as const },
  { label: 'Mi Billetera', icon: Wallet, to: '/billetera' as const },
  { label: 'Perfil', icon: UserRound, to: '/perfil' as const },
  { label: 'Buscar amigos', icon: Search, to: '/buscar' as const },
  { label: 'Mensajes', icon: MessageCircle, to: '/mensajes' as const },
  { label: 'Configuración', icon: Settings, to: '/perfil/editar' as const },
];

const mobileNavItems = [
  { label: 'Inicio', icon: Home, to: '/' as const },
  { label: 'Explorar', icon: Compass, to: '/explorar' as const },
  { label: 'Live', icon: Radio, to: '/transmitir' as const },
  { label: 'Perfil', icon: UserRound, to: '/perfil' as const },
];

const activeClass =
  'flex items-center gap-3 rounded-xl border border-cyan-400 bg-zinc-800 px-3 py-2.5 text-sm font-medium text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.35)]';
const idleClass =
  'flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-900 hover:text-white';

export function MainLayout() {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const toast = useUiStore((state) => state.toast);
  const toastTone = useUiStore((state) => state.toastTone);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const chatFull = location.pathname.startsWith('/mensajes');

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-zinc-950 font-sans text-white lg:flex-row">
      {/* Top bar — mobile only */}
      {!chatFull ? (
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 lg:hidden">
        <Link to="/" className="block">
          <Logo compact />
        </Link>
        <div className="flex items-center gap-2">
          {profile ? <NotificationBell /> : null}
          {profile ? (
            <button
              type="button"
              onClick={() => setRechargeOpen(true)}
              className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-500/30"
            >
              {profile.coinsBalance.toLocaleString('es-CO')} coins
            </button>
          ) : (
            <Link to="/login" className="text-xs font-medium text-cyan-400">
              Entrar
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-900 text-zinc-300"
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>
      ) : null}

      {/* Left sidebar — desktop */}
      {!chatFull ? (
      <aside className="hidden w-[20%] min-w-[220px] shrink-0 flex-col border-r border-zinc-800 px-5 py-6 lg:flex">
        <Link to="/" className="block">
          <Logo />
        </Link>

        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {sideNavItems.map((item) => {
            const Icon = item.icon;
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
              <RechargeButton onClick={() => setRechargeOpen(true)} className="mt-3 w-full text-sm" />
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
        <LegalFooter compact />
      </aside>
      ) : null}

      <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${
        chatFull
          ? 'p-0'
          : 'p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-4 lg:w-[60%] lg:pb-4'
      }`}>
        <Outlet />
      </main>

      {!chatFull ? <SideRailPanel /> : null}

      {/* Bottom nav — mobile */}
      {!chatFull ? (
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-4 px-1 pt-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 px-2 py-2 text-[10px] font-semibold ${
                      isActive ? 'text-cyan-400' : 'text-zinc-500'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-xl ${
                          isActive
                            ? 'bg-cyan-400/15 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                            : 'bg-transparent'
                        }`}
                      >
                        <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      ) : null}

      {/* Mobile slide-over menu */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Menú</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-zinc-400"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
            {profile ? (
              <div className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3">
                <p className="truncate text-sm font-semibold text-white">@{profile.handle}</p>
                <p className="mt-1 text-xs text-cyan-400">{profile.coinsBalance} coins</p>
                <RechargeButton
                  onClick={() => {
                    setMenuOpen(false);
                    setRechargeOpen(true);
                  }}
                  className="mt-3 w-full text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                  className="mt-3 w-full text-left text-xs text-zinc-500 hover:text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="mb-5 text-sm font-medium text-cyan-400"
              >
                Iniciar sesión
              </Link>
            )}
            <nav className="flex flex-col gap-1">
              {sideNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => (isActive ? activeClass : idleClass)}
                  >
                    <Icon size={18} />
                    {item.label}
                  </NavLink>
                );
              })}
              <NavLink
                to="/transmitir"
                onClick={() => setMenuOpen(false)}
                className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 py-3 text-sm font-bold text-zinc-950"
              >
                <Radio size={16} />
                Transmitir
              </NavLink>
            </nav>
          </div>
        </div>
      ) : null}

      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}

      {toast ? (
        <div
          className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm font-semibold text-white shadow-lg lg:bottom-6 ${
            toastTone === 'success'
              ? 'bg-emerald-500'
              : toastTone === 'error'
                ? 'bg-fuchsia-600'
                : 'bg-zinc-800 ring-1 ring-white/10'
          }`}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
