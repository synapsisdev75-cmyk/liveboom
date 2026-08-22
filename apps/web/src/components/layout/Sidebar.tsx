import {
  Compass,
  Home,
  LogOut,
  MessageCircle,
  Radio,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Logo } from '../brand/Logo';
import { useAuthStore } from '../../store/authStore';
import { useUiStore, type NavId } from '../../store/uiStore';

const navItems: { id: NavId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'explore', label: 'Explorar Lives', icon: Compass },
  { id: 'messages', label: 'Mensajes', icon: MessageCircle },
  { id: 'wallet', label: 'Mi Billetera', icon: Wallet },
  { id: 'profile', label: 'Perfil', icon: UserRound },
];

export function Sidebar() {
  const nav = useUiStore((s) => s.nav);
  const setNav = useUiStore((s) => s.setNav);
  const streams = useUiStore((s) => s.streams);
  const openStream = useUiStore((s) => s.openStream);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="flex h-full w-full max-w-[300px] flex-col border-r border-white/5 bg-[#0A0A0B] px-4 py-5 lg:w-[20%] lg:min-w-[250px]">
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = nav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-white/5 text-boom-cyan shadow-glow'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 flex-1 overflow-hidden">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          En vivo
        </p>
        <ul className="mt-3 space-y-2">
          {streams.slice(0, 6).map((stream) => (
            <li key={stream.id}>
              <button
                type="button"
                onClick={() => openStream(stream)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5"
              >
                <span className="live-ring rounded-full p-[2px]">
                  <img src={stream.creator.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">
                    {stream.creator.name}
                  </span>
                  <span className="text-xs text-zinc-500">{stream.creator.handle}</span>
                </span>
                <span className="rounded-md bg-boom-fuchsia/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-boom-fuchsia">
                  EN VIVO
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 rounded-2xl bg-white/5 px-3 py-2">
        <p className="truncate text-sm font-semibold text-white">{profile?.displayName}</p>
        <p className="text-xs text-zinc-500">@{profile?.handle}</p>
      </div>

      <button
        type="button"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-boom-cyan to-[#7B5CFF] py-3 text-sm font-bold text-zinc-950 shadow-glow transition hover:brightness-110"
      >
        <Radio size={16} />
        Transmitir
      </button>
      <button
        type="button"
        onClick={() => void logout()}
        className="mt-2 flex items-center justify-center gap-2 py-2 text-xs text-zinc-500 hover:text-white"
      >
        <LogOut size={12} />
        Cerrar sesión
      </button>
    </aside>
  );
}
