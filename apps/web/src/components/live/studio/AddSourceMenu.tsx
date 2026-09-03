import { Camera, Gamepad2, Image, Layout, Monitor, AppWindow } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick?: (kind: string) => void;
};

const OPTIONS = [
  { id: 'camera', label: 'Cámara', icon: Camera },
  { id: 'screen', label: 'Pantalla', icon: Monitor },
  { id: 'window', label: 'Ventana', icon: AppWindow },
  { id: 'tab', label: 'Pestaña', icon: Layout },
  { id: 'game', label: 'Juego', icon: Gamepad2 },
  { id: 'image', label: 'Imagen', icon: Image },
] as const;

export function AddSourceMenu({ open, onClose, onPick }: Props) {
  if (!open) return null;
  return (
    <div className="lb-live-studio-modal fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12131a] p-4">
        <p className="text-sm font-bold text-white">Agregar fuente</p>
        <ul className="mt-3 grid gap-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick?.(opt.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0f1016] px-3 py-2.5 text-left text-sm font-semibold text-zinc-200 hover:border-cyan-400/30 hover:text-white"
                >
                  <Icon size={18} className="text-cyan-300" />
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-white/10 py-2 text-sm font-semibold text-zinc-400 hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
