import { Camera, Plus } from 'lucide-react';
import {
  COVER_ASPECT,
  COVER_HEIGHT,
  COVER_SAFE_HEIGHT,
  COVER_SAFE_WIDTH,
  COVER_WIDTH,
  type CoverMediaKind,
} from '../../lib/profileCover';

type Props = {
  url?: string | null;
  type?: CoverMediaKind | null;
  isOwner?: boolean;
  onEdit?: () => void;
};

export function ProfileCoverBanner({ url, type, isOwner, onEdit }: Props) {
  const src = String(url || '').trim();
  const motion = type === 'video' || type === 'gif' || /\.(mp4|webm|gif)(\?|$)/i.test(src);

  return (
    <div className={`lb-profile-cover${src ? '' : ' is-empty'}`}>
      {src ? (
        motion && type !== 'gif' ? (
          <video
            className="lb-profile-cover__media"
            src={src}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img className="lb-profile-cover__media" src={src} alt="" />
        )
      ) : (
        <div className="lb-profile-cover__placeholder">
          {isOwner ? (
            <div className="lb-profile-cover__empty">
              <div className="lb-profile-cover__safe" aria-hidden />
              <p className="lb-profile-cover__empty-title">Dale identidad a tu perfil</p>
              <p className="lb-profile-cover__empty-lead">Agrega una foto, GIF o video de portada.</p>
              <ul className="lb-profile-cover__empty-specs">
                <li>
                  {COVER_WIDTH} × {COVER_HEIGHT} px
                </li>
                <li>Proporción {COVER_ASPECT.toFixed(2).replace('.', ',')}:1</li>
                <li>Foto: JPG, PNG o WebP</li>
                <li>GIF animado</li>
                <li>Video: MP4 o WebM</li>
              </ul>
              <p className="lb-profile-cover__empty-safe">
                Zona segura recomendada: {COVER_SAFE_WIDTH} × {COVER_SAFE_HEIGHT} px centrados.
              </p>
              <button type="button" className="lb-profile-cover__add" onClick={onEdit}>
                <Plus size={16} strokeWidth={2.4} />
                Agregar portada
              </button>
            </div>
          ) : null}
        </div>
      )}
      {isOwner && src ? (
        <button
          type="button"
          className="lb-profile-cover__edit"
          onClick={onEdit}
          aria-label="Cambiar portada"
          title="Cambiar portada"
        >
          <Camera size={16} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}
