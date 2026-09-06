import { Camera, Image as ImageIcon, Upload, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type CaptureSource = 'CAMERA' | 'GALLERY' | 'FILE';

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (source: CaptureSource) => void;
  placement: 'sheet' | 'popover';
  anchor?: DOMRect | null;
};

const OPTIONS: Array<{ id: CaptureSource; label: string; Icon: typeof Camera }> = [
  { id: 'CAMERA', label: 'Tomar foto', Icon: Camera },
  { id: 'GALLERY', label: 'Agregar desde galería', Icon: ImageIcon },
  { id: 'FILE', label: 'Importar archivo', Icon: Upload },
];

export function CaptureSourceMenu({ open, onClose, onSelect, placement, anchor }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const popoverStyle =
    placement === 'popover' && anchor
      ? {
          position: 'fixed' as const,
          left: Math.min(anchor.left, window.innerWidth - 240),
          bottom: Math.max(12, window.innerHeight - anchor.top + 8),
        }
      : undefined;

  return createPortal(
    <div className="lb-recon-source" data-placement={placement} onClick={onClose} role="presentation">
      <div
        className={`lb-recon-source__panel ${placement === 'sheet' ? 'is-sheet' : 'is-popover'}`}
        style={popoverStyle}
        role="menu"
        aria-label="Origen de captura"
        onClick={(event) => event.stopPropagation()}
      >
        {placement === 'sheet' ? (
          <header className="lb-recon-source__head">
            <p>Agregar fotografía</p>
            <button type="button" className="lb-recon3d-iconbtn" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </header>
        ) : null}
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="lb-recon-source__item"
            onClick={() => {
              onSelect(id);
              onClose();
            }}
          >
            <span>
              <Icon size={18} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
