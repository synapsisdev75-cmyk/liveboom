type SocialLoginButtonsProps = {
  busy: boolean;
  isEs: boolean;
  googleLabel: string;
  onGoogle: () => void;
  onApple: () => void;
};

export function SocialLoginButtons({
  busy,
  isEs,
  googleLabel,
  onGoogle,
  onApple,
}: SocialLoginButtonsProps) {
  return (
    <div className="lb-auth-social">
      <button
        type="button"
        disabled={busy}
        className="lb-auth-social__btn"
        aria-label={googleLabel}
        onClick={onGoogle}
      >
        <GoogleIcon />
        <span>{googleLabel}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        className="lb-auth-social__btn"
        aria-label={isEs ? 'Continuar con Apple' : 'Continue with Apple'}
        onClick={onApple}
      >
        <AppleIcon />
        <span>{isEs ? 'Continuar con Apple' : 'Continue with Apple'}</span>
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.5v2.9h3.8c2.3-2.1 3.6-5.2 3.6-8.5z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.4v3.1C3.4 21.4 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.2 0 10.1 0 12s.5 3.8 1.4 5.5l3.9-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l3.9 3.1C6.2 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.8 2.1 1.1-.1 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1 2.7-2 .8-1.2 1.2-2.3 1.2-2.4-.1 0-2.3-.9-2.3-3.5Zm-2.1-6.2c.6-.8 1.1-1.8.9-2.9-1 .1-2.1.7-2.7 1.5-.6.7-1.1 1.8-.9 2.8 1.1.1 2.1-.5 2.7-1.4Z"
      />
    </svg>
  );
}
