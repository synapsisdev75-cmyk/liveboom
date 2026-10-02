import { Loader2, ShieldAlert, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { submitInAppFeedback, type FeedbackCategory } from '../../lib/userReports';
import { useAuthStore } from '../../store/authStore';

const MESSAGE_MAX = 1000;

const CATEGORIES: Array<{ id: FeedbackCategory; label: string }> = [
  { id: 'child_safety', label: 'Seguridad infantil / CSAM' },
  { id: 'abuse', label: 'Acoso o abuso' },
  { id: 'bug', label: 'Error técnico' },
  { id: 'general', label: 'Comentario o sugerencia' },
  { id: 'other', label: 'Otro' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onToast?: (message: string) => void;
};

/**
 * Mecanismo de envío de comentarios / denuncias dentro de la app (sin salir),
 * requerido por la política de estándares de seguridad infantil de Google Play.
 */
export function InAppFeedbackModal({ open, onClose, onToast }: Props) {
  const signedIn = useAuthStore((state) => Boolean(state.firebaseUser || state.profile));
  const [category, setCategory] = useState<FeedbackCategory>('child_safety');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || typeof document === 'undefined') return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!signedIn) {
      setError('Inicia sesión en LiveBoom para enviar este reporte.');
      return;
    }
    const text = message.trim();
    if (!text) {
      setError('Escribe tu mensaje.');
      return;
    }
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await submitInAppFeedback({ category, message: text });
      onToast?.('Mensaje enviado. Gracias por ayudarnos a mantener LiveBoom segura.');
      setMessage('');
      setCategory('child_safety');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      className="lb-chat-report-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lb-inapp-feedback-title"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <form
        className="lb-chat-report lb-inapp-feedback"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id="lb-inapp-feedback-title" className="lb-chat-report-kicker">
              Enviar comentarios
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Reportar un problema</p>
            <p className="mt-1 text-[12px] leading-snug text-zinc-400">
              Envía tu comentario o denuncia de seguridad infantil sin salir de LiveBoom. Nuestro equipo
              revisa cada mensaje.
            </p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar"
            disabled={sending}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-snug text-amber-100">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
          <span>
            Para CSAM o peligros a menores elige «Seguridad infantil / CSAM». También puedes consultar{' '}
            <Link
              to="/legal/seguridad-infantil"
              className="font-semibold text-cyan-300 underline underline-offset-2"
              onClick={onClose}
            >
              nuestros estándares públicos
            </Link>
            .
          </span>
        </div>

        <label className="lb-chat-report-label mt-3" htmlFor="lb-inapp-feedback-category">
          Tipo de mensaje
        </label>
        <select
          id="lb-inapp-feedback-category"
          className="lb-inapp-feedback-select"
          value={category}
          disabled={sending}
          onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
        >
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        <label className="lb-chat-report-label" htmlFor="lb-inapp-feedback-message">
          Tu mensaje
        </label>
        <textarea
          id="lb-inapp-feedback-message"
          className="lb-chat-report-textarea"
          value={message}
          maxLength={MESSAGE_MAX}
          disabled={sending}
          placeholder="Describe el problema, el usuario o el contenido. No reenvíes archivos CSAM: indica dónde está en la app."
          onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
        />
        <p className="lb-chat-report-count">
          {message.length} / {MESSAGE_MAX}
        </p>
        {!signedIn ? (
          <p className="mt-2 text-[12px] leading-snug text-zinc-300">
            <Link to="/login" className="font-semibold text-cyan-300 underline underline-offset-2" onClick={onClose}>
              Inicia sesión
            </Link>{' '}
            dentro de LiveBoom para enviar el reporte. No hace falta salir de la app.
          </p>
        ) : null}
        {error ? <p className="lb-chat-report-error">{error}</p> : null}

        <div className="lb-chat-report-actions">
          <button type="button" className="lb-chat-manage-btn" disabled={sending} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="lb-chat-manage-btn lb-chat-report-send" disabled={sending}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : null}
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
