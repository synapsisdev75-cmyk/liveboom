import { Monitor, RotateCcw, Smartphone, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatThemesAdminStore } from '../../chatThemes/adminConfig';
import { DEFAULT_CHAT_APPEARANCE } from '../../chatThemes/appearance';
import {
  revokeProcessedBackground,
  uploadChatBackground,
  type ProcessedBackground,
} from '../../chatThemes/backgroundImage';
import { useChatThemePrefs } from '../../chatThemes/prefsStore';
import { getChatTheme, listChatThemes } from '../../chatThemes/registry';
import { LIVEBOOM_ORIGINAL_ID } from '../../chatThemes/themes';
import { useChatAppearance, useChatThemeSync, useResolveChatTheme } from '../../chatThemes/useChatTheme';
import type { ChatAppearance, ChatCustomBackground } from '../../chatThemes/types';
import { useBackLayer } from '../../lib/backLayer';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { ChatBackgroundEditor } from './ChatBackgroundEditor';
import { ChatThemePreview } from './ChatThemePreview';
import { ChatThemeSelector } from './ChatThemeSelector';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Con conversación: permite «Aplicar solo a esta conversación». */
  chatId?: string | null;
  peerName?: string;
};

export function ChatThemeSheet(props: Props) {
  if (!props.open) return null;
  return <ChatThemeSheetInner {...props} />;
}

function backgroundFromProcessed(processed: ProcessedBackground): ChatCustomBackground {
  return {
    id: processed.id,
    thumb: processed.urls.thumb,
    medium: processed.urls.medium,
    full: processed.urls.full,
    width: processed.width,
    height: processed.height,
    backgroundPositionX: 50,
    backgroundPositionY: 50,
    zoom: 1,
    rotation: 0,
    blur: 0,
    overlayOpacity: 0.2,
    autoReadability: true,
    luminance: processed.luminance,
    baseColor: processed.baseColor,
  };
}

