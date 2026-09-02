import { MapPin, Megaphone, Radio, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  CO_REGIONS,
  PROMO_BANNER_HEIGHT,
  PROMO_BANNER_SIZE_LABEL,
  PROMO_BANNER_WIDTH,
  PROMO_PACKAGES,
  PROMO_KINDS,
  formatPromoCop,
  promoCopPerDay,
  promoPackageByDays,
  regionLabel,
  type PromoKind,
  type PromoPackageId,
} from '../../lib/promoRegions';
import { createPromotion } from '../../lib/promotionsFirestore';
import { dataUrlToBlob, uploadUserMedia } from '../../lib/storage';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { useAuthStore } from '../../store/authStore';

type PromoPackageOption = {
  id: string;
  days: number;
  priceCop: number;
  label: string;
  pricePerDayCop?: number;
};

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
  const [packageId, setPackageId] = useState<PromoPackageId>('3d');
  const [packages, setPackages] = useState<PromoPackageOption[]>([...PROMO_PACKAGES]);
  const [wompiReady, setWompiReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? promoPackageByDays(3),
    [packageId, packages],
  );
  const days = selectedPackage.days;
  const perDay = useMemo(() => promoCopPerDay(days), [days]);
  const totalCop = useMemo(() => selectedPackage.priceCop, [selectedPackage]);

  useEffect(() => {
    void api<{ packages: PromoPackageOption[]; wompiConfigured?: boolean }>('/api/ads/packages')
      .then((res) => {
        if (res.packages?.length) setPackages(res.packages);
        setWompiReady(Boolean(res.wompiConfigured));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!packages.some((p) => p.id === packageId)) {
      setPackageId((packages[0]?.id as PromoPackageId) || '3d');
    }
  }, [packageId, packages]);

  useEffect(() => {
    if (defaultRegionId) setRegionId(defaultRegionId);
  }, [defaultRegionId]);

  useEffect(() => {
    if (!profile) return;
    if (kind === 'live' && !linkUrl) {
      setLinkUrl(`/stream/${encodeURIComponent(profile.handle)}`);
    }
  }, [kind, profile?.handle]);

  function readImageDimensions(file: File) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudieron leer las dimensiones de la imagen'));
      };
      img.src = url;
    });
  }

  async function onPickFile(file?: File | null) {
    if (!file || !profile) return;
    setBusy(true);
    setNote(null);
    try {
      if (file.type.startsWith('image/')) {
        const { width, height } = await readImageDimensions(file);
        if (width !== PROMO_BANNER_WIDTH || height !== PROMO_BANNER_HEIGHT) {
          throw new Error(
            `El banner debe medir ${PROMO_BANNER_SIZE_LABEL} px (formato 3:1). Tu archivo es ${width} × ${height} px.`,
          );
        }
      }
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

  async function activateAfterPay(hours: number, amountPaidCop: number) {
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

  async function simulatePay() {
    if (!profile) return;
    setBusy(true);
    setNote(null);
    try {
      let hours = days * 24;
      let amountPaidCop = totalCop;
      try {
        const paid = await api<{ hours: number; amountPaidCop: number }>('/api/ads/simulate', {
          method: 'POST',
          body: JSON.stringify({ packageId, days, regionId }),
        });
        hours = paid.hours || hours;
        amountPaidCop = paid.amountPaidCop || amountPaidCop;
      } catch {
        // Sin API: activar directo en Firestore para pruebas.
      }
      await activateAfterPay(hours, amountPaidCop);
      setNote('Publicidad activada (pago simulado).');
      onDone?.();
      window.setTimeout(onClose, 1200);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo activar la publicidad');
    } finally {
      setBusy(false);
    }
  }

  async function payWithWompi() {
    if (!profile) return;
    setBusy(true);
    setNote(null);
    try {
      const order = await api<
        WompiOrder & { days: number; hours: number; totalCop: number }
      >('/api/ads/create-order', {
        method: 'POST',
        body: JSON.stringify({ packageId, days, regionId }),
      });

      openWompiWidget(order, (result) => {
        const status = result.transaction?.status;
        if (status === 'APPROVED') {
          void api<{ days: number; hours: number; amountPaidCop: number }>('/api/ads/complete', {
            method: 'POST',
            body: JSON.stringify({ reference: order.reference }),
          })
            .then(async (paid) => {
              await activateAfterPay(paid.hours || order.hours, paid.amountPaidCop || order.totalCop);
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
            <h2 className="mt-1 text-lg font-bold text-white">Configurar y comprar publicidad</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Tu anuncio aparece en el panel Publicidad. Por ahora puedes activarlo en modo prueba sin Wompi.
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
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Paquete</p>
            <div className="mt-2 grid gap-2">
              {packages.map((pkg) => {
                const active = pkg.id === packageId;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setPackageId(pkg.id as PromoPackageId)}
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/10'
                        : 'border-white/10 bg-zinc-950/60 hover:border-white/20'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-white">{pkg.label}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {formatPromoCop(Math.round(pkg.priceCop / pkg.days))} / día
                      </span>
                    </span>
                    <span className="text-sm font-bold text-amber-300">{formatPromoCop(pkg.priceCop)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-white/5 pt-3">
              <div>
                <p className="text-[11px] text-zinc-500">Duración seleccionada</p>
                <p className="text-lg font-black text-white">
                  {days} {days === 1 ? 'día' : 'días'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500">{formatPromoCop(perDay)} / día</p>
                <p className="text-lg font-bold text-amber-300">{formatPromoCop(totalCop)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-400/25 bg-zinc-900/70 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200">
              Dimensiones obligatorias
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {PROMO_BANNER_SIZE_LABEL} px <span className="text-zinc-400">(formato 3:1)</span>
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
              Usa esta medida exacta para tu imagen o video banner. Así se verá completo en el panel y al
              expandir.
            </p>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300">
              <Upload size={16} />
              {mediaUrl ? 'Cambiar imagen / video' : 'Subir imagen o video (opcional)'}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </label>
          </div>

          {mediaUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              <p className="bg-zinc-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Vista previa del banner · {PROMO_BANNER_SIZE_LABEL} px
              </p>
              {/\.(mp4|webm)(\?|$)/i.test(mediaUrl) ? (
                <video src={mediaUrl} className="aspect-[3/1] w-full object-contain bg-black" muted playsInline controls />
              ) : (
                <img src={mediaUrl} alt="" className="aspect-[3/1] w-full object-contain bg-black" />
              )}
            </div>
          ) : null}

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
            onClick={() => void simulatePay()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            <Radio size={16} />
            {busy ? 'Activando…' : `Activar publicidad (prueba) · ${formatPromoCop(totalCop)}`}
          </button>
          {wompiReady ? (
            <button
              type="button"
              disabled={busy || !profile}
              onClick={() => void payWithWompi()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Pagar con Wompi
            </button>
          ) : null}
          <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            {wompiReady
              ? 'Puedes probar con activación simulada o pagar con Wompi cuando quieras.'
              : 'Modo prueba: el pago está simulado hasta conectar Wompi. Tu anuncio se publica al instante.'}
          </p>
        </div>
      </div>
    </div>
  );
}
