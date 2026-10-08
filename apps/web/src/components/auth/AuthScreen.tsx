import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { BrandBackground } from './BrandBackground';
import { AuthVisualStage } from './AuthVisualStage';
import { AuthLoginPanel } from './AuthLoginPanel';
import { LanguageDropdown } from '../i18n/LanguageDropdown';
import { ageFromBirthYear } from '../../lib/birthDate';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

const currentYear = new Date().getFullYear();
const minBirthYear = currentYear - 100;
const maxBirthYear = currentYear - 18;

/**
 * Pantalla de acceso LiveBoom.
 * Reutiliza authStore (Firebase email/Google/Apple) — no crea un segundo sistema.
 */
export function AuthScreen() {
  const t = useT();
  const location = useLocation();
  const mode: 'login' | 'register' = location.pathname.startsWith('/registro') ? 'register' : 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [birthYear, setBirthYear] = useState(String(maxBirthYear));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const signInEmail = useAuthStore((s) => s.signInEmail);
  const signUpEmail = useAuthStore((s) => s.signUpEmail);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);
  const signInApple = useAuthStore((s) => s.signInApple);
  const isEs = t.locale === 'es';

  function socialBirthYear(): number | undefined | null {
    if (mode !== 'register') return undefined;
    if (!acceptedTerms) {
      setLocalError(t('auth.mustAccept'));
      return null;
    }
    const year = Number(birthYear);
    if (!Number.isFinite(year) || year < minBirthYear || year > maxBirthYear) {
      setLocalError(t('auth.invalidBirthYear'));
      return null;
    }
    if (ageFromBirthYear(year) < 18) {
      setLocalError(t('auth.mustBe18'));
      return null;
    }
    return year;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setResetNotice(null);
    if (mode === 'register' && !acceptedTerms) {
      setLocalError(t('auth.mustAccept'));
      return;
    }
    if (mode === 'login') {
      await signInEmail(email, password).catch(() => undefined);
      return;
    }
    const year = Number(birthYear);
    if (!Number.isFinite(year) || year < minBirthYear || year > maxBirthYear) {
      setLocalError(t('auth.invalidBirthYear'));
      return;
    }
    if (ageFromBirthYear(year) < 18) {
      setLocalError(t('auth.mustBe18'));
      return;
    }
    await signUpEmail(name, email, password, year).catch(() => undefined);
  }

  async function onForgotPassword() {
    setLocalError(null);
    setResetNotice(null);
    const value = email.trim();
    if (!value) {
      setLocalError(isEs ? 'Escribe tu correo para recuperar la contraseña.' : 'Enter your email to reset your password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, value);
      setResetNotice(
        isEs
          ? 'Te enviamos un enlace para restablecer la contraseña.'
          : 'We sent you a password reset link.',
      );
    } catch {
      setLocalError(isEs ? 'No se pudo enviar el correo. Revisa el email.' : 'Could not send the email. Check the address.');
    }
  }

  async function onGoogle() {
    setLocalError(null);
    setResetNotice(null);
    if (mode === 'register') {
      const year = socialBirthYear();
      if (year === null) return;
      await signInGoogle(year).catch(() => undefined);
      return;
    }
    await signInGoogle().catch(() => undefined);
  }

  async function onApple() {
    setLocalError(null);
    setResetNotice(null);
    if (mode === 'register') {
      const year = socialBirthYear();
      if (year === null) return;
      await signInApple(year).catch(() => undefined);
      return;
    }
    await signInApple().catch(() => undefined);
  }

  return (
    <div className="lb-auth-page">
      <BrandBackground />
      <div className="lb-auth-lang">
        <LanguageDropdown />
      </div>

      <div className="lb-auth-shell">
        <AuthVisualStage isEs={isEs} />

        <div className="lb-auth-main">
          <header className="lb-auth-top lb-auth-top--mobile">
            <img
              src="/assets/auth/logo-liveboom.png"
              alt="LiveBoom"
              className="lb-auth-mobile-logo"
              width={280}
              height={180}
              decoding="async"
            />
          </header>

          <AuthLoginPanel
            mode={mode}
            isEs={isEs}
            busy={busy}
            name={name}
            email={email}
            password={password}
            showPassword={showPassword}
            birthYear={birthYear}
            minBirthYear={minBirthYear}
            maxBirthYear={maxBirthYear}
            acceptedTerms={acceptedTerms}
            localError={localError}
            storeError={error}
            resetNotice={resetNotice}
            labels={{
              name: t('auth.name'),
              email: t('auth.email'),
              password: t('auth.password'),
              birthYear: t('auth.birthYear'),
              entering: t('auth.entering'),
              createAccount: t('auth.createAccount'),
              continue: t('auth.continue'),
              or: t('auth.or'),
              google: t('auth.google'),
              hasAccount: t('auth.hasAccount'),
              acceptPrefix: t('auth.acceptPrefix'),
              terms: t('auth.terms'),
              andTheMasculine: t('auth.andTheMasculine'),
              privacy: t('auth.privacy'),
              andThe: t('auth.andThe'),
              cookies: t('auth.cookies'),
              googleBirthHint: t('auth.googleBirthHint'),
            }}
            onName={setName}
            onEmail={setEmail}
            onPassword={setPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
            onBirthYear={setBirthYear}
            onAcceptedTerms={setAcceptedTerms}
            onSubmit={(event) => void onSubmit(event)}
            onForgotPassword={() => void onForgotPassword()}
            onGoogle={() => void onGoogle()}
            onApple={() => void onApple()}
          />
        </div>
      </div>
    </div>
  );
}
