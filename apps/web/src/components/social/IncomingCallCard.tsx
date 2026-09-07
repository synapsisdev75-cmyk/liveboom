import { Phone, PhoneOff, Video } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';
import { useT } from '../../i18n';
import { CallWinBar } from './FloatingCallFrame';

type Props = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
  video: boolean;
  accepting?: boolean;
  error?: string | null;
  rateBlasts?: number;
  giftName?: string | null;
  giftEmoji?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
};

export function IncomingCallCard({
  name,
  handle,
  avatar,
  uid,
  video,
  accepting,
  error,
  rateBlasts = 0,
  giftName,
  giftEmoji,
  onAccept,
  onDecline,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: Props) {
  const t = useT();
  const title = name || (handle ? `@${handle}` : 'LiveBoom');
  const kind = video ? 'Videollamada' : 'Llamada de voz';
  const paid = video && rateBlasts > 0;
  const handleText = handle.replace(/^@/, '');

  return (
    <article className="lb-call-incoming is-float">
      <div className="lb-call-incoming__glow" aria-hidden />
      <CallWinBar
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
      />
      <div className="lb-call-incoming__body">
        <div className="lb-call-incoming__person">
          <div className="lb-call-avatar-wrap">
            <span className="lb-call-avatar-ring" aria-hidden />
            <UserAvatar
              src={avatar}
              uid={uid}
              username={handle}
              displayName={name}
              size={88}
              ringClassName="ring-0"
            />
          </div>
          <h2 className="lb-call-incoming__name">{title}</h2>
          {handleText ? <p className="lb-call-incoming__handle">@{handleText}</p> : null}
          <p className="lb-call-incoming__kind">{paid ? 'Videollamada paga' : kind}</p>
          <p className="lb-call-incoming__status">Te está llamando...</p>
          {paid ? (
            <p className="lb-video-rate-pill">
              <span>{giftEmoji || '🎁'}</span>
              {giftName || 'Regalo'} · {rateBlasts} Blasts / minuto
            </p>
          ) : null}
          {error ? <p className="lb-call-incoming__error">{error}</p> : null}
          {accepting ? <p className="lb-call-incoming__kind">Conectando llamada...</p> : null}
        </div>
      </div>

      <div className="lb-call-incoming__actions is-float">
        <button
          type="button"
          className="lb-call-accept-pill"
          onClick={onAccept}
          aria-label={video ? t('common.accept') : t('actions.reply')}
          disabled={accepting}
        >
          {video ? <Video size={18} /> : <Phone size={18} />}
          {t('common.accept')}
        </button>
        <button
          type="button"
          className="lb-call-round lb-call-round--decline"
          onClick={onDecline}
          aria-label={t('common.reject')}
          disabled={accepting}
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </article>
  );
}
