type Props = {
  localMirror: boolean;
  broadcastMirror?: boolean;
  onLocalChange: (value: boolean) => void;
  onBroadcastChange?: (value: boolean) => void;
  broadcastAvailable?: boolean;
};

export function MirrorSettings({
  localMirror,
  broadcastMirror = false,
  onLocalChange,
  onBroadcastChange,
  broadcastAvailable = false,
}: Props) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#12131a] p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Modo espejo</p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
        <input
          type="checkbox"
          checked={localMirror}
          onChange={(e) => onLocalChange(e.target.checked)}
          className="h-4 w-4 rounded accent-cyan-400"
        />
        Mi vista
      </label>
      <label
        className={`mt-2 flex items-center gap-2 text-sm ${
          broadcastAvailable ? 'cursor-pointer text-zinc-200' : 'text-zinc-500'
        }`}
      >
        <input
          type="checkbox"
          checked={broadcastMirror}
          disabled={!broadcastAvailable}
          onChange={(e) => onBroadcastChange?.(e.target.checked)}
          className="h-4 w-4 rounded accent-cyan-400 disabled:opacity-40"
        />
        También en transmisión
        {!broadcastAvailable ? (
          <span className="text-[10px] text-zinc-600">(próximamente)</span>
        ) : null}
      </label>
    </div>
  );
}
