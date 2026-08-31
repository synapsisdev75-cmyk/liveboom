import {
  ChevronRight,
  Clock,
  Home,
  Menu,
  MessageCircle,
  Compass,
  LogOut,
  Plus,
  Radio,
  Search,
  Settings,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { sweepAuthorReelLifecycle } from '../../lib/socialFirestore';
import { useUiStore } from '../../store/uiStore';
import { CoinModal } from '../wallet/CoinModal';
import { NotificationBell } from '../social/NotificationBell';
import { MessageInboxBadge, useUnreadMessageCount } from '../social/MessageInboxBadge';
import { SideRailPanel } from './SideRailPanel';
import { Logo } from '../brand/Logo';

function SidebarUnreadHint() {
  const unread = useUnreadMessageCount();
  if (unread <= 0) return null;
  return (
    <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#A855F7] px-1 text-[10px] font-black leading-none text-white">
      {unread > 9 ? '9+' : unread}
    </span>
  );
}

/** Orden exacto del mockup de barra lateral. */
const sideNavItems = [
  { label: 'Inicio', icon: Home, to: '/' as const },
  { label: 'Explorar', icon: Compass, to: '/explorar' as const },
  { label: 'Grupos', icon: Users, to: '/grupos' as const },
  { label: 'Mi Billetera', icon: Wallet, to: '/billetera' as const },
  { label: 'Mensajes', icon: MessageCircle, to: '/mensajes' as const },
  { label: 'Actividad', icon: Clock, to: '/actividad' as const },
  { label: 'Perfil', icon: UserRound, to: '/perfil' as const },
  { label: 'Buscar amigos', icon: Search, to: '/buscar' as const },
  { label: 'Configuración', icon: Settings, to: '/perfil/editar' as const },
];

const mobileNavItems = [
  { label: 'Inicio', icon: Home, to: '/' as const },
  { label: 'Explorar', icon: Compass, to: '/explorar' as const },
  { label: 'Crear', icon: Plus, to: '/crear' as const, accent: true },
  { label: 'LIVE', icon: Radio, to: '/transmitir' as const },
  { label: 'Perfil', icon: UserRound, to: '/perfil' as const },
];

const activeClass =
  'lb-nav-item lb-nav-active flex items-center gap-2.5 px-3 py-[7px] text-[13px] font-semibold leading-tight';
const idleClass =
  'lb-nav-item flex items-center gap-2.5 rounded-xl px-3 py-[7px] text-[13px] font-medium leading-tight text-white/90 hover:bg-white/[0.04]';

type SidebarBodyProps = {
  profile: ReturnType<typeof useAuthStore.getState>['profile'];
  onRecharge: () => void;
  onNavigate?: () => void;
};

/** Sidebar compacto: 100% alto viewport, sin scroll, todos los ítems visibles. */
function SidebarBody({ profile, onRecharge, onNavigate }: SidebarBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-2 block shrink-0 px-0.5 transition hover:opacity-90"
      >
        <Logo compact className="!justify-start [&_img]:!h-[4.25rem] [&_img]:!max-w-[15rem]" />
      </Link>

      <nav className="flex shrink-0 flex-col gap-px">
        {sideNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? activeClass : idleClass)}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.35 : 1.75}
                    className={isActive ? 'lb-nav-icon shrink-0' : 'shrink-0 text-white'}
                    fill={isActive && item.to === '/' ? 'currentColor' : 'none'}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.to === '/mensajes' ? <SidebarUnreadHint /> : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bloque inferior: Transmitir + Billetera + Perfil (mockup 2) */}
      <div className="mt-auto flex shrink-0 flex-col gap-3 pt-2">
        <NavLink
          to="/transmitir"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(to_right,#EC4899,#06B6D4)] text-[15px] font-extrabold text-black shadow-[0_8px_24px_rgba(236,72,153,0.3)] transition hover:brightness-110 ${
              isActive ? 'ring-2 ring-cyan-300/55 ring-offset-2 ring-offset-[#0a0b10]' : ''
            }`
          }
        >
          <Radio size={17} strokeWidth={2.5} className="text-black" />
          Transmitir
        </NavLink>

        <div className="rounded-[18px] border border-white/[0.08] bg-[#15161e] px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            MI BILLETERA
          </p>
          {profile ? (
            <>
              <p className="mt-2 flex items-baseline gap-1.5 leading-none">
                <span className="text-[28px] font-black tracking-tight text-[#00E5FF]">
                  {profile.coinsBalance.toLocaleString('es-CO')}
                </span>
                <span className="text-[15px] font-semibold text-white">coins</span>
              </p>
              <button
                type="button"
                onClick={onRecharge}
                className="mt-3 flex h-10 w-full items-center justify-center rounded-full bg-[linear-gradient(to_right,#EC4899,#06B6D4)] text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(236,72,153,0.25)] transition hover:brightness-110"
              >
                Recargar Coins
              </button>
              <Link
                to="/billetera"
                onClick={onNavigate}
                className="mt-2 flex h-10 w-full items-center justify-center rounded-full border-[1.5px] border-[#10B981] bg-transparent text-[13px] font-semibold text-[#10B981] transition hover:bg-[#10B981]/10"
              >
                Retirar
              </Link>
            </>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={onNavigate}
                className="text-sm font-medium text-cyan-400 hover:text-white"
              >
                Iniciar sesión
              </Link>
              <Link
                to="/registro"
                onClick={onNavigate}
                className="flex h-10 items-center justify-center rounded-full bg-[linear-gradient(to_right,#EC4899,#06B6D4)] text-sm font-bold text-black"
              >
                Crear cuenta
              </Link>
            </div>
          )}
        </div>

        {profile ? (
          <Link
            to="/perfil"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-[#15161e] px-2.5 py-2.5 transition hover:border-white/15 hover:bg-[#1a1b24]"
          >
            <span className="relative shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-fuchsia-600/35 text-sm font-bold text-fuchsia-100">
                  {profile.handle.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#15161e] bg-[#22C55E]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white">
                @{profile.handle}
              </span>
              <span className="block text-[12px] text-zinc-500">Ver perfil</span>
            </span>
            <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-zinc-500" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function MainLayout() {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const toast = useUiStore((state) => state.toast);
  const toastTone = useUiStore((state) => state.toastTone);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const onMessages = location.pathname.startsWith('/mensajes');

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void sweepAuthorReelLifecycle(profile.firebaseUid).catch(() => undefined);
  }, [profile?.firebaseUid]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0b] font-sans text-white lg:flex-row">
      <header className="flex shrink-0 items-center justify-between gap-2 overflow-x-hidden border-b border-white/5 pb-3 pl-[max(1rem,var(--lb-safe-left))] pr-[max(1rem,var(--lb-safe-right))] pt-[max(0.75rem,var(--lb-safe-top))] sm:gap-3 lg:hidden">
        <Link to="/" className="min-w-0 shrink">
          <Logo compact className="[&_img]:!h-14 [&_img]:!max-w-[12rem] sm:[&_img]:!h-16 sm:[&_img]:!max-w-[14rem]" />
        </Link>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          {profile ? <MessageInboxBadge /> : null}
          {profile ? <NotificationBell /> : null}
          {profile ? (
            <button
              type="button"
              onClick={() => setRechargeOpen(true)}
              className="max-w-[7.5rem] truncate rounded-full bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-400 ring-1 ring-cyan-500/30 sm:max-w-none sm:px-3 sm:text-xs"
            >
              {profile.coinsBalance.toLocaleString('es-CO')} coins
            </button>
          ) : (
            <>
              <Link to="/login" className="text-xs font-medium text-cyan-400">
                Entrar
              </Link>
              <Link to="/registro" className="text-xs font-medium text-zinc-400 hover:text-white">
                Registro
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-zinc-300"
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      <aside className="hidden h-[100dvh] w-[22%] min-w-[248px] max-w-[280px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[#0a0b10] px-3.5 py-3 lg:flex">
        <SidebarBody profile={profile} onRecharge={() => setRechargeOpen(true)} />
      </aside>

      <main
        className={`min-h-0 min-w-0 flex-1 ${
          onMessages
            ? 'overflow-hidden p-0 lg:w-[56%]'
            : 'overflow-y-auto overflow-x-hidden pt-3 pb-[var(--lb-main-pad-bottom)] pl-[max(0.75rem,var(--lb-safe-left))] pr-[max(0.75rem,var(--lb-safe-right))] sm:pt-4 lg:w-[56%] lg:p-4 lg:pb-4'
        }`}
      >
        {profile && !profile.birthDate && !location.pathname.startsWith('/perfil/editar') && !onMessages ? (
          <Link
            to="/perfil/editar?completar=1"
            className="lb-page mb-3 flex items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-50"
          >
            <span className="min-w-0 flex-1">
              Opcional: añade tu fecha de nacimiento y un @usuario propio.
              <span className="mt-0.5 block text-xs font-semibold text-cyan-300">Editar perfil →</span>
            </span>
          </Link>
        ) : null}
        <div
          key={location.pathname}
          className={onMessages ? 'flex h-full min-h-0 flex-col' : 'lb-page'}
        >
          <Outlet />
        </div>
      </main>

      <SideRailPanel />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-zinc-950/95 pb-[var(--lb-safe-bottom)] pl-[var(--lb-safe-left)] pr-[var(--lb-safe-right)] backdrop-blur-xl lg:hidden">
        <ul className="grid grid-cols-5 px-1 pt-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const accent = 'accent' in item && item.accent;
            return (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-semibold ${
                      isActive ? 'text-cyan-400' : 'text-zinc-500'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                          accent
                            ? 'bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-zinc-950 shadow-[0_0_16px_rgba(255,0,85,0.35)]'
                            : isActive
                              ? 'bg-cyan-400/15 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                              : 'bg-transparent'
                        }`}
                      >
                        <Icon size={18} strokeWidth={isActive || accent ? 2.4 : 1.8} />
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

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex h-[100dvh] w-[min(17.5rem,88vw)] flex-col overflow-hidden border-l border-zinc-800 bg-[#0a0b10] pb-[max(0.75rem,var(--lb-safe-bottom))] pl-3 pr-[max(0.75rem,var(--lb-safe-right))] pt-[max(0.75rem,var(--lb-safe-top))] shadow-2xl">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <p className="text-xs font-bold text-zinc-400">Menú</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-900 text-zinc-400"
              >
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SidebarBody
                profile={profile}
                onRecharge={() => {
                  setMenuOpen(false);
                  setRechargeOpen(true);
                }}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
            {profile ? (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="mt-2 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-fuchsia-400/40 text-xs font-semibold text-fuchsia-200"
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {rechargeOpen ? <CoinModal onClose={() => setRechargeOpen(false)} /> : null}

      {toast ? (
        <div
          className={`fixed left-1/2 z-[90] max-w-[min(90vw,24rem)] -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-semibold shadow-xl ${
            toastTone === 'success' ? 'bg-emerald-500 text-zinc-950' : 'bg-fuchsia-500 text-white'
          }`}
          style={{ top: 'max(1rem, var(--lb-safe-top))' }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
