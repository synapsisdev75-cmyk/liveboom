import { Mic, Play, Plus } from 'lucide-react';
import { chatThemeAttrs, chatThemeStyle } from '../../chatThemes/cssVars';
import type { ResolvedChatTheme } from '../../chatThemes/types';
import { ChatBackgroundRenderer } from './ChatBackgroundRenderer';
import '../../chatThemes/chatThemes.css';

type Props = {
  resolved: ResolvedChatTheme;
  className?: string;
  compact?: boolean;
  orientation?: 'portrait' | 'landscape';
};

const PREVIEW_WAVE = [40, 70, 55, 90, 60, 80, 45, 65, 85, 50, 70, 40, 60, 35];

/** Chat de muestra con las mismas clases del chat real: lo que ves aquí es lo que verás en tus conversaciones. */
export function ChatThemePreview({ resolved, className = '', compact = false, orientation }: Props) {
  return (
    <div
      className={`lb-ctp lb-chat-themed ${className}`}
      style={chatThemeStyle(resolved)}
      {...chatThemeAttrs(resolved)}
      aria-label={`Vista previa: ${resolved.theme.name}`}
      role="img"
    >
      <ChatBackgroundRenderer background={resolved.background} orientation={orientation} />
      <div className="lb-ctp__head">
        <span className="lb-ctp__avatar" aria-hidden>
          S
        </span>
        <span className="min-w-0">
          <span className="lb-ctp__name block truncate">Sofía</span>
          <span className="lb-ctp__status block">En línea</span>
        </span>
      </div>
      <div className="lb-ctp__msgs">
        <div className="lb-ctp__row is-in">
          <div className="lb-chat-bubble is-in">¡Hola! ¿Cómo va el live hoy? 👋</div>
          <span className="lb-ctp__meta lb-chat-meta-time">9:40</span>
        </div>
        <div className="lb-ctp__row is-out">
          <div className="lb-chat-bubble is-out">
            <span className="lb-chat-bubble-reply">
              <span className="lb-chat-bubble-reply__author">Sofía</span>
              <span className="lb-chat-bubble-reply__snippet">¿Cómo va el live hoy?</span>
            </span>
            ¡Increíble! 🚀
          </div>
          <span className="lb-chat-emoji-chips is-out">
            <span className="lb-chat-emoji-chip">❤️ <span className="lb-chat-emoji-chip__n">3</span></span>
          </span>
        </div>
        {!compact ? (
          <div className="lb-ctp__row is-in">
            <div className="lb-chat-bubble is-in">
              <span className="lb-ctp__voice lb-chat-voice">
                <span className="lb-chat-voice__play">
                  <Play size={12} fill="currentColor" />
                </span>
                <span className="lb-chat-voice__track">
                  {PREVIEW_WAVE.map((h, i) => (
                    <span key={i} className={`lb-chat-voice__bar${i < 6 ? ' is-on' : ''}`} style={{ height: `${h}%` }} />
                  ))}
                </span>
                <span className="lb-chat-voice__time text-[10px]">0:15</span>
              </span>
            </div>
          </div>
        ) : null}
        <div className="lb-ctp__row is-out">
          <div className="lb-chat-bubble is-out">Mira esto 👀</div>
          <span className="lb-ctp__meta lb-chat-meta-time">9:42 ✓✓</span>
        </div>
      </div>
      <div className="lb-ctp__composer">
        <span className="lb-chat-plus" aria-hidden>
          <Plus size={16} />
        </span>
        <span className="lb-chat-composer-field">Escribe un mensaje…</span>
        <span className="lb-chat-composer-send" aria-hidden>
          <Mic size={14} />
        </span>
      </div>
    </div>
  );
}
