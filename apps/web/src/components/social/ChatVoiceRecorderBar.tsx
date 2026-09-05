import { Mic, Send, X } from 'lucide-react';

type Props = {
  elapsedSec: number;
  levels: number[];
  sending?: boolean;
  onCancel: () => void;
  onSend: () => void;
};

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ChatVoiceRecorderBar({ elapsedSec, levels, sending, onCancel, onSend }: Props) {
  return (
    <div className="lb-chat-record" role="status" aria-live="polite">
      <button
        type="button"
        className="lb-chat-record-cancel"
        onClick={onCancel}
        disabled={sending}
        aria-label="Cancelar grabación"
      >
        <X size={16} />
      </button>
      <span className="lb-chat-record-dot" aria-hidden />
      <span className="lb-chat-record-timer">{formatClock(elapsedSec)}</span>
      <span className="lb-chat-record-label">Grabando</span>
      <div className="lb-chat-wave" aria-hidden>
        {levels.map((level, index) => (
          <span key={index} style={{ height: `${Math.round(18 + level * 70)}%` }} />
        ))}
      </div>
      <button
        type="button"
        className="lb-chat-record-send"
        onClick={onSend}
        disabled={sending}
        aria-label="Enviar audio"
      >
        {sending ? <Mic size={16} /> : <Send size={16} />}
      </button>
    </div>
  );
}
