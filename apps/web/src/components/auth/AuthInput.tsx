import type { InputHTMLAttributes, ReactNode } from 'react';

type AuthInputProps = {
  id: string;
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export function AuthInput({ id, label, leading, trailing, ...inputProps }: AuthInputProps) {
  return (
    <div className="lb-auth-field">
      <label htmlFor={id} className="lb-auth-sr-only">
        {label}
      </label>
      {leading ? <span className="lb-auth-field__icon" aria-hidden>{leading}</span> : null}
      <input id={id} className="lb-auth-field__control" {...inputProps} />
      {trailing}
    </div>
  );
}
