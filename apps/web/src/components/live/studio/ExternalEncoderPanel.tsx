import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';

type Props = {
  serverUrl?: string | null;
  streamKey?: string | null;
  onRegenerate?: () => void;
};

export function ExternalEncoderPanel({ serverUrl, streamKey, onRegenerate }: Props) {
  const [showKey, setShowKey] = useState(false);
  const hasBackend = Boolean(serverUrl && streamKey);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="lb-live-studio-encoder rounded-2xl border border-white/[0.08] bg-[#12131a] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Streaming Pro</p>
      <p className="mt-1 text-[10px] text-zinc-500">OBS · Codificador externo</p>

      {hasBackend ? (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-[10px] text-zinc-500">Servidor RTMPS</p>
            <div className="mt-1 flex gap-1">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 text-[10px] text-zinc-200">
                {serverUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText(serverUrl!)}
                className="rounded-lg border border-white/10 px-2 text-zinc-300 hover:bg-white/5"
                title="Copiar servidor"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500">Stream Key</p>
            <div className="mt-1 flex gap-1">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2 py-1.5 text-[10px] text-zinc-200">
                {showKey ? streamKey : '••••••••••••••••'}
              </code>
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded-lg border border-white/10 px-2 text-zinc-300 hover:bg-white/5"
                title={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={() => void copyText(streamKey!)}
                className="rounded-lg border border-white/10 px-2 text-zinc-300 hover:bg-white/5"
                title="Copiar clave"
              >
                <Copy size={14} />
              </button>
              {onRegenerate ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="rounded-lg border border-white/10 px-2 text-zinc-300 hover:bg-white/5"
                  title="Regenerar"
                >
                  <RefreshCw size={14} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          Cuando el backend exponga RTMPS y Stream Key, aparecerán aquí para OBS y codificadores
          externos.
        </p>
      )}
    </div>
  );
}
