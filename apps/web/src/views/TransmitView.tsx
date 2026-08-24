import { Globe, Lock, Radio, Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LIVE_CATEGORIES } from '../lib/categories';
import { useAuthStore } from '../store/authStore';

export function TransmitView() {
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [category, setCategory] = useState('musica');
  const [goalLabel, setGoalLabel] = useState('');
  const [goalCoins, setGoalCoins] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!profile) {
    return (
      <div className="grid min-h-full place-items-center rounded-2xl bg-zinc-900 p-6">
        <p className="text-center text-sm text-zinc-400">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para transmitir.
        </p>
      </div>
    );
  }

  const displayTitle = title.trim() || `Live de ${profile.displayName || profile.handle}`;

  function goLive() {
    if (!confirmed || !profile) return;
    navigate(`/stream/${encodeURIComponent(profile.handle)}`, {
      replace: true,
      state: {
        goLive: true,
        title: displayTitle,
        isPrivate,
        category,
        goalCoins: Math.max(0, Math.floor(Number(goalCoins) || 0)),
        goalLabel: goalLabel.trim().slice(0, 80),
      },
    });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-6 rounded-2xl bg-zinc-900 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Radio className="text-fuchsia-400" size={22} />
          Transmitir en vivo
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Configura tu live antes de abrir la cámara. Podrás invitar usuarios y grabar reels cortos.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Título del live</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`Live de ${profile.displayName || profile.handle}`}
          className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none ring-cyan-400/40 focus:ring-2"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Categoría</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none ring-cyan-400/40 focus:ring-2"
        >
          {LIVE_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.emoji} {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
          <Target size={14} />
          Objetivo de la sala
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Opcional. Se muestra durante el live y se guarda en tu historial.
        </p>
        <label className="mt-3 block space-y-1">
          <span className="text-[11px] text-zinc-500">¿Qué quieres alcanzar?</span>
          <input
            value={goalLabel}
            onChange={(event) => setGoalLabel(event.target.value)}
            placeholder="Ej. Nuevo micrófono, viaje, meta del mes"
            maxLength={80}
            className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-white outline-none ring-cyan-400/40 focus:ring-2"
          />
        </label>
        <label className="mt-3 block space-y-1">
          <span className="text-[11px] text-zinc-500">Meta en coins</span>
          <input
            type="number"
            min={0}
            value={goalCoins}
            onChange={(event) => setGoalCoins(event.target.value)}
            placeholder="500"
            className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-white outline-none ring-cyan-400/40 focus:ring-2"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setIsPrivate(false)}
          className={`rounded-2xl border p-4 text-left transition ${
            !isPrivate
              ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(0,240,255,0.15)]'
              : 'border-white/10 bg-zinc-950 hover:border-white/20'
          }`}
        >
          <Globe className="mb-2 text-cyan-300" size={20} />
          <p className="font-semibold text-white">Público</p>
          <p className="mt-1 text-xs text-zinc-400">Aparece en el inicio para todos.</p>
        </button>
        <button
          type="button"
          onClick={() => setIsPrivate(true)}
          className={`rounded-2xl border p-4 text-left transition ${
            isPrivate
              ? 'border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_20px_rgba(255,0,85,0.15)]'
              : 'border-white/10 bg-zinc-950 hover:border-white/20'
          }`}
        >
          <Lock className="mb-2 text-fuchsia-300" size={20} />
          <p className="font-semibold text-white">Privado</p>
          <p className="mt-1 text-xs text-zinc-400">Solo con enlace. El candado de regalo se activa en el live (arriba izquierda).</p>
        </button>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-zinc-600"
        />
        <span className="text-sm text-zinc-200">
          {isPrivate ? (
            <>
              Entiendo que mi live será <strong className="text-white">privado</strong> y no aparecerá en el feed
              público. Solo quien tenga el enlace podrá entrar.
            </>
          ) : (
            <>
              Entiendo que mi transmisión será <strong className="text-white">pública</strong> y cualquier usuario de
              Liveboom podrá verla en el inicio.
            </>
          )}
        </span>
      </label>

      <button
        type="button"
        disabled={!confirmed}
        onClick={goLive}
        className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 py-3.5 text-sm font-bold text-zinc-950 shadow-[0_0_24px_rgba(0,240,255,0.35)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Ir en vivo
      </button>
    </div>
  );
}
