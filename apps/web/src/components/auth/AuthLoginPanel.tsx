import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Mail, UserRound } from 'lucide-react';
import { AuthInput } from './AuthInput';
import { SocialLoginButtons } from './SocialLoginButtons';
import { LegalFooter } from '../legal/LegalFooter';

type AuthLoginPanelProps = {
  mode: 'login' | 'register';
  isEs: boolean;
  busy: boolean;
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
  birthYear: string;
  minBirthYear: number;
  maxBirthYear: number;
  acceptedTerms: boolean;
  localError: string | null;
  storeError: string | null;
  resetNotice: string | null;
  labels: {
    name: string;
    email: string;
    password: string;
    birthYear: string;
    entering: string;
    createAccount: string;
    continue: string;
    or: string;
    google: string;
    hasAccount: string;
    acceptPrefix: string;
    terms: string;
    andTheMasculine: string;
    privacy: string;
    andThe: string;
    cookies: string;
    googleBirthHint: string;
  };
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onTogglePassword: () => void;
  onBirthYear: (v: string) => void;
  onAcceptedTerms: (v: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  onForgotPassword: () => void;
  onGoogle: () => void;
  onApple: () => void;
};

export function AuthLoginPanel({
  mode,
  isEs,
  busy,
  name,
  email,
  password,
  showPassword,
  birthYear,
  minBirthYear,
  maxBirthYear,
  acceptedTerms,
  localError,
  storeError,
  resetNotice,
  labels,
  onName,
  onEmail,
  onPassword,
  onTogglePassword,
  onBirthYear,
  onAcceptedTerms,
  onSubmit,
  onForgotPassword,
  onGoogle,
  onApple,
}: AuthLoginPanelProps) {
  const title =
    mode === 'login'
      ? isEs
        ? 'Iniciar sesión en LiveBoom'
        : 'Sign in to LiveBoom'
      : isEs
        ? 'Crear cuenta en LiveBoom'
        : 'Create your LiveBoom account';

  return (
    <div className="lb-auth-card-wrap">
      <div className="lb-auth-card">
        <span className="lb-auth-card__glow" aria-hidden="true" />
        <span className="lb-auth-card__ray" aria-hidden="true" />
        <img
          src="/assets/auth/logo-liveboom.png"
          alt="LiveBoom"
          className="lb-auth-card__logo"
          width={220}
          height={140}
          decoding="async"
        />
        <h1 className="lb-auth-card__title">{title}</h1>
        <p className="lb-auth-card__subtitle">
          {isEs
            ? 'Tu comunidad de live, regalos y mucho más'
            : 'Your community for live, gifts and more'}
        </p>

        <form className="lb-auth-card__form" onSubmit={onSubmit}>
          {mode === 'register' ? (
            <div className="lb-auth-card__row">
              <AuthInput
                id="lb-auth-name"
                label={labels.name}
                required
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder={labels.name}
                autoComplete="name"
                leading={<UserRound size={18} />}
              />
              <AuthInput
                id="lb-auth-year"
                label={labels.birthYear}
                required
                type="number"
                inputMode="numeric"
                min={minBirthYear}
                max={maxBirthYear}
                value={birthYear}
                onChange={(e) => onBirthYear(e.target.value)}
                placeholder={labels.birthYear}
              />
            </div>
          ) : null}

          <AuthInput
            id="lb-auth-email"
            label={labels.email}
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder={isEs ? 'Correo electrónico' : labels.email}
            leading={<Mail size={18} />}
          />

          <AuthInput
            id="lb-auth-password"
            label={labels.password}
            required
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            placeholder={labels.password}
            leading={<Lock size={18} />}
            trailing={
              <button
                type="button"
                className="lb-auth-field__eye"
                aria-label={
                  showPassword
                    ? isEs
                      ? 'Ocultar contraseña'
                      : 'Hide password'
                    : isEs
                      ? 'Mostrar contraseña'
                      : 'Show password'
                }
                onClick={onTogglePassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          {mode === 'login' ? (
            <button type="button" className="lb-auth-forgot" onClick={onForgotPassword}>
              {isEs ? '¿Olvidaste tu contraseña?' : 'Forgot your password?'}
            </button>
          ) : null}

          {mode === 'register' ? (
            <label className="lb-auth-terms">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => onAcceptedTerms(e.target.checked)}
              />
              <span>
                {labels.acceptPrefix}{' '}
                <Link to="/legal/terminos">{labels.terms}</Link>, {labels.andTheMasculine}{' '}
                <Link to="/legal/privacidad">{labels.privacy}</Link> {labels.andThe}{' '}
                <Link to="/legal/cookies">{labels.cookies}</Link>.
              </span>
            </label>
          ) : null}

          {localError ? (
            <p className="lb-auth-msg lb-auth-msg--error" role="alert">
              {localError}
            </p>
          ) : null}
          {storeError ? (
            <p className="lb-auth-msg lb-auth-msg--error" role="alert">
              {storeError}
            </p>
          ) : null}
          {resetNotice ? (
            <p className="lb-auth-msg lb-auth-msg--ok" role="status">
              {resetNotice}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="lb-auth-cta">
            {busy ? (
              <>
                <Loader2 size={18} className="lb-auth-cta__spin" aria-hidden />
                <span>{labels.entering}</span>
              </>
            ) : mode === 'login' ? (
              isEs ? (
                'Iniciar sesión'
              ) : (
                labels.continue
              )
            ) : (
              labels.createAccount
            )}
          </button>
        </form>

        <div className="lb-auth-divider">
          <span />
          <em>{isEs ? 'o continúa con' : labels.or}</em>
          <span />
        </div>

        <SocialLoginButtons
          busy={busy}
          isEs={isEs}
          googleLabel={isEs ? 'Continuar con Google' : labels.google}
          onGoogle={onGoogle}
          onApple={onApple}
        />

        {mode === 'register' ? <p className="lb-auth-hint">{labels.googleBirthHint}</p> : null}

        {mode === 'login' ? (
          <Link to="/registro" className="lb-auth-create">
            <UserRound size={18} aria-hidden />
            <span>{isEs ? 'Crear cuenta nueva' : labels.createAccount}</span>
          </Link>
        ) : (
          <Link to="/login" className="lb-auth-create">
            <span>{labels.hasAccount}</span>
          </Link>
        )}

        <p className="lb-auth-legal">
          {isEs ? (
            <>
              Al continuar, aceptas nuestros{' '}
              <Link to="/legal/terminos">Términos y condiciones</Link> y la{' '}
              <Link to="/legal/privacidad">Política de privacidad</Link>.
            </>
          ) : (
            <>
              By continuing, you accept our <Link to="/legal/terminos">Terms</Link> and{' '}
              <Link to="/legal/privacidad">Privacy Policy</Link>.
            </>
          )}
        </p>

        <LegalFooter compact />
      </div>
    </div>
  );
}
