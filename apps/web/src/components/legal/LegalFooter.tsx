import { Link } from 'react-router-dom';

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer
      className={`text-center text-xs text-zinc-500 ${compact ? 'mt-4 space-y-1' : 'border-t border-white/10 px-4 py-6'}`}
    >
      <p className={compact ? '' : 'mb-2'}>
        © {new Date().getFullYear()} Liveboom. Todos los derechos reservados.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link to="/legal/terminos" className="hover:text-boom-cyan">
          Términos
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/privacidad" className="hover:text-boom-cyan">
          Privacidad
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/cookies" className="hover:text-boom-cyan">
          Cookies
        </Link>
      </div>
    </footer>
  );
}
