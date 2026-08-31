import { MapPin, Megaphone, Radio, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  CO_REGIONS,
  PROMO_DAYS_MAX,
  PROMO_DAYS_MIN,
  PROMO_KINDS,
  formatPromoCop,
  promoCopPerDay,
  promoTotalCop,
  regionLabel,
  type PromoKind,
} from '../../lib/promoRegions';
import { createPromotion } from '../../lib/promotionsFirestore';
import { dataUrlToBlob, uploadUserMedia } from '../../lib/storage';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { useAuthStore } from '../../store/authStore';

type Props = {
  onClose: () => void;
  defaultRegionId?: string;
  onDone?: () => void;
};

export function PromoteAdsModal({ onClose, defaultRegionId, onDone }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [kind, setKind] = useState<PromoKind>('live');
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [regionId, setRegionId] = useState(defaultRegionId || 'nacional');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const perDay = useMemo(() => promoCopPerDay(regionId), [regionId]);
  const totalCop = useMemo(() => promoTotalCop(days, regionId), [days, regionId]);

  useEffect(() => {
    if (defaultRegionId) setRegionId(defaultRegionId);
  }, [defaultRegionId]);

  useEffect(() => {
    if (!profile) return;
    if (kind === 'live' && !linkUrl) {
      setLinkUrl(`/stream/${encodeURIComponent(profile.handle)}`);
    }
  }, [kind, profile?.handle]);

  async function onPickFile(file?: File | null) {
    if (!file || !profile) return;
    setBusy(true);
    setNote(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });
      const blob = await dataUrlToBlob(dataUrl);
      const uploaded = await uploadUserMedia(profile.firebaseUid, blob, `promo-${Date.now()}`, 'public');
      setMediaUrl(uploaded.url);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo subir el medio');
    } finally {
      setBusy(false);
    }
  }

  async function publishAfterPay(hours: number, amountPaidCop: number) {
    if (!profile) return;
    const cleanTitle = title.trim() || PROMO_KINDS.find((k) => k.id === kind)?.label || 'Promoción';
    await createPromotion({
      kind,
      title: cleanTitle,
      mediaUrl: mediaUrl.trim(),
      linkUrl: linkUrl.trim() || `/u/${encodeURIComponent(profile.handle)}`,
      regionId,
      regionLabel: regionLabel(regionId),
      ownerUid: profile.firebaseUid,
      ownerUsername: profile.handle,
      ownerDisplayName: profile.displayName || profile.handle,
      ownerAvatarUrl: profile.avatarUrl,
      coinsPaid: amountPaidCop,
      hours,
    });
  }

  async function submit() {
    if (!profile) return;
    setBusy(true);
    setNote(null);
    try {
      const order = await api<
        WompiOrder & { days: number; hours: number; totalCop: number }
      >('/api/ads/create-order', {
        method: 'POST',
        body: JSON.stringify({ days, regionId }),
      });

      openWompiWidget(order, (result) => {
        const status = result.transaction?.status;
        if (status === 'APPROVED') {
          void api<{ days: number; hours: number; amountPaidCop: number }>('/api/ads/complete', {
            method: 'POST',
            body: JSON.stringify({ reference: order.reference }),
          })
            .then(async (paid) => {
              await publishAfterPay(paid.hours || order.hours, paid.amountPaidCop || order.totalCop);
              setNote('Pago aprobado. Tu publicidad ya está activa.');
              onDone?.();
              window.setTimeout(onClose, 1200);
            })
            .catch((err) => {
              setNote(err instanceof Error ? err.message : 'Pago ok, pero no se activó el anuncio');
            })
            .finally(() => setBusy(false));
          return;
        }
        if (status === 'PENDING') {
          setNote('Pago en proceso. Cuando Wompi confirme, vuelve a publicar o contacta soporte.');
          setBusy(false);
          return;
        }
        setNote(status ? `El pago quedó en estado ${status}.` : 'Pago cancelado.');
        setBusy(false);
      });
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo iniciar el pago');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">
              <Megaphone size={14} /> Publicidad paga
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">Promocionar en LiveBoom</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Elige los días y paga en pesos (COP) con Wompi. Sin usar coins.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Tipo</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PromoKind)}
              className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
            >
              {PROMO_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Ej. ¡En vivo ahora!"
              className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Enlace (live, perfil o web)</span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="/stream/tu_usuario"
              className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Región objetivo</span>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
            >
              {CO_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Duración</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {days} {days === 1 ? 'día' : 'días'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500">{formatPromoCop(perDay)} / día</p>
                <p className="text-lg font-bold text-amber-300">{formatPromoCop(totalCop)}</p>
              </div>
            </div>
            <input
              type="range"
              min={PROMO_DAYS_MIN}
              max={PROMO_DAYS_MAX}
              step={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-cyan-400"
              aria-label="Días de publicidad"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              <span>{PROMO_DAYS_MIN} día</span>
              <span>{PROMO_DAYS_MAX} días</span>
            </div>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
            <Upload size={16} />
            {mediaUrl ? 'Cambiar imagen / video' : 'Subir imagen o video (opcional)'}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
          </label>

          {note ? (
            <p
              className={`text-sm ${
                note.includes('aprobado') || note.includes('activa') ? 'text-emerald-400' : 'text-fuchsia-400'
              }`}
            >
              {note}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy || !profile}
            onClick={() => void submit()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            <Radio size={16} />
            {busy ? 'Abriendo Wompi…' : `Pagar ${formatPromoCop(totalCop)}`}
          </button>
          <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            Pago directo en pesos con Wompi. La ubicación del público solo se usa para mostrar anuncios de su
            región.
          </p>
        </div>
      </div>
    </div>
  );
}
