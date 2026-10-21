type Props = {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
};

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.8 2.1 1.1-.1 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1 2.7-2 .8-1.2 1.2-2.3 1.2-2.4-.1 0-2.3-.9-2.3-3.5Zm-2.1-6.2c.6-.8 1.1-1.8.9-2.9-1 .1-2.1.7-2.7 1.5-.6.7-1.1 1.8-.9 2.8 1.1.1 2.1-.5 2.7-1.4Z"
      />
    </svg>
  );
}

/** Acceso de compra con Apple ID. Solo se usa en iPhone. */
export function AppleIdAccessButton({
  onClick,
  busy = false,
  disabled = false,
  label = 'Continuar con Apple ID',
}: Props) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="lb-apple-id-btn"
      aria-label={label}
    >
      <AppleMark />
      <span>{busy ? 'Abriendo Apple ID…' : label}</span>
    </button>
  );
}
