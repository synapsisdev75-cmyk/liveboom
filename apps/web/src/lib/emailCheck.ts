import { getApiBase } from './api';
import { getLocale } from '../i18n';

export type EmailCheckReason =
  | 'invalid_format'
  | 'typo'
  | 'disposable'
  | 'no_mail_server'
  | 'too_many_requests';

export type EmailCheckResult =
  | { ok: true }
  | { ok: false; reason: EmailCheckReason; suggestion?: string };

/** Valida en el servidor que el dominio reciba correo. Si el servidor no responde, no bloquea: igual se exige verificar el correo. */
export async function checkSignupEmail(email: string): Promise<EmailCheckResult> {
  try {
    const response = await fetch(`${getApiBase()}/api/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: true };
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      reason?: EmailCheckReason;
      suggestion?: string;
    };
    if (data.ok === false && data.reason) {
      return { ok: false, reason: data.reason, suggestion: data.suggestion };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

const MESSAGES: Record<'es' | 'en', Record<EmailCheckReason, string>> = {
  es: {
    invalid_format: 'Ese correo no es válido. Revisa que esté bien escrito.',
    typo: '¿Quisiste decir {suggestion}? Revisa tu correo.',
    disposable: 'No se permiten correos temporales o desechables. Usa tu correo personal.',
    no_mail_server: 'Ese correo no existe: el dominio no recibe correos. Revisa que esté bien escrito.',
    too_many_requests: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  },
  en: {
    invalid_format: 'That email is not valid. Check that it is spelled correctly.',
    typo: 'Did you mean {suggestion}? Check your email.',
    disposable: 'Temporary or disposable emails are not allowed. Use your personal email.',
    no_mail_server: 'That email does not exist: the domain does not receive mail. Check the spelling.',
    too_many_requests: 'Too many attempts. Wait a few minutes and try again.',
  },
};

export function emailCheckMessage(reason: EmailCheckReason, suggestion?: string): string {
  const lang = getLocale() === 'es' ? 'es' : 'en';
  return MESSAGES[lang][reason].replace('{suggestion}', suggestion || '');
}
