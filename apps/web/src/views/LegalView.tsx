import { Link, Navigate, useParams } from 'react-router-dom';
import { Logo } from '../components/brand/Logo';
import { getLegalDoc, LEGAL_DOCS } from '../content/legal';

export function LegalView() {
  const { slug } = useParams();
  const doc = slug ? getLegalDoc(slug) : null;

  if (!doc) {
    return <Navigate to="/legal/terminos" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-boom-bg text-white">
      <header className="border-b border-white/10 bg-boom-panel/80 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link to="/">
            <Logo />
          </Link>
          <Link to="/login" className="text-sm font-medium text-boom-cyan hover:underline">
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-boom-cyan">Legal</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-zinc-400">Última actualización: {doc.updated}</p>

        <nav className="mt-6 flex flex-wrap gap-2">
          {LEGAL_DOCS.map((item) => (
            <Link
              key={item.slug}
              to={`/legal/${item.slug}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                item.slug === doc.slug
                  ? 'bg-boom-cyan/15 text-boom-cyan ring-boom-cyan/40'
                  : 'text-zinc-400 ring-white/10 hover:text-white'
              }`}
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <article className="prose-invert mt-8 space-y-6">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{section.body}</p>
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
