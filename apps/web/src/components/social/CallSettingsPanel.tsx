import { Phone, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ALLOWED_CALL_GIFT_VALUES,
  giftsForCallRate,
  type AllowedCallGiftValue,
} from '../../lib/callPricing';
import {
  DEFAULT_CALL_SETTINGS,
  listenCreatorCallSettings,
  listenFreeCallContacts,
  saveCreatorCallSettings,
  setFreeCallContact,
  type CallRateConfig,
  type CreatorCallSettings,
} from '../../lib/callSettingsFirestore';
import { listenFriends, type FriendChip } from '../../lib/socialFirestore';
import { findLiveGift } from '../../lib/liveboomGifts';
import { useAuthStore } from '../../store/authStore';

function RateEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: CallRateConfig;
  onChange: (next: CallRateConfig) => void;
}) {
  const selected = value.mode === 'paid' ? value.rateBlasts : 0;
  const gifts = selected ? giftsForCallRate(selected) : [];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0f1016] p-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className={`lb-call-rate-chip ${value.mode === 'free' ? 'is-on' : ''}`}>
          <input
            type="radio"
            className="sr-only"
            checked={value.mode === 'free'}
            onChange={() => onChange({ mode: 'free', giftId: null, rateBlasts: 0 })}
          />
          Gratis
        </label>
        <label className={`lb-call-rate-chip ${value.mode === 'paid' ? 'is-on' : ''}`}>
          <input
            type="radio"
            className="sr-only"
            checked={value.mode === 'paid'}
            onChange={() =>
              onChange({
                mode: 'paid',
                giftId: value.giftId,
                rateBlasts: value.rateBlasts || 1,
              })
            }
          />
          Regalo / min
        </label>
      </div>
      {value.mode === 'paid' ? (
        <>
          <div className="lb-call-rate-grid mt-3">
            {ALLOWED_CALL_GIFT_VALUES.map((n) => (
              <button
                key={n}
                type="button"
                className={`lb-call-rate-chip ${selected === n ? 'is-on' : ''}`}
                onClick={() => {
                  const options = giftsForCallRate(n);
                  onChange({
                    mode: 'paid',
                    giftId:
                      options.length === 1
                        ? options[0]?.id || null
                        : value.giftId && options.some((g) => g.id === value.giftId)
                          ? value.giftId
                          : null,
                    rateBlasts: n as AllowedCallGiftValue,
                  });
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {selected > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                {selected} Blasts/min · elige el regalo
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {gifts.length === 0 ? (
                  <p className="text-xs text-amber-300">No hay regalos de {selected} Blasts en el catálogo.</p>
                ) : (
                  gifts.map((gift) => (
                    <button
                      key={gift.id}
                      type="button"
                      className={`lb-call-gift-pick ${value.giftId === gift.id ? 'is-on' : ''}`}
                      onClick={() => onChange({ mode: 'paid', giftId: gift.id, rateBlasts: gift.coins })}
                    >
                      {gift.image ? <img src={gift.image} alt="" /> : <span>{gift.emoji}</span>}
                      <em>{gift.name}</em>
                    </button>
                  ))
                )}
              </div>
              {gifts.length > 1 && !value.giftId ? (
                <p className="mt-2 text-xs text-amber-300">Hay varios regalos de {selected} Blasts. Elige uno.</p>
              ) : null}
              {value.giftId ? (
                <p className="mt-2 text-xs text-zinc-300">
                  Seleccionado: {findLiveGift(value.giftId)?.name || value.giftId} · {selected} Blasts/min
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function CallSettingsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const [settings, setSettings] = useState<CreatorCallSettings>(DEFAULT_CALL_SETTINGS);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [freeUids, setFreeUids] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageFree, setManageFree] = useState(false);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    const a = listenCreatorCallSettings(profile.firebaseUid, setSettings);
    const b = listenFriends(profile.firebaseUid, setFriends);
    const c = listenFreeCallContacts(profile.firebaseUid, setFreeUids);
    return () => {
      a();
      b();
      c();
    };
  }, [profile?.firebaseUid]);

  const freeSet = useMemo(() => new Set(freeUids), [freeUids]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const paid = [settings.friendVoice, settings.friendVideo, settings.followerVoice, settings.followerVideo];
      for (const rate of paid) {
        if (rate.mode === 'paid' && !rate.giftId) {
          throw new Error('Elige un regalo para cada tarifa de pago.');
        }
      }
      await saveCreatorCallSettings(profile.firebaseUid, settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <Phone size={16} className="text-violet-300" /> Llamadas de voz
          </span>
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, voiceEnabled: e.target.checked }))}
          />
        </label>
        <label className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <Video size={16} className="text-cyan-300" /> Videollamadas
          </span>
          <input
            type="checkbox"
            checked={settings.videoEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, videoEnabled: e.target.checked }))}
          />
        </label>
      </div>

      <div>
        <button
          type="button"
          className="text-sm font-semibold text-cyan-300 hover:underline"
          onClick={() => setManageFree((v) => !v)}
        >
          Llamadas sin costo · Administrar
        </button>
        {manageFree ? (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] p-2">
            {friends.length === 0 ? (
              <li className="px-2 py-3 text-xs text-zinc-500">Aún no tienes amigos aceptados.</li>
            ) : (
              friends.map((friend) => (
                <li key={friend.uid}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={freeSet.has(friend.uid)}
                      onChange={(e) =>
                        void setFreeCallContact(profile.firebaseUid, friend, e.target.checked)
                      }
                    />
                    <span className="truncate text-sm text-white">
                      {friend.displayName || friend.username}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        ) : null}
        <p className="mt-1 text-[11px] text-zinc-500">
          Esta lista es privada. Ellos solo verán “Llamada gratuita”.
        </p>
      </div>

      <RateEditor
        title="Otros amigos · voz"
        value={settings.friendVoice}
        onChange={(friendVoice) => setSettings((s) => ({ ...s, friendVoice }))}
      />
      <RateEditor
        title="Otros amigos · videollamada"
        value={settings.friendVideo}
        onChange={(friendVideo) => setSettings((s) => ({ ...s, friendVideo }))}
      />

      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-3">
        <span>
          <span className="block text-sm font-semibold text-white">Permitir solicitudes de seguidores</span>
          <span className="block text-xs text-zinc-500">No inician la llamada: tú apruebas primero.</span>
        </span>
        <input
          type="checkbox"
          checked={settings.allowFollowerRequests}
          onChange={(e) => setSettings((s) => ({ ...s, allowFollowerRequests: e.target.checked }))}
        />
      </label>

      {settings.allowFollowerRequests ? (
        <>
          <RateEditor
            title="Seguidores · voz"
            value={settings.followerVoice}
            onChange={(followerVoice) => setSettings((s) => ({ ...s, followerVoice }))}
          />
          <RateEditor
            title="Seguidores · videollamada"
            value={settings.followerVideo}
            onChange={(followerVideo) => setSettings((s) => ({ ...s, followerVideo }))}
          />
        </>
      ) : null}

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="h-11 w-full rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Guardando…' : saved ? 'Guardado' : 'Guardar llamadas'}
      </button>
    </div>
  );
}
