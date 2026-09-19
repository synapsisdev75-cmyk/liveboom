import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ALL_GIFT_PLACEMENTS,
  buildDefaultCoinPackages,
  buildDefaultGiftsCatalog,
  saveCoinPackagesConfig,
  saveGiftsCatalog,
  uploadCatalogAsset,
  type EditableCoinPackage,
  type EditableGift,
  type GiftPlacement,
} from '../../lib/catalogConfigFirestore';
import { giftLevelFromCoins, type GiftLevel } from '../../lib/liveboomGifts';
import { packageCopLabel } from '../../lib/coinPackages';
import { useAuthStore } from '../../store/authStore';
import { useCatalogConfigStore } from '../../store/catalogConfigStore';
import {
  GiftCatalogPreview,
  type PreviewDevice,
} from './GiftCatalogPreview';
import { needsAlphaMovConvert, uploadGiftAnimation } from '../../lib/giftAlphaConvert';

const PLACEMENT_LABELS: Record<GiftPlacement, string> = {
  live: 'LIVE',
  post: 'Publicaciones',
  boom_clip: 'Boom Clip',
  flashboom: 'Flash Boom',
  call: 'Llamadas',
  chat: 'Chat',
};

type SubTab = 'gifts' | 'coins';

function AssetDropZone({
  label,
  accept,
  hint,
  previewUrl,
  isVideo,
  disabled,
  busyLabel,
  onFile,
}: {
  label: string;
  accept: string;
  hint: string;
  previewUrl?: string;
  isVideo?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function takeFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    takeFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">{label}</p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
          dragOver
            ? 'border-cyan-400 bg-cyan-500/10'
            : 'border-zinc-600 bg-zinc-900/60 hover:border-fuchsia-400/50 hover:bg-zinc-900'
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              muted
              loop
              autoPlay
              playsInline
              className="max-h-24 max-w-full rounded-lg object-contain"
            />
          ) : (
            <img
              src={previewUrl}
              alt=""
              className="max-h-24 max-w-full rounded-lg object-contain"
            />
          )
        ) : (
          <span className="text-2xl text-zinc-500">⬆</span>
        )}
        <span className="text-sm font-semibold text-white">
          {disabled ? busyLabel || 'Subiendo…' : 'Subir desde el escritorio'}
        </span>
        <span className="text-[11px] text-zinc-500">{hint}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          takeFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function AdminCatalogPanel() {
  const email = useAuthStore((s) => s.profile?.email) || 'super-admin';
  const storeGifts = useCatalogConfigStore((s) => s.gifts);
  const storePacks = useCatalogConfigStore((s) => s.packages);
  const giftsVersion = useCatalogConfigStore((s) => s.giftsVersion);
  const packsVersion = useCatalogConfigStore((s) => s.packsVersion);

  const [sub, setSub] = useState<SubTab>('gifts');
  const [gifts, setGifts] = useState<EditableGift[]>(() => buildDefaultGiftsCatalog().gifts);
  const [packs, setPacks] = useState<EditableCoinPackage[]>(() => buildDefaultCoinPackages().packages);
  const [selectedGiftId, setSelectedGiftId] = useState(gifts[0]?.id || '');
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id || '');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [convertingAlpha, setConvertingAlpha] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('mobile');

  useEffect(() => {
    if (storeGifts.length) {
      setGifts(storeGifts.map((g) => ({ ...g, face: g.face ? { ...g.face } : null })));
      if (!storeGifts.some((g) => g.id === selectedGiftId)) {
        setSelectedGiftId(storeGifts[0]!.id);
      }
    }
  }, [storeGifts, giftsVersion]);

  useEffect(() => {
    if (storePacks.length) {
      setPacks(storePacks.map((p) => ({ ...p })));
      if (!storePacks.some((p) => p.id === selectedPackId)) {
        setSelectedPackId(storePacks[0]!.id);
      }
    }
  }, [storePacks, packsVersion]);

  const filteredGifts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gifts;
    return gifts.filter(
      (g) =>
        g.id.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q) ||
        g.animation.toLowerCase().includes(q),
    );
  }, [gifts, query]);

  const gift = gifts.find((g) => g.id === selectedGiftId) || gifts[0];
  const pack = packs.find((p) => p.id === selectedPackId) || packs[0];

  function patchGift(id: string, patch: Partial<EditableGift>) {
    setGifts((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.coins != null) next.level = giftLevelFromCoins(patch.coins) as GiftLevel;
        if (patch.placements) {
          next.liveOnly = patch.placements.length === 1 && patch.placements[0] === 'live';
        }
        return next;
      }),
    );
  }

  function patchPack(id: string, patch: Partial<EditableCoinPackage>) {
    setPacks((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addGift() {
    const base = `regalo_${Date.now().toString(36)}`;
    const id = base.replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    const next: EditableGift = {
      id,
      name: 'Nuevo regalo',
      emoji: '🎁',
      coins: 10,
      level: 1,
      animation: '',
      enabled: true,
      placements: [...ALL_GIFT_PLACEMENTS],
      face: null,
    };
    setGifts((prev) => [...prev, next]);
    setSelectedGiftId(id);
    setMessage('Regalo agregado en borrador. Publica para guardar.');
  }

  function removeGift(id: string) {
    if (gifts.length <= 1) {
      setMessage('Debe quedar al menos un regalo en el catálogo.');
      return;
    }
    const next = gifts.filter((g) => g.id !== id);
    setGifts(next);
    if (selectedGiftId === id) setSelectedGiftId(next[0]?.id || '');
    setMessage('Regalo quitado del borrador. Publica para aplicar.');
  }

  function togglePlacement(id: string, placement: GiftPlacement) {
    const row = gifts.find((g) => g.id === id);
    if (!row) return;
    const has = row.placements.includes(placement);
    const next = has
      ? row.placements.filter((p) => p !== placement)
      : [...row.placements, placement];
    patchGift(id, { placements: next.length ? next : ['live'] });
  }

  async function publishGifts() {
    setSaving(true);
    setMessage(null);
    try {
      const version = Math.max(1, giftsVersion + 1);
      await saveGiftsCatalog({ version, gifts }, email);
      setMessage(`Regalos publicados (v${version}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo publicar regalos');
    } finally {
      setSaving(false);
    }
  }

  async function publishPacks() {
    setSaving(true);
    setMessage(null);
    try {
      const version = Math.max(1, packsVersion + 1);
      await saveCoinPackagesConfig({ version, packages: packs }, email);
      setMessage(`Paquetes Blast publicados (v${version}).`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo publicar paquetes');
    } finally {
      setSaving(false);
    }
  }

  async function onUploadGiftAsset(kind: 'image' | 'video', file: File | null) {
    if (!file || !gift) return;
    const convertMov = kind === 'video' && needsAlphaMovConvert(file);
    setUploading(true);
    setConvertingAlpha(convertMov);
    setMessage(null);
    try {
      const url =
        kind === 'video'
          ? await uploadGiftAnimation(gift.id, file)
          : await uploadCatalogAsset('gifts', `${gift.id}-${kind}`, file);
      patchGift(gift.id, kind === 'image' ? { image: url } : { video: url });
      setMessage(
        convertMov
          ? 'MOV 4444 convertido a WebM con alpha. Publica para aplicar.'
          : `${kind === 'image' ? 'Imagen' : 'Animación'} subida. Publica para aplicar.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
      setConvertingAlpha(false);
    }
  }

  async function onUploadPackArt(file: File | null) {
    if (!file || !pack) return;
    setUploading(true);
    setMessage(null);
    try {
      const url = await uploadCatalogAsset('blast', pack.id, file);
      patchPack(pack.id, { artUrl: url });
      setMessage('Arte del paquete subido. Publica para aplicar.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSub('gifts')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'gifts'
              ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
              : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Regalos / animaciones
        </button>
        <button
          type="button"
          onClick={() => setSub('coins')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            sub === 'coins'
              ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
              : 'bg-zinc-800/60 text-zinc-400'
          }`}
        >
          Paquetes Blast
        </button>
        {sub === 'gifts' ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void publishGifts()}
            className="ml-auto rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar regalos'}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void publishPacks()}
            className="ml-auto rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar paquetes'}
          </button>
        )}
      </div>

      {message ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          {message}
        </p>
      ) : null}

      {sub === 'gifts' && gift ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="lb-panel max-h-[70dvh] space-y-2 overflow-y-auto rounded-2xl p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar regalo…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={addGift}
              className="w-full rounded-xl border border-dashed border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/20"
            >
              + Agregar regalo
            </button>
            {filteredGifts.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedGiftId(row.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                  row.id === gift.id
                    ? 'bg-fuchsia-500/20 font-semibold text-fuchsia-100'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span className="text-lg">{row.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {!row.enabled ? <span className="text-[10px] text-rose-300">off</span> : null}
              </button>
            ))}
          </aside>

          <section className="lb-panel space-y-4 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl">{gift.emoji}</span>
              <div>
                <h2 className="text-lg font-bold text-white">{gift.name}</h2>
                <p className="text-xs text-zinc-500">{gift.id}</p>
              </div>
              <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={gift.enabled}
                  onChange={(e) => patchGift(gift.id, { enabled: e.target.checked })}
                />
                Activo
              </label>
              <button
                type="button"
                onClick={() => removeGift(gift.id)}
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Borrar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-zinc-400">
                Nombre
                <input
                  value={gift.name}
                  onChange={(e) => patchGift(gift.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Emoji
                <input
                  value={gift.emoji}
                  onChange={(e) => patchGift(gift.id, { emoji: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Precio (Blast)
                <input
                  type="number"
                  min={0}
                  value={gift.coins}
                  onChange={(e) => patchGift(gift.id, { coins: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Nivel animación
                <select
                  value={gift.level}
                  onChange={(e) => patchGift(gift.id, { level: Number(e.target.value) as GiftLevel })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Nivel {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-xs text-zinc-400">
              Descripción de animación
              <textarea
                value={gift.animation}
                rows={3}
                onChange={(e) => patchGift(gift.id, { animation: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Ubicaciones donde aparece
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_GIFT_PLACEMENTS.map((placement) => {
                  const on = gift.placements.includes(placement);
                  return (
                    <button
                      key={placement}
                      type="button"
                      onClick={() => togglePlacement(gift.id, placement)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        on
                          ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {PLACEMENT_LABELS[placement]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <AssetDropZone
                  label="Imagen PNG / WebP"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hint="Arrastra o haz clic · PNG, JPG, WebP"
                  previewUrl={gift.image}
                  disabled={uploading}
                  onFile={(file) => void onUploadGiftAsset('image', file)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL imagen (opcional)
                  <input
                    value={gift.image || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      patchGift(gift.id, { image: value || undefined });
                    }}
                    placeholder="/gifts/besito.png o https://…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <div className="space-y-3">
                <AssetDropZone
                  label="Animación WebM / MP4 / MOV 4444"
                  accept="video/webm,video/mp4,video/quicktime,.webm,.mp4,.mov"
                  hint="Arrastra o haz clic · MOV ProRes 4444 con alpha se convierte a WebM al instante"
                  previewUrl={gift.video}
                  isVideo
                  disabled={uploading}
                  busyLabel={convertingAlpha ? 'Convirtiendo MOV 4444…' : 'Subiendo…'}
                  onFile={(file) => void onUploadGiftAsset('video', file)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL animación (opcional)
                  <input
                    value={gift.video || ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      patchGift(gift.id, { video: value || undefined });
                    }}
                    placeholder="/gifts/flor_tropical.webm o MOV 4444 convertido"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </div>

            <GiftCatalogPreview
              gift={gift}
              device={previewDevice}
              onDeviceChange={setPreviewDevice}
            />

            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Ubicación en cara (Face Mesh)
                </p>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(gift.face)}
                    onChange={(e) =>
                      patchGift(gift.id, {
                        face: e.target.checked
                          ? {
                              emoji: gift.emoji,
                              anchor: 'hat',
                              scale: 1.2,
                              offsetY: -0.8,
                            }
                          : null,
                      })
                    }
                  />
                  Activar anclaje
                </label>
              </div>
              {gift.face ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Ancla
                    <select
                      value={gift.face.anchor}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: {
                            ...gift.face!,
                            anchor: e.target.value as NonNullable<EditableGift['face']>['anchor'],
                          },
                        })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="hat">Sombrero / frente</option>
                      <option value="crown">Corona</option>
                      <option value="mask">Máscara</option>
                      <option value="glasses">Lentes</option>
                      <option value="kiss">Labios / beso</option>
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Emoji en cara
                    <input
                      value={gift.face.emoji}
                      onChange={(e) =>
                        patchGift(gift.id, { face: { ...gift.face!, emoji: e.target.value } })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Escala ({gift.face.scale.toFixed(2)})
                    <input
                      type="range"
                      min={0.2}
                      max={2.5}
                      step={0.05}
                      value={gift.face.scale}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: { ...gift.face!, scale: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                  <label className="block space-y-1 text-xs text-zinc-400">
                    Offset Y ({gift.face.offsetY.toFixed(2)})
                    <input
                      type="range"
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      value={gift.face.offsetY}
                      onChange={(e) =>
                        patchGift(gift.id, {
                          face: { ...gift.face!, offsetY: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </label>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Sin anclaje facial (animación flotante normal).</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {sub === 'coins' && pack ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="lb-panel max-h-[70dvh] space-y-1 overflow-y-auto rounded-2xl p-2">
            {packs.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedPackId(row.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                  row.id === pack.id
                    ? 'bg-fuchsia-500/20 font-semibold text-fuchsia-100'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {row.name} · {row.coins}
                {!row.enabled ? <span className="ml-2 text-[10px] text-rose-300">off</span> : null}
              </button>
            ))}
          </aside>
          <section className="lb-panel space-y-4 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <img src={pack.artUrl} alt="" className="h-16 w-16 object-contain" />
              <div>
                <h2 className="text-lg font-bold text-white">{pack.name}</h2>
                <p className="text-xs text-zinc-500">{pack.id}</p>
              </div>
              <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={pack.enabled}
                  onChange={(e) => patchPack(pack.id, { enabled: e.target.checked })}
                />
                Activo
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs text-zinc-400">
                Nombre
                <input
                  value={pack.name}
                  onChange={(e) => patchPack(pack.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Blast
                <input
                  type="number"
                  min={1}
                  value={pack.coins}
                  onChange={(e) => patchPack(pack.id, { coins: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Precio (centavos COP Wompi)
                <input
                  type="number"
                  min={100}
                  value={pack.amountInCop}
                  onChange={(e) => patchPack(pack.id, { amountInCop: Number(e.target.value) })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
                <span className="text-[11px] text-zinc-500">{packageCopLabel(pack.amountInCop)}</span>
              </label>
              <div className="space-y-2 sm:col-span-2">
                <AssetDropZone
                  label="Arte del paquete"
                  accept="image/png,image/jpeg,image/webp"
                  hint="Arrastra o haz clic · imagen desde el escritorio"
                  previewUrl={pack.artUrl}
                  disabled={uploading}
                  onFile={(file) => void onUploadPackArt(file)}
                />
                <label className="block space-y-1 text-xs text-zinc-400">
                  URL arte (opcional)
                  <input
                    value={pack.artUrl}
                    onChange={(e) => patchPack(pack.id, { artUrl: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pack.popular}
                  onChange={(e) => patchPack(pack.id, { popular: e.target.checked })}
                />
                Popular
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pack.bestValue}
                  onChange={(e) => patchPack(pack.id, { bestValue: e.target.checked })}
                />
                Mejor valor
              </label>
            </div>
            <p className="text-xs text-amber-200/80">
              Nota: al cambiar precio/Blast, también debe alinearse el backend de pagos. Si el cobro
              falla tras publicar, avisa para sincronizar el servidor.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
