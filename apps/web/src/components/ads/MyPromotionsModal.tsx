import { Megaphone, Pencil, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PROMO_BANNER_HEIGHT,
  PROMO_BANNER_SIZE_LABEL,
  PROMO_BANNER_WIDTH,
  PROMO_KINDS,
  regionLabel,
  type PromoKind,
} from '../../lib/promoRegions';
import {
  deactivatePromotion,
  type PromotionAd,
  updatePromotion,
} from '../../lib/promotionsFirestore';
import { isPromotionVideoUrl } from '../../lib/promotionLinks';
import { dataUrlToBlob, uploadUserMedia } from '../../lib/storage';
import { useAuthStore } from '../../store/authStore';

type Props = {
  ads: PromotionAd[];
  onClose: () => void;
};

function formatExpiry(ms: number) {
  const diff = ms - Date.now();
  if (diff <= 0) return 'Expirada';
  const days = Math.ceil(diff / 86_400_000);
  if (days === 1) return '1 día restante';
  return `${days} días restantes`;
}

export function MyPromotionsModal({ ads, onClose }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [editingId, setEditingId] = useState<string | null>(ads[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [kind, setKind] = useState<PromoKind>('marketing');
  const [mediaUrl, setMediaUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const editing = ads.find((ad) => ad.id === editingId) ?? ads[0] ?? null;

  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title);
    setLinkUrl(editing.linkUrl);
    setKind(editing.kind);
    setMediaUrl(editing.mediaUrl);
    setNote(null);
  }, [editing?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function onPickFile(file?: File | null) {
    if (!file || !profile) return;
    setBusy(true);
    setNote(null);
    try {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = () => reject(new Error('No se pudo leer la imagen'));
          img.src = url;
        });
        if (dims.width !== PROMO_BANNER_WIDTH || dims.height !== PROMO_BANNER_HEIGHT) {
          throw new Error(`El banner debe ser ${PROMO_BANNER_SIZE_LABEL} px.`);
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

  async function save() {
    if (!editing) return;
    setBusy(true);
    setNote(null);
    try {
      await updatePromotion(editing.id, {
        title: title.trim() || editing.title,
        linkUrl: linkUrl.trim(),
        mediaUrl: mediaUrl.trim(),
        kind,
      });
      setNote('Cambios guardados.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function endPromotion() {
    if (!editing) return;
    setBusy(true);
    setNote(null);
    try {
      await deactivatePromotion(editing.id);
      setNote('Publicidad finalizada.');
      if (ads.length <= 1) window.setTimeout(onClose, 800);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se pudo finalizar');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[85] grid place-items-end bg-black/75 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
              <Megaphone size={14} /> Publicidad promocionada
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">Mis promociones activas</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {ads.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">No tienes publicidad activa en este momento.</p>
        ) : (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {ads.map((ad) => (
                <button
                  key={ad.id}
                  type="button"
                  onClick={() => setEditingId(ad.id)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition ${
                    editing?.id === ad.id
                      ? 'border-cyan-400/50 bg-cyan-500/10 text-white'
                      : 'border-white/10 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  <span className="block max-w-[9rem] truncate font-semibold">{ad.title}</span>
                  <span className="block text-[10px] text-zinc-500">{formatExpiry(ad.expiresAtMs)}</span>
                </button>
              ))}
            </div>

            {editing ? (
              <div className="mt-4 grid gap-3">
                <p className="text-[11px] text-zinc-500">
                  {regionLabel(editing.regionId)} · {formatExpiry(editing.expiresAtMs)}
                </p>
                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-400">Título</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-zinc-400">Enlace</span>
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
                  />
                </label>
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
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
                  <Pencil size={16} />
                  {mediaUrl ? 'Cambiar banner' : 'Subir banner'}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => void onPickFile(e.target.files?.[0])}
                  />
                </label>
                {mediaUrl ? (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    {isPromotionVideoUrl(mediaUrl) ? (
                      <video src={mediaUrl} className="aspect-[3/1] w-full object-contain bg-black" muted playsInline controls />
                    ) : (
                      <img src={mediaUrl} alt="" className="aspect-[3/1] w-full object-contain bg-black" />
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {note ? (
          <p
            className={`mt-3 text-sm ${
              note.includes('guardados') || note.includes('finalizada') ? 'text-emerald-400' : 'text-fuchsia-400'
            }`}
          >
            {note}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void endPromotion()}
              className="min-h-11 rounded-xl border border-red-400/30 px-4 text-sm font-semibold text-red-300"
            >
              Finalizar publicidad
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-zinc-950"
            >
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