function ChatThemeSheetInner({ onClose, chatId, peerName }: Props) {
  useChatThemeSync(chatId);
  const { appearance, scope: savedScope } = useChatAppearance(chatId);
  const [scope, setScope] = useState<'global' | 'chat'>(chatId && savedScope === 'chat' ? 'chat' : 'global');
  const [draft, setDraft] = useState<ChatAppearance>(appearance);
  const [editing, setEditing] = useState<ChatCustomBackground | null>(null);
  const [landscape, setLandscape] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(new Map<string, ProcessedBackground>());
  const admin = useChatThemesAdminStore((state) => state.config);
  const uid = useChatThemePrefs((state) => state.uid);
  const save = useChatThemePrefs((state) => state.save);
  const clearChat = useChatThemePrefs((state) => state.clearChat);
  const resolved = useResolveChatTheme(draft);

  const themes = useMemo(() => {
    const list = listChatThemes(admin);
    if (!list.some((theme) => theme.id === resolved.activeThemeId)) {
      list.push(getChatTheme(admin, resolved.activeThemeId));
    }
    return list;
  }, [admin, resolved.activeThemeId]);

  function releaseUnused(keepId?: string | null) {
    processedRef.current.forEach((processed, id) => {
      if (id === keepId) return;
      revokeProcessedBackground(processed);
      processedRef.current.delete(id);
    });
  }

  useEffect(() => () => releaseUnused(), []);

  function cancel() {
    if (saving) return;
    onClose();
  }

  useBodyScrollLock(true);
  useBackLayer(!editing, cancel);

  function patch(next: Partial<ChatAppearance>) {
    setError(null);
    setDraft((prev) => ({ ...prev, ...next }));
  }

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      let next = draft;
      const bg = next.customBackground;
      if (bg && bg.full.startsWith('blob:')) {
        const processed = processedRef.current.get(bg.id);
        if (!uid || !processed) throw new Error('auth');
        const urls = await uploadChatBackground(uid, processed);
        next = { ...next, customBackground: { ...bg, ...urls } };
      }
      if (scope === 'chat' && chatId) {
        await save('chat', next, chatId);
      } else {
        await save('global', next);
        if (chatId && savedScope === 'chat') await clearChat(chatId);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'auth'
          ? 'Inicia sesión para usar tu propio fondo.'
          : 'No se pudo sincronizar. El tema quedó guardado en este dispositivo y se reintentará con conexión.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function applyGeneralHere() {
    if (!chatId) return;
    setSaving(true);
    try {
      await clearChat(chatId);
      onClose();
    } catch {
      setError('No se pudo sincronizar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const panel = (
    <div className="lb-cts" role="dialog" aria-modal="true" aria-labelledby="lb-cts-title">
      <div className="lb-cts__scrim" aria-hidden />
      <div className="lb-cts__panel">
        <header className="lb-cts__head">
          <h2 id="lb-cts-title" className="lb-cts__title">
            Temas del chat
          </h2>
          <button type="button" className="lb-cts__icon-btn" onClick={cancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="lb-cts__body">
          <div className="lb-cts__preview">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Vista previa · {resolved.theme.name}
              </p>
              <div className="lb-cts__segment" role="radiogroup" aria-label="Formato de la vista previa">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!landscape}
                  aria-label="Vertical"
                  className={!landscape ? 'is-on' : ''}
                  onClick={() => setLandscape(false)}
                >
                  <Smartphone size={15} className="mx-auto" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={landscape}
                  aria-label="Horizontal"
                  className={landscape ? 'is-on' : ''}
                  onClick={() => setLandscape(true)}
                >
                  <Monitor size={15} className="mx-auto" />
                </button>
              </div>
            </div>
            <div className="lb-cts__frame-wrap">
              <div className={`lb-cts__frame ${landscape ? 'is-landscape' : ''}`}>
                <ChatThemePreview
                  resolved={resolved}
                  compact={landscape}
                  orientation={landscape ? 'landscape' : 'portrait'}
                />
              </div>
            </div>
          </div>
          <div className="lb-cts__options">
            {chatId ? (
              <section className="lb-cts__section">
                <h3 className="lb-cts__section-title">Aplicar a</h3>
                <div className="lb-cts__segment" role="radiogroup" aria-label="Aplicar a">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={scope === 'global'}
                    className={scope === 'global' ? 'is-on' : ''}
                    onClick={() => setScope('global')}
                  >
                    Todos mis chats
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={scope === 'chat'}
                    className={scope === 'chat' ? 'is-on' : ''}
                    onClick={() => setScope('chat')}
                  >
                    Solo esta conversación
                  </button>
                </div>
                {savedScope === 'chat' ? (
                  <button type="button" className="lb-cts__btn lb-cts__btn--link mt-2" disabled={saving} onClick={() => void applyGeneralHere()}>
                    Usar mi tema general en esta conversación
                  </button>
                ) : null}
                {peerName && scope === 'chat' ? (
                  <p className="lb-cts__hint">Solo cambia tu vista del chat con {peerName}. La otra persona no ve tu tema.</p>
                ) : null}
              </section>
            ) : null}
            <ChatThemeSelector
              draft={draft}
              activeThemeId={resolved.activeThemeId}
              themes={themes}
              onChange={patch}
              onPickBackground={(processed) => {
                processedRef.current.set(processed.id, processed);
                setEditing(backgroundFromProcessed(processed));
              }}
              onEditBackground={() => setEditing(draft.customBackground)}
            />
            {error ? <p className="lb-cts__error">{error}</p> : null}
          </div>
        </div>
        <footer className="lb-cts__foot">
          <button
            type="button"
            className="lb-cts__btn lb-cts__btn--link"
            disabled={saving}
            onClick={() => patch({ ...DEFAULT_CHAT_APPEARANCE, themeId: LIVEBOOM_ORIGINAL_ID })}
          >
            <RotateCcw size={15} />
            Restablecer
          </button>
          <span className="lb-cts__spacer" />
          <button type="button" className="lb-cts__btn lb-cts__btn--ghost" disabled={saving} onClick={cancel}>
            Cancelar
          </button>
          <button type="button" className="lb-cts__btn lb-cts__btn--primary" disabled={saving} onClick={() => void apply()}>
            {saving ? 'Aplicando…' : 'Aplicar'}
          </button>
        </footer>
      </div>
      {editing ? (
        <ChatBackgroundEditor
          appearance={draft}
          initial={editing}
          onCancel={() => {
            if (draft.customBackground?.id !== editing.id) {
              const processed = processedRef.current.get(editing.id);
              revokeProcessedBackground(processed ?? null);
              processedRef.current.delete(editing.id);
            }
            setEditing(null);
          }}
          onConfirm={(background) => {
            releaseUnused(background.id);
            patch({ customBackground: background });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return panel;
  return createPortal(panel, document.body);
}
