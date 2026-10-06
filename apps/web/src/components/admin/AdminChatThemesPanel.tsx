import { ArrowDown, ArrowUp, ChevronDown, Lock, RotateCcw, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isSafeThemeColor, saveChatThemesAdmin, uploadChatThemeAsset, useChatThemesAdminStore } from '../../chatThemes/adminConfig';
import { DEFAULT_CHAT_APPEARANCE } from '../../chatThemes/appearance';
import {
  CHAT_BG_ACCEPT,
  ChatBackgroundError,
  processChatBackground,
  revokeProcessedBackground,
} from '../../chatThemes/backgroundImage';
import { CHAT_FONT_FAMILIES, ensureChatFonts } from '../../chatThemes/fonts';
import { getChatTheme, listBaseChatThemes } from '../../chatThemes/registry';
import { resolveChatTheme } from '../../chatThemes/resolve';
import '../../chatThemes/themes';
import type { ChatTheme, ChatThemeAdminEntry, ChatThemesAdminConfig } from '../../chatThemes/types';
import { useAuthStore } from '../../store/authStore';
import { ChatThemePreview } from '../chatThemes/ChatThemePreview';

type TokenKey = keyof NonNullable<ChatThemeAdminEntry['tokens']>;

const TOKEN_FIELDS: Array<{ key: TokenKey; label: string }> = [
  { key: 'background', label: 'Fondo base' },
  { key: 'surface', label: 'Superficies' },
  { key: 'bubbleIncoming', label: 'Burbuja recibida' },
  { key: 'bubbleIncomingText', label: 'Texto recibido' },
  { key: 'bubbleOutgoing', label: 'Burbuja enviada' },
  { key: 'bubbleOutgoingText', label: 'Texto enviado' },
  { key: 'textPrimary', label: 'Texto principal' },
  { key: 'textSecondary', label: 'Texto secundario' },
  { key: 'accent', label: 'Acento' },
  { key: 'accentSecondary', label: 'Acento secundario' },
];

type ImageSlot = 'thumbnail' | 'portrait' | 'landscape';

const IMAGE_SLOTS: Array<{ slot: ImageSlot; label: string }> = [
  { slot: 'thumbnail', label: 'Miniatura' },
  { slot: 'portrait', label: 'Fondo vertical (móvil)' },
  { slot: 'landscape', label: 'Fondo horizontal (PC / tablet)' },
];

function entryOf(config: ChatThemesAdminConfig, id: string, index: number): ChatThemeAdminEntry {
  return config.themes[id] ?? { enabled: true, published: true, order: index };
}

function orderedThemes(config: ChatThemesAdminConfig): ChatTheme[] {
  return listBaseChatThemes()
    .map((theme, index) => ({ theme, index, order: config.themes[theme.id]?.order ?? index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ theme }) => theme);
}

