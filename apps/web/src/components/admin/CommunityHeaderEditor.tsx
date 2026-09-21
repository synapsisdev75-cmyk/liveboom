import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Copy, ImagePlus, RotateCcw, Trash2, Type, Upload, Users } from 'lucide-react';
import { CommunityOrbitNeonFrame } from '../community/CommunityOrbitNeonFrame';
import { useAuthStore } from '../../store/authStore';
import { logAdminAction } from '../../lib/superAdminSecurity';
import { useCommunityHeaderStore } from '../../store/communityHeaderStore';
import {
  buildDefaultCommunityHeader,
  cloneCommunityHeader,
  newStickerId,
  saveCommunityHeader,
  uploadCommunityAsset,
  type CommunityHeaderDoc,
  type CommunityHeaderSticker,
  type CommunityHeaderTheme,
  type OrbitSlot,
} from '../../lib/communityHeaderFirestore';

type ThemeMode = 'light' | 'dark';
type OrbitSlotKey = 'center' | 0 | 1 | 2 | 3 | 4 | 5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.1,
  suffix = '%',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-cyan-300">
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </label>
  );
}

function OrbitPhoto({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" className="block h-full w-full rounded-full object-cover" draggable={false} />
  ) : (
    <span className="grid h-full w-full place-items-center rounded-full bg-black/40 text-[0.65rem] font-black text-violet-200">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CommunityHeaderEditor() {
  const profile = useAuthStore((s) => s.profile);
  const liveConfig = useCommunityHeaderStore((s) => s.config);

  const [draft, setDraft] = useState<CommunityHeaderDoc>(() => cloneCommunityHeader(liveConfig));
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [orbitSlot, setOrbitSlot] = useState<OrbitSlotKey>('center');
  const canvasRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    kind: 'sticker' | 'resize' | 'orbit';
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW?: number;
    origH?: number;
  } | null>(null);

  useEffect(() => {
    setDraft(cloneCommunityHeader(liveConfig));
  }, [liveConfig.version]);

  const theme = mode === 'dark' ? draft.dark : draft.light;

  const patchTheme = useCallback(
    (patch: Partial<CommunityHeaderTheme>) => {
      setDraft((prev) => ({
        ...prev,
        [mode]: { ...prev[mode], ...patch },
      }));
    },
    [mode],
  );

  const updateSticker = useCallback(
    (id: string, patch: Partial<CommunityHeaderSticker>) => {
      setDraft((prev) => {
        const current = prev[mode];
        return {
          ...prev,
          [mode]: {
            ...current,
            stickers: current.stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          },
        };
      });
    },
    [mode],
  );

  const patchOrbitSlot = useCallback(
    (key: OrbitSlotKey, patch: Partial<OrbitSlot>) => {
      setDraft((prev) => {
        const current = prev[mode];
        const layout = {
          center: { ...current.orbitLayout.center },
          friends: current.orbitLayout.friends.map((s) => ({ ...s })),
        };
        if (key === 'center') layout.center = { ...layout.center, ...patch };
        else layout.friends[key] = { ...layout.friends[key]!, ...patch };
        return { ...prev, [mode]: { ...current, orbitLayout: layout } };
      });
    },
    [mode],
  );

  async function handlePublish() {
    setSaving(true);
    setMessage(null);
    try {
      const nextVersion = Math.max(1, (liveConfig.version ?? draft.version) + 1);
      const next = { ...draft, version: nextVersion };
      await saveCommunityHeader(next, profile?.email ?? 'super-admin');
      if (profile?.id && profile?.email) {
        void logAdminAction({
          action: 'community_header_publish',
          uid: profile.id,
          email: profile.email,
          meta: { version: nextVersion },
        });
      }
      setDraft(next);
      setMessage('Header de Comunidad publicado. Los usuarios lo verán al instante.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al publicar');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(buildDefaultCommunityHeader());
    setSelectedSticker(null);
    setMessage('Borrador restaurado a defaults (sin publicar).');
  }

  function duplicateToOther() {
    setDraft((prev) => {
      const source = cloneCommunityHeader(prev)[mode];
      const target: ThemeMode = mode === 'dark' ? 'light' : 'dark';
      return { ...prev, [target]: { ...source, stickers: source.stickers.map((s) => ({ ...s })) } };
    });
    setMessage(`Tema ${mode} duplicado al ${mode === 'dark' ? 'claro' : 'oscuro'} (sin publicar).`);
  }

  async function uploadBg(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const isVideo = file.type.startsWith('video/');
      const url = await uploadCommunityAsset(mode, 'bg', file, file.type);
      patchTheme({ bgKind: isVideo ? 'video' : 'image', bgUrl: url });
      setMessage(isVideo ? 'Video de fondo subido.' : 'Imagen de fondo subida.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir fondo');
    } finally {
      setUploading(false);
    }
  }

  async function uploadSticker(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const url = await uploadCommunityAsset(mode, 'sticker', file, file.type);
      const sticker: CommunityHeaderSticker = {
        id: newStickerId(),
        kind: 'image',
        url,
        x: 50,
        y: 50,
        w: 16,
        h: 16,
        z: theme.stickers.length + 1,
      };
      patchTheme({ stickers: [...theme.stickers, sticker] });
      setSelectedSticker(sticker.id);
      setMessage('Elemento añadido. Arrástralo en el lienzo.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir elemento');
    } finally {
      setUploading(false);
    }
  }

  function addTextSticker() {
    const sticker: CommunityHeaderSticker = {
      id: newStickerId(),
      kind: 'text',
      text: 'Nuevo texto',
      x: 45,
      y: 55,
      w: 28,
      h: 10,
      z: theme.stickers.length + 1,
    };
    patchTheme({ stickers: [...theme.stickers, sticker] });
    setSelectedSticker(sticker.id);
  }

  function removeSelectedSticker() {
    if (!selectedSticker) return;
    patchTheme({ stickers: theme.stickers.filter((s) => s.id !== selectedSticker) });
    setSelectedSticker(null);
  }

  function onStickerPointerDown(
    sticker: CommunityHeaderSticker,
    event: ReactPointerEvent,
    kind: 'sticker' | 'resize',
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedSticker(sticker.id);
    dragRef.current = {
      kind,
      id: sticker.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: sticker.x,
      origY: sticker.y,
      origW: sticker.w,
      origH: sticker.h,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onCanvasPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box || box.width < 1 || box.height < 1) return;
    const dx = ((event.clientX - drag.startX) / box.width) * 100;
    const dy = ((event.clientY - drag.startY) / box.height) * 100;
    if (drag.kind === 'sticker') {
      updateSticker(drag.id, {
        x: clamp(drag.origX + dx, 2, 98),
        y: clamp(drag.origY + dy, 2, 98),
      });
    } else if (drag.kind === 'resize') {
      updateSticker(drag.id, {
        w: clamp((drag.origW ?? 16) + dx, 6, 60),
        h: clamp((drag.origH ?? 16) + dy, 6, 60),
      });
    } else if (drag.kind === 'orbit') {
      const key = drag.id as OrbitSlotKey;
      if (key === 'center') {
        patchOrbitSlot('center', {
          x: clamp(drag.origX + dx, 5, 95),
          y: clamp(drag.origY + dy, 5, 95),
        });
      } else {
        const idx = Number(key) as 0 | 1 | 2 | 3 | 4 | 5;
        patchOrbitSlot(idx, {
          x: clamp(drag.origX + dx, 5, 95),
          y: clamp(drag.origY + dy, 5, 95),
        });
      }
    }
  }

  function endDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onOrbitPointerDown(key: OrbitSlotKey, event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOrbitSlot(key);
    const slot =
      key === 'center' ? theme.orbitLayout.center : theme.orbitLayout.friends[key]!;
    dragRef.current = {
      kind: 'orbit',
      id: String(key),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: slot.x,
      origY: slot.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  const isDark = mode === 'dark';
  const orbitSlotValue =
    orbitSlot === 'center'
      ? theme.orbitLayout.center
      : theme.orbitLayout.friends[orbitSlot]!;

  const meLetter = (profile?.displayName || profile?.handle || 'A').slice(0, 1);

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">Header Comunidad</p>
          <p className="text-sm text-zinc-400">
            Editor visual · v{draft.version} borrador · v{liveConfig.version} publicado
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300"
          >
            <RotateCcw size={14} />
            Defaults
          </button>
          <button
            type="button"
            onClick={duplicateToOther}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm text-zinc-300"
          >
            <Copy size={14} />
            Duplicar al otro tema
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handlePublish()}
            className="inline-flex min-h-11 items-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar en Firestore'}
          </button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['dark', 'light'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${
              mode === m
                ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40'
                : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            {m === 'dark' ? 'Oscuro' : 'Claro'}
          </button>
        ))}
      </div>

      {/* Lienzo */}
      <header
        ref={canvasRef}
        className={`lb-community-header relative overflow-hidden rounded-2xl border p-4 sm:rounded-3xl sm:p-6 ${
          isDark ? 'border-white/[0.06] bg-[#14151c]' : 'border-violet-200/50 bg-white'
        }`}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => setSelectedSticker(null)}
      >
        {theme.bgKind === 'video' && theme.bgUrl ? (
          <video
            src={theme.bgUrl}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : theme.bgKind === 'image' && theme.bgUrl ? (
          <img
            src={theme.bgUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
            draggable={false}
          />
        ) : null}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: isDark
              ? `linear-gradient(90deg, rgba(20,21,28,${theme.overlayOpacity}) 0%, rgba(20,21,28,${theme.overlayOpacity * 0.55}) 55%, rgba(20,21,28,${theme.overlayOpacity * 0.3}) 100%)`
              : `linear-gradient(90deg, rgba(255,255,255,${theme.overlayOpacity}) 0%, rgba(255,255,255,${theme.overlayOpacity * 0.65}) 55%, rgba(255,255,255,${theme.overlayOpacity * 0.3}) 100%)`,
          }}
        />

        {theme.stickers.map((sticker) => {
          const selected = selectedSticker === sticker.id;
          return (
            <div
              key={sticker.id}
              role="button"
              tabIndex={0}
              className={`absolute touch-none ${selected ? 'ring-2 ring-cyan-300' : 'ring-1 ring-white/20'}`}
              style={{
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                width: `${sticker.w}%`,
                height: `${sticker.h}%`,
                zIndex: 10 + sticker.z,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSticker(sticker.id);
              }}
              onPointerDown={(e) => onStickerPointerDown(sticker, e, 'sticker')}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {sticker.kind === 'image' && sticker.url ? (
                <img
                  src={sticker.url}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div
                  className={`grid h-full w-full place-items-center rounded-lg px-1 text-center text-[clamp(0.55rem,1.8vw,0.85rem)] font-bold ${
                    isDark ? 'bg-black/40 text-white' : 'bg-white/70 text-zinc-900'
                  }`}
                >
                  {sticker.text || 'Texto'}
                </div>
              )}
              {selected ? (
                <span
                  className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-se-resize rounded-sm bg-cyan-400"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onStickerPointerDown(sticker, e, 'resize');
                  }}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ) : null}
            </div>
          );
        })}

        <div className="relative z-[5] flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl flex-1">
            <p
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
                isDark ? 'text-violet-300' : 'text-violet-700'
              }`}
            >
              <Users size={12} />
              {theme.eyebrow || 'Comunidad'}
            </p>
            <h1
              className={`mt-1 text-2xl font-bold tracking-tight sm:text-3xl ${
                isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {theme.title || 'Buscar amigos'}
            </h1>
            <p
              className={`mt-2 text-sm leading-relaxed ${
                isDark ? 'text-zinc-300' : 'text-zinc-600'
              }`}
            >
              {theme.subtitle}
            </p>
          </div>

          {theme.showOrbit ? (
            <div className="lb-community-orbit relative aspect-square w-[min(42vw,12.5rem)] shrink-0 touch-none sm:w-[13.25rem]">
              {(
                [
                  ['center' as const, theme.orbitLayout.center] as const,
                  ...(theme.orbitLayout.friends.map(
                    (slot, index) => [index as 0 | 1 | 2 | 3 | 4 | 5, slot] as const,
                  )),
                ] as Array<readonly [OrbitSlotKey, OrbitSlot]>
              ).map(([key, slot]) => (
                <button
                  key={String(key)}
                  type="button"
                  className={`absolute z-[1] cursor-grab overflow-hidden rounded-full bg-transparent active:cursor-grabbing ${
                    orbitSlot === key ? 'ring-2 ring-cyan-300' : 'ring-1 ring-white/25'
                  }`}
                  style={{
                    left: `${slot.x}%`,
                    top: `${slot.y}%`,
                    width: `${slot.size}%`,
                    height: `${slot.size}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={(e) => onOrbitPointerDown(key, e)}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <OrbitPhoto
                    url={key === 'center' ? profile?.avatarUrl ?? null : null}
                    name={key === 'center' ? meLetter : String(Number(key) + 1)}
                  />
                </button>
              ))}
              <CommunityOrbitNeonFrame layout={theme.orbitLayout} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="lb-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white">Textos</h3>
          <label className="block space-y-1 text-xs text-zinc-400">
            Eyebrow
            <input
              value={theme.eyebrow}
              onChange={(e) => patchTheme({ eyebrow: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Título
            <input
              value={theme.title}
              onChange={(e) => patchTheme({ title: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1 text-xs text-zinc-400">
            Subtítulo
            <textarea
              value={theme.subtitle}
              onChange={(e) => patchTheme({ subtitle: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </section>

        <section className="lb-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white">Fondo</h3>
          <div className="flex flex-wrap gap-2">
            {(['image', 'video', 'none'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => patchTheme({ bgKind: k })}
                className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${
                  theme.bgKind === k
                    ? 'bg-fuchsia-500/20 text-fuchsia-100'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {k === 'image' ? 'Imagen' : k === 'video' ? 'Video' : 'Ninguno'}
              </button>
            ))}
          </div>
          <label className="block space-y-1 text-xs text-zinc-400">
            URL fondo
            <input
              value={theme.bgUrl ?? ''}
              onChange={(e) => patchTheme({ bgUrl: e.target.value || null })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
            />
          </label>
          <label className="block">
            <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-300">
              <Upload size={14} />
              {uploading ? 'Subiendo…' : 'Subir imagen o video'}
            </span>
            <input
              type="file"
              accept="image/*,video/mp4,video/webm"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void uploadBg(e.target.files?.[0] ?? null)}
            />
          </label>
          <SliderRow
            label="Overlay"
            value={theme.overlayOpacity * 100}
            min={0}
            max={90}
            step={1}
            onChange={(v) => patchTheme({ overlayOpacity: v / 100 })}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={theme.showOrbit}
              onChange={(e) => patchTheme({ showOrbit: e.target.checked })}
              className="accent-cyan-400"
            />
            Mostrar órbita de amigos
          </label>
        </section>

        <section className="lb-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white">Elementos sueltos</h3>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-100">
              <ImagePlus size={14} />
              Pegar / subir imagen
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void uploadSticker(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={addTextSticker}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-300"
            >
              <Type size={14} />
              Añadir texto
            </button>
            <button
              type="button"
              disabled={!selectedSticker}
              onClick={removeSelectedSticker}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-500/40 px-3 text-xs font-semibold text-rose-300 disabled:opacity-40"
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
          {selectedSticker ? (
            <label className="block space-y-1 text-xs text-zinc-400">
              Texto del elemento
              <input
                value={
                  theme.stickers.find((s) => s.id === selectedSticker)?.text ?? ''
                }
                onChange={(e) => updateSticker(selectedSticker, { text: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              />
            </label>
          ) : (
            <p className="text-xs text-zinc-500">Selecciona un elemento en el lienzo para editarlo.</p>
          )}
        </section>

        <section className="lb-panel space-y-3 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-white">Órbita (slots %)</h3>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['center', 'Yo'],
                [0, '👑'],
                [1, '2'],
                [2, '3'],
                [3, '4'],
                [4, '5'],
                [5, '6'],
              ] as Array<[OrbitSlotKey, string]>
            ).map(([key, label]) => (
              <button
                key={String(key)}
                type="button"
                onClick={() => setOrbitSlot(key)}
                className={`min-h-10 min-w-10 rounded-lg px-2 text-xs font-bold ${
                  orbitSlot === key ? 'bg-cyan-500/25 text-cyan-100' : 'bg-white/5 text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SliderRow
              label="X"
              value={orbitSlotValue.x}
              min={5}
              max={95}
              onChange={(v) => patchOrbitSlot(orbitSlot, { x: clamp(v, 5, 95) })}
            />
            <SliderRow
              label="Y"
              value={orbitSlotValue.y}
              min={5}
              max={95}
              onChange={(v) => patchOrbitSlot(orbitSlot, { y: clamp(v, 5, 95) })}
            />
            <SliderRow
              label="Tamaño"
              value={orbitSlotValue.size}
              min={8}
              max={40}
              onChange={(v) => patchOrbitSlot(orbitSlot, { size: clamp(v, 8, 40) })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
