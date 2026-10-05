import type { LinkPreviewData } from '../../lib/linkPreview';
import { parseLocationUrl } from '../../lib/locationShare';
import { LocationShareCard } from '../location/LocationShareCard';

type Props = {
  preview: LinkPreviewData;
  onDismiss?: () => void;
  compact?: boolean;
};

export function LinkPreviewCard({ preview, onDismiss, compact = false }: Props) {
  const location = parseLocationUrl(preview.url);
  if (location) return <LocationShareCard location={location} onDismiss={onDismiss} compact={compact} />;

  const host =
    preview.siteName ||
    (() => {
      try {
        return new URL(preview.url).hostname.replace(/^www\./, '');
      } catch {
        return 'enlace';
      }
    })();

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`lb-link-preview group relative flex min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/90 text-left shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition hover:border-white/20 ${
        compact ? 'gap-2.5 p-2' : 'gap-3 p-2.5 sm:p-3'
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      {preview.image ? (
        <img
          src={preview.image}
          alt=""
          className={`lb-link-preview__cover shrink-0 rounded-xl object-cover ${
            compact ? 'h-14 w-14' : 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]'
          }`}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span
          className={`grid shrink-0 place-items-center rounded-xl bg-white/5 text-lg ${
            compact ? 'h-14 w-14' : 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]'
          }`}
          aria-hidden
        >
          🔗
        </span>
      )}
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block truncate text-sm font-semibold text-white">
          {preview.title || host}
        </span>
        {preview.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-zinc-400">
            {preview.description}
          </span>
        ) : null}
        <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          {host}
        </span>
      </span>
      {onDismiss ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 grid h-8 w-8 min-h-[2.75rem] min-w-[2.75rem] place-items-center rounded-full bg-black/55 text-zinc-300 opacity-100 transition sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Quitar vista previa"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDismiss();
          }}
        >
          ×
        </button>
      ) : null}
    </a>
  );
}
