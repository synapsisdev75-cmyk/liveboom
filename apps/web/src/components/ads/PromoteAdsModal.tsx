import { MapPin, Megaphone, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  CO_REGIONS,
  PROMO_BANNER_SIZE_LABEL,
  PROMO_MAX_ANIMATED_SEC,
  PROMO_PACKAGES,
  PROMO_KINDS,
  formatPromoCop,
  promoCopPerDay,
  promoPackageByDays,
  promoPriceCop,
  regionLabel,
  type PromoBannerFormat,
  type PromoKind,
  type PromoPackageId,
} from '../../lib/promoRegions';
import { isPromotionVideoUrl } from '../../lib/promotionLinks';
import { uploadUserMedia } from '../../lib/storage';
import { openWompiWidget, type WompiOrder } from '../../lib/wompiWidget';
import { isNativeApp, openWompiCheckoutUrl } from '../../lib/wompiCheckout';
import { useAuthStore } from '../../store/authStore';

type ServerPackage = {
  id: string;
  days: number;
  label: string;
  staticCop: number;
  animatedCop: number;
};

type Quote = {
  quoteId: string;
  packageId: string;
  days: number;
  hours: number;
  format: PromoBannerFormat;
  totalCop: number;
  amountInCents: number;
  warning?: string | null;
};

type Props = {
  onClose: () => void;
  defaultRegionId?: string;
  onDone?: () => void;
};

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

function readVideoMeta(file: File) {
  return new Promise<{ width: number; height: number; durationSec: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const meta = {
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        durationSec: Number.isFinite(video.duration) ? video.duration : 0,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudieron leer los metadatos del video'));
    };
    video.src = url;
  });
}

