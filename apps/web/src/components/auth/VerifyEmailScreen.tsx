import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { BrandBackground } from './BrandBackground';
import { BrandVideo } from './BrandVideo';
import { LanguageDropdown } from '../i18n/LanguageDropdown';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

const COPY = {
  es: {
    title: 'Verifica tu correo',
    body: 'Te enviamos un enlace de verificación a',
    hint: 'Abre el correo y toca el enlace para activar tu cuenta. Si no lo ves, revisa Spam o Promociones.',
    verified: 'Ya verifiqué mi correo',
    checking: 'Comprobando…',
    notYet: 'Aún no aparece verificado. Abre el enlace del correo y vuelve a intentarlo.',
    resend: 'Reenviar correo',
    resendIn: 'Reenviar en {s} s',
    resent: 'Correo reenviado.',
    other: 'Usar otro correo',
  },
  en: {
    title: 'Verify your email',
    body: 'We sent a verification link to',
    hint: 'Open the email and tap the link to activate your account. If you do not see it, check Spam or Promotions.',
    verified: 'I already verified my email',
    checking: 'Checking…',
    notYet: 'It is not verified yet. Open the link in the email and try again.',
    resend: 'Resend email',
    resendIn: 'Resend in {s} s',
    resent: 'Email resent.',
    other: 'Use another email',
  },
};

const RESEND_COOLDOWN_S = 60;

export function VerifyEmailScreen() {
  const t = useT();
  const copy = COPY[t.locale === 'es' ? 'es' : 'en'];
  const user = useAuthStore((s) => s.pendingVerifyUser);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const resend = useAuthStore((s) => s.resendVerificationEmail);
  const refresh = useAuthStore((s) => s.refreshEmailVerification);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function onCheck() {
    setChecking(true);
    setNotice(null);
    const ok = await refresh();
    setChecking(false);
    if (!ok) setNotice(copy.notYet);
  }

  async function onResend() {
    setNotice(null);
    try {
      await resend();
      setNotice(copy.resent);
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      /* el error queda en el store */
    }
  }

  return (
    <div className="lb-auth-page">
      <BrandBackground />
      <div className="lb-auth-lang">
        <LanguageDropdown />
      </div>
      <header className="lb-auth-top">
        <div className="lb-auth-top__logo">
          <BrandVideo />
        </div>
      </header>

      <div className="lb-auth-main">
        <div className="w-full max-w-md">
          <div className="lb-auth-card rounded-3xl border border-white/10 bg-boom-panel/88 p-6 text-center shadow-glow backdrop-blur-xl sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-boom-cyan">
              <MailCheck size={28} aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-white sm:text-2xl">{copy.title}</h1>
            <p className="mt-3 text-sm text-zinc-400">{copy.body}</p>
            <p className="mt-1 break-all text-sm font-semibold text-white">{user?.email}</p>
            <p className="mt-3 text-xs text-zinc-500">{copy.hint}</p>

            {notice ? <p className="mt-4 text-sm text-cyan-300">{notice}</p> : null}
            {error ? <p className="mt-4 text-sm text-boom-fuchsia">{error}</p> : null}

            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={checking}
                onClick={() => void onCheck()}
                className="h-11 w-full rounded-xl bg-gradient-to-r from-boom-cyan to-boom-orange text-sm font-bold text-zinc-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {checking ? copy.checking : copy.verified}
              </button>
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => void onResend()}
                className="h-11 w-full rounded-xl bg-white/10 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-60"
              >
                {cooldown > 0 ? copy.resendIn.replace('{s}', String(cooldown)) : copy.resend}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-11 w-full text-sm text-zinc-400 hover:text-white"
              >
                {copy.other}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