function hexOrNull(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function AdminChatThemesPanel() {
  const ready = useChatThemesAdminStore((state) => state.ready);
  const remote = useChatThemesAdminStore((state) => state.config);
  const subscribe = useChatThemesAdminStore((state) => state.subscribe);
  const email = useAuthStore((state) => state.firebaseUser?.email ?? '');
  const [draft, setDraft] = useState<ChatThemesAdminConfig>(remote);
  const [dirty, setDirty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => {
    if (!dirty) setDraft(remote);
  }, [remote, dirty]);

  const themes = useMemo(() => orderedThemes(draft), [draft]);

  useEffect(() => {
    ensureChatFonts(themes.map((theme) => getChatTheme(draft, theme.id).tokens.fontHeading));
  }, [themes, draft]);

  const invalidColors = useMemo(
    () =>
      Object.values(draft.themes).some((entry) =>
        Object.values(entry.tokens || {}).some((value) => value !== undefined && !isSafeThemeColor(value)),
      ),
    [draft],
  );

  function update(next: (prev: ChatThemesAdminConfig) => ChatThemesAdminConfig) {
    setNotice(null);
    setDirty(true);
    setDraft(next);
  }

  function patchEntry(id: string, patch: Partial<ChatThemeAdminEntry>) {
    update((prev) => {
      const index = listBaseChatThemes().findIndex((theme) => theme.id === id);
      return { ...prev, themes: { ...prev.themes, [id]: { ...entryOf(prev, id, index), ...patch } } };
    });
  }

  function move(id: string, delta: -1 | 1) {
    update((prev) => {
      const ids = orderedThemes(prev).map((theme) => theme.id);
      const from = ids.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return prev;
      ids.splice(to, 0, ...ids.splice(from, 1));
      const base = listBaseChatThemes().map((theme) => theme.id);
      const nextThemes = { ...prev.themes };
      ids.forEach((themeId, order) => {
        nextThemes[themeId] = { ...entryOf(prev, themeId, base.indexOf(themeId)), order };
      });
      return { ...prev, themes: nextThemes };
    });
  }

  function setToken(id: string, key: TokenKey, value: string) {
    update((prev) => {
      const index = listBaseChatThemes().findIndex((theme) => theme.id === id);
      const entry = entryOf(prev, id, index);
      const tokens = { ...(entry.tokens || {}) };
      if (value.trim()) tokens[key] = value.trim();
      else delete tokens[key];
      return { ...prev, themes: { ...prev.themes, [id]: { ...entry, tokens } } };
    });
  }

  function restoreTheme(id: string) {
    update((prev) => {
      const index = listBaseChatThemes().findIndex((theme) => theme.id === id);
      const entry = entryOf(prev, id, index);
      return {
        ...prev,
        themes: { ...prev.themes, [id]: { enabled: entry.enabled, published: entry.published, order: entry.order } },
      };
    });
  }

  async function uploadImage(id: string, slot: ImageSlot, file: File) {
    setBusy(`${id}:${slot}`);
    setNotice(null);
    let processed: Awaited<ReturnType<typeof processChatBackground>> | null = null;
    try {
      processed = await processChatBackground(file);
      const { mime, blobs } = processed;
      if (slot === 'thumbnail') {
        const url = await uploadChatThemeAsset(id, 'thumbnail', blobs.thumb, mime);
        patchEntry(id, { thumbnail: url });
      } else {
        const [thumb, medium, full] = await Promise.all([
          uploadChatThemeAsset(id, `${slot}-thumb`, blobs.thumb, mime),
          uploadChatThemeAsset(id, `${slot}-medium`, blobs.medium, mime),
          uploadChatThemeAsset(id, `${slot}-full`, blobs.full, mime),
        ]);
        const variants = { thumb, medium, full };
        patchEntry(
          id,
          slot === 'portrait'
            ? { portrait: variants, luminance: Math.round(processed.luminance * 100) / 100 }
            : { landscape: variants },
        );
      }
      setNotice({ kind: 'ok', text: 'Imagen subida. Guarda y publica para aplicarla.' });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof ChatBackgroundError ? err.message : 'No se pudo subir la imagen.',
      });
    } finally {
      revokeProcessedBackground(processed);
      setBusy(null);
    }
  }

  async function publish() {
    if (invalidColors) {
      setNotice({ kind: 'error', text: 'Hay colores inválidos. Usa #hex, rgb() o linear-gradient().' });
      return;
    }
    setBusy('save');
    setNotice(null);
    try {
      await saveChatThemesAdmin(draft, email);
      setDirty(false);
      setNotice({ kind: 'ok', text: 'Temas publicados. Los usuarios los verán al instante.' });
    } catch {
      setNotice({ kind: 'error', text: 'No se pudo guardar. Revisa tus permisos de Mensajes.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white">Chat · Temas</h2>
          <p className="text-xs text-zinc-500">
            Activa, ordena y edita los temas del chat. LiveBoom Original no se puede quitar; si desactivas un
            tema, quienes lo usan ven el tema por defecto hasta que lo reactives.
          </p>
        </div>
        {dirty ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              setDirty(false);
              setDraft(remote);
              setNotice(null);
            }}
            className="min-h-11 rounded-xl bg-zinc-800/70 px-4 text-sm font-semibold text-zinc-300 disabled:opacity-50"
          >
            Descartar
          </button>
        ) : null}
        <button
          type="button"
          disabled={!ready || !dirty || Boolean(busy)}
          onClick={() => void publish()}
          className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy === 'save' ? 'Publicando…' : 'Guardar y publicar'}
        </button>
      </div>

      {notice ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.kind === 'ok'
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              : 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <ul className="space-y-3">
        {themes.map((base, position) => {
          const index = listBaseChatThemes().findIndex((theme) => theme.id === base.id);
          const entry = entryOf(draft, base.id, index);
          const theme = getChatTheme(draft, base.id);
          const locked = Boolean(base.locked);
          const enabled = locked || entry.enabled;
          const published = locked || (entry.enabled && entry.published);
          const isDefault = draft.defaultThemeId === base.id;
          const open = openId === base.id;
          return (
            <li key={base.id} className="lb-panel min-w-0 overflow-hidden rounded-2xl">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <img
                  src={theme.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-12 shrink-0 rounded-lg bg-zinc-900 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-bold text-white" style={{ fontFamily: theme.tokens.fontHeading }}>
                    {locked ? <Lock size={13} className="shrink-0 text-zinc-500" aria-label="Fijo" /> : null}
                    {theme.name}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {isDefault ? 'Por defecto · ' : ''}
                    {enabled ? (published ? 'Publicado' : 'Activo, oculto del selector') : 'Desactivado'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => move(base.id, -1)}
                      disabled={position === 0}
                      className="grid h-11 w-11 place-items-center rounded-l-xl bg-zinc-800/70 text-zinc-300 disabled:opacity-30"
                      aria-label={`Subir ${theme.name}`}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(base.id, 1)}
                      disabled={position === themes.length - 1}
                      className="grid h-11 w-11 place-items-center rounded-r-xl bg-zinc-800/70 text-zinc-300 disabled:opacity-30"
                      aria-label={`Bajar ${theme.name}`}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl bg-zinc-800/50 px-3 text-xs font-semibold text-zinc-300">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={locked}
                      onChange={(event) => patchEntry(base.id, { enabled: event.target.checked })}
                    />
                    Activo
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl bg-zinc-800/50 px-3 text-xs font-semibold text-zinc-300">
                    <input
                      type="checkbox"
                      checked={published}
                      disabled={locked || !entry.enabled}
                      onChange={(event) => patchEntry(base.id, { published: event.target.checked })}
                    />
                    Publicado
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-xl bg-zinc-800/50 px-3 text-xs font-semibold text-zinc-300">
                    <input
                      type="radio"
                      name="lb-chat-theme-default"
                      checked={isDefault}
                      disabled={!enabled}
                      onChange={() => update((prev) => ({ ...prev, defaultThemeId: base.id }))}
                    />
                    Por defecto
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : base.id)}
                    aria-expanded={open}
                    className="flex min-h-11 items-center gap-1 rounded-xl bg-zinc-800/70 px-3 text-xs font-semibold text-zinc-200"
                  >
                    Editar
                    <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
                  </button>
                </div>
              </div>

              {open ? (
                <ThemeEditor
                  theme={theme}
                  base={base}
                  entry={entry}
                  draft={draft}
                  busy={busy}
                  onName={(name) => patchEntry(base.id, { name: name.slice(0, 40) || undefined })}
                  onToken={(key, value) => setToken(base.id, key, value)}
                  onFont={(key, value) =>
                    patchEntry(base.id, key === 'fontFamily' ? { fontFamily: value || undefined } : { fontHeading: value || undefined })
                  }
                  onImage={(slot, file) => void uploadImage(base.id, slot, file)}
                  onRestore={() => restoreTheme(base.id)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ThemeEditor({
  theme,
  base,
  entry,
  draft,
  busy,
  onName,
  onToken,
  onFont,
  onImage,
  onRestore,
}: {
  theme: ChatTheme;
  base: ChatTheme;
  entry: ChatThemeAdminEntry;
  draft: ChatThemesAdminConfig;
  busy: string | null;
  onName: (name: string) => void;
  onToken: (key: TokenKey, value: string) => void;
  onFont: (key: 'fontFamily' | 'fontHeading', value: string) => void;
  onImage: (slot: ImageSlot, file: File) => void;
  onRestore: () => void;
}) {
  const resolved = useMemo(
    () =>
      resolveChatTheme({
        appearance: { ...DEFAULT_CHAT_APPEARANCE, themeId: base.id },
        admin: { ...draft, themes: { ...draft.themes, [base.id]: { ...entry, enabled: true } } },
        appScheme: 'dark',
      }),
    [base.id, draft, entry],
  );

  useEffect(() => {
    ensureChatFonts([theme.tokens.fontFamily, theme.tokens.fontHeading]);
  }, [theme.tokens.fontFamily, theme.tokens.fontHeading]);

  return (
    <div className="grid min-w-0 gap-4 border-t border-white/[0.06] p-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="mx-auto aspect-[9/16] w-full max-w-[15rem]">
        <ChatThemePreview resolved={resolved} />
      </div>
      <div className="min-w-0 space-y-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-zinc-300">Nombre</span>
          <input
            value={entry.name ?? ''}
            placeholder={base.name}
            maxLength={40}
            onChange={(event) => onName(event.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['fontFamily', 'Fuente del texto'],
              ['fontHeading', 'Fuente de títulos'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-300">{label}</span>
              <select
                value={entry[key] ?? ''}
                onChange={(event) => onFont(key, event.target.value)}
                className="min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-3 text-white"
              >
                <option value="">Del tema ({base.tokens[key]})</option>
                {CHAT_FONT_FAMILIES.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-zinc-300">Colores</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOKEN_FIELDS.map(({ key, label }) => {
              const value = entry.tokens?.[key] ?? '';
              const invalid = Boolean(value) && !isSafeThemeColor(value);
              const shown = value || base.tokens[key];
              return (
                <label key={key} className="flex min-w-0 items-center gap-2 text-xs">
                  <span
                    className="h-9 w-9 shrink-0 rounded-lg border border-white/15"
                    style={{ background: isSafeThemeColor(shown) ? shown : 'transparent' }}
                    aria-hidden
                  />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-zinc-400">{label}</span>
                    <span className="flex min-w-0 gap-1">
                      <input
                        value={value}
                        placeholder={base.tokens[key]}
                        onChange={(event) => onToken(key, event.target.value)}
                        aria-invalid={invalid}
                        className={`min-h-9 min-w-0 flex-1 rounded-lg border bg-zinc-900 px-2 font-mono text-[11px] text-white ${
                          invalid ? 'border-fuchsia-500' : 'border-white/10'
                        }`}
                      />
                      <input
                        type="color"
                        value={hexOrNull(value) ?? hexOrNull(base.tokens[key]) ?? '#000000'}
                        onChange={(event) => onToken(key, event.target.value)}
                        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                        aria-label={`Elegir ${label}`}
                      />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-zinc-300">Imágenes</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {IMAGE_SLOTS.map(({ slot, label }) => {
              const uploading = busy === `${base.id}:${slot}`;
              const custom = slot === 'thumbnail' ? entry.thumbnail : entry[slot]?.full;
              return (
                <label
                  key={slot}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-200"
                >
                  <Upload size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    {uploading ? 'Subiendo…' : label}
                    {custom ? <span className="block font-normal text-cyan-300">Personalizada</span> : null}
                  </span>
                  <input
                    type="file"
                    accept={CHAT_BG_ACCEPT}
                    className="sr-only"
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) onImage(slot, file);
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onRestore}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-zinc-800/60 px-4 text-xs font-semibold text-zinc-300"
        >
          <RotateCcw size={14} />
          Restaurar diseño original del tema
        </button>
      </div>
    </div>
  );
}
