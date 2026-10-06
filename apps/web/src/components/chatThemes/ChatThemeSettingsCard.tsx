import { Palette } from 'lucide-react';
import { useState } from 'react';
import { useResolvedChatTheme } from '../../chatThemes/useChatTheme';
import { ChatThemePreview } from './ChatThemePreview';
import { ChatThemeSheet } from './ChatThemeSheet';

/** Configuración del chat › Temas del chat (tema general de todos los chats). */
export function ChatThemeSettingsCard() {
  const resolved = useResolvedChatTheme(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="lb-cts-card min-w-0 overflow-x-clip rounded-2xl border border-white/[0.08] bg-[#14151c] p-4 sm:p-5">
      <header className="mb-4">
        <h2 className="text-base font-bold text-white">Temas del chat</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Fondo, colores, fuente y burbujas de tus conversaciones. Solo cambia tu vista.
        </p>
      </header>
      <div className="lb-cts-card__body">
        <div className="lb-cts-card__preview">
          <ChatThemePreview resolved={resolved} />
        </div>
        <div className="lb-cts-card__info">
          <p className="text-sm text-zinc-400">Tema actual</p>
          <p className="text-lg font-bold text-white">{resolved.theme.name}</p>
          <p className="mt-1 text-xs text-zinc-500">{resolved.theme.description}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="lb-cts__btn lb-cts__btn--primary mt-4"
          >
            <Palette size={16} />
            Cambiar tema
          </button>
        </div>
      </div>
      <ChatThemeSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