export function PromoteAdsModal({ onClose, defaultRegionId, onDone }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [kind, setKind] = useState<PromoKind>('live');
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [mime, setMime] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [regionId, setRegionId] = useState(defaultRegionId || 'nacional');
  const [packageId, setPackageId] = useState<PromoPackageId>('3d');
  const [packages, setPackages] = useState<ServerPackage[]>(
    PROMO_PACKAGES.map((p) => ({
      id: p.id,
      days: p.days,
      label: p.label,
      staticCop: p.staticCop,
      animatedCop: p.animatedCop,
    })),
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? promoPackageByDays(3),
    [packageId, packages],
  );
  const days = selectedPackage.days;
  const format: PromoBannerFormat = quote?.format || 'static';
  const totalCop = quote?.totalCop ?? promoPriceCop(days, format);
  const perDay = promoCopPerDay(days, format);

  useEffect(() => {
    void api<{ packages: ServerPackage[] }>('/api/ads/packages')
      .then((res) => {
        if (res.packages?.length) setPackages(res.packages);
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

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      void api<{ quote: Quote }>('/api/ads/quotes', {
        method: 'POST',
        body: JSON.stringify({
          packageId,
          days,
          regionId,
          regionLabel: regionLabel(regionId),
          kind,
          title,
          linkUrl,
          mediaUrl,
          storagePath,
          mime,
          width,
          height,
          durationSec,
        }),
      })
        .then((res) => {
          if (!cancelled) {
            setQuote(res.quote);
            setNote(res.quote.warning || null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setQuote(null);
            setNote(err instanceof Error ? err.message : 'No se pudo cotizar');
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profile?.firebaseUid, packageId, days, regionId, kind, title, linkUrl, mediaUrl, storagePath, mime, width, height, durationSec]);

  async function onPickFile(file?: File | null) {
    if (!file || !profile) return;
    setBusy(true);
    setNote(null);
    try {
      const isVideo =
        file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
      const meta = isVideo ? await readVideoMeta(file) : { ...(await readImageDimensions(file)), durationSec: 0 };
      if (isVideo && meta.durationSec > PROMO_MAX_ANIMATED_SEC + 0.35) {
        throw new Error(`La animación o video no puede superar ${PROMO_MAX_ANIMATED_SEC} s.`);
      }
      const uploaded = await uploadUserMedia(
        profile.firebaseUid,
        file,
        `promo-${Date.now()}-${file.name || 'banner'}`,
        'public',
      );
      setMediaUrl(uploaded.url);
      setStoragePath(uploaded.storagePath);
      setMime(file.type || '');
      setWidth(meta.width);
      setHeight(meta.height);
      setDurationSec(meta.durationSec);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo subir el medio');
    } finally {
      setBusy(false);
    }
  }

  async function payWithWompi() {
    if (!profile || !quote) return;
    setBusy(true);
    setNote(null);
    try {
      const order = await api<WompiOrder & { mock?: boolean; hours: number; totalCop: number }>(
        '/api/ads/create-order',
        {
          method: 'POST',
          body: JSON.stringify({ quoteId: quote.quoteId }),
        },
      );
      if (order.mock) {
        setNote('Wompi no está disponible. Intenta de nuevo en unos minutos.');
        setBusy(false);
        return;
      }

      if (order.checkoutUrl && (order.preferCheckout || order.widgetAvailable === false || isNativeApp())) {
        await openWompiCheckoutUrl(order.checkoutUrl);
        setNote(
          isNativeApp()
            ? 'Checkout abierto. Al terminar el pago, vuelve a LiveBoom.'
            : 'Redirigiendo al checkout de Wompi…',
        );
        setBusy(false);
        return;
      }

      try {
        openWompiWidget(order, (result) => {
          const status = result.transaction?.status;
          const transactionId = result.transaction?.id;
          void api('/api/ads/complete', {
            method: 'POST',
            body: JSON.stringify({ reference: order.reference, transactionId }),
          })
            .then((paid) => {
              const paymentStatus = String((paid as { paymentStatus?: string }).paymentStatus || '');
              if (paymentStatus === 'paid') {
                setNote('Pago confirmado. Tu banner queda en revisión antes de publicarse. El tiempo contratado no corre todavía.');
                onDone?.();
                return;
              }
              if (status === 'PENDING' || paymentStatus === 'pending') {
                setNote('Pago en proceso. La campaña se activará cuando Wompi confirme, no por esta pantalla.');
                return;
              }
              setNote(status ? `El pago quedó en estado ${status}.` : 'Pago no confirmado.');
            })
            .catch((err) => {
              setNote(err instanceof Error ? err.message : 'No se pudo consultar el pago');
            })
            .finally(() => setBusy(false));
        });
      } catch {
        if (order.checkoutUrl) {
          await openWompiCheckoutUrl(order.checkoutUrl);
          setBusy(false);
          return;
        }
        throw new Error('No se pudo abrir el módulo de pago de Wompi');
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo iniciar el pago');
      setBusy(false);
    }
  }

  const payLocked = busy || quoting || !quote || !profile;

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
              Precio fijo por días. El formato lo decide el archivo. La compra entra a la rotación, no es exclusiva.
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

          <div className="rounded-xl border border-amber-400/25 bg-zinc-900/70 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200">
              Dimensiones maestras
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {PROMO_BANNER_SIZE_LABEL} px <span className="text-zinc-400">(formato 3:1 · máx. {PROMO_MAX_ANIMATED_SEC} s)</span>
            </p>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300">
              <Upload size={16} />
              {mediaUrl ? 'Cambiar banner' : 'Subir PNG, JPG, WebP, GIF, MP4 o WebM'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
                className="hidden"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </label>
          </div>

          {mediaUrl ? (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <p className="bg-zinc-900/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Vista previa · {format === 'animated' ? 'Animado / video' : 'Estático'}
              </p>
              {isPromotionVideoUrl(mediaUrl) ? (
                <video src={mediaUrl} className="aspect-[3/1] w-full bg-black object-contain" muted playsInline controls />
              ) : (
                <img src={mediaUrl} alt="" className="aspect-[3/1] w-full bg-black object-contain" />
              )}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Paquete</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Formato detectado: <span className="font-semibold text-white">{format === 'animated' ? 'animado / video (+25 %)' : 'estático'}</span>
            </p>
            <div className="mt-2 grid gap-2">
              {packages.map((pkg) => {
                const active = pkg.id === packageId;
                const price = format === 'animated' ? pkg.animatedCop : pkg.staticCop;
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
                        {formatPromoCop(price / pkg.days)} / día (informativo)
                      </span>
                    </span>
                    <span className="text-sm font-bold text-amber-300">{formatPromoCop(price)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-white/5 pt-3">
              <div>
                <p className="text-[11px] text-zinc-500">Duración contratada</p>
                <p className="text-lg font-black text-white">
                  {days} {days === 1 ? 'día' : 'días'} · {days * 24} h
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-zinc-500">{formatPromoCop(perDay)} / día</p>
                <p className="text-lg font-bold text-amber-300">{quoting ? 'Cotizando…' : formatPromoCop(totalCop)}</p>
              </div>
            </div>
          </div>

          {note ? (
            <p
              className={`text-sm ${
                note.includes('confirmado') || note.includes('proceso')
                  ? 'text-emerald-400'
                  : 'text-fuchsia-400'
              }`}
            >
              {note}
            </p>
          ) : null}

          <button
            type="button"
            disabled={payLocked}
            onClick={() => void payWithWompi()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 px-4 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {busy ? 'Abriendo Wompi…' : 'Pagar'}
          </button>
          <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            El recargo animado se aplica una sola vez. Una pantalla de Wompi no publica el anuncio: espera confirmación y revisión.
          </p>
        </div>
      </div>
    </div>
  );
}