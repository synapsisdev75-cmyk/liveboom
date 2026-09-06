import { createPortal } from 'react-dom';

export type CallBusyKind = 'peer' | 'self' | 'creator';

export function CallBusySheet({
  kind,
  handle,
  onDismiss,
  onMessage,
  onReturn,
}: {
  kind: CallBusyKind;
  handle?: string | null;
  onDismiss: () => void;
  onMessage?: () => void;
  onReturn?: () => void;
}) {
  const tag = handle ? `@${handle.replace(/^@/, '')}` : 'Esta persona';
  const title =
    kind === 'self'
      ? 'Ya tienes una llamada en curso.'
      : kind === 'creator'
        ? `${tag} está en otra llamada en este momento.`
        : `${tag} está ocupado en otra llamada.`;
  const subtitle = kind === 'self' ? 'Termina o vuelve a esa llamada para continuar.' : 'Intenta nuevamente cuando termine.';

  const node = (
    <div className="lb-call-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="lb-call-busy-title">
      <div className="lb-call-confirm lb-call-busy">
        <p id="lb-call-busy-title" className="text-sm font-bold text-white">
          {title}
        </p>
        <p className="lb-call-busy-sub">{subtitle}</p>
        <div className="mt-4 flex flex-col gap-2">
          {kind === 'self' ? (
            <button type="button" className="lb-call-busy-btn lb-call-busy-btn--primary" onClick={onReturn || onDismiss}>
              Volver a la llamada
            </button>
          ) : (
            <>
              <button type="button" className="lb-call-busy-btn lb-call-busy-btn--primary" onClick={onDismiss}>
                Entendido
              </button>
              {onMessage ? (
                <button type="button" className="lb-call-busy-btn lb-call-busy-btn--ghost" onClick={onMessage}>
                  Enviar mensaje
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
