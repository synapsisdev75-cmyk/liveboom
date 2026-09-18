import { useAuthStore } from '../../store/authStore';
import { useLiveChatAuthorProfile } from '../../hooks/useLiveChatAuthorProfile';
import { getUserLevelStyle } from '../../lib/liveChatLevelStyle';
import { resolveUserAvatar } from '../../lib/userAvatar';
import { LevelAvatarFrame } from '../profile/LevelAvatarFrame';

type Props = {
  uid: string;
  username: string;
  displayName?: string;
  canKick?: boolean;
  kicking?: boolean;
  onKick?: () => void;
};

export function LiveViewerListRow({
  uid,
  username,
  displayName,
  canKick = false,
  kicking = false,
  onKick,
}: Props) {
  const me = useAuthStore((state) => state.profile);
  const isMe = Boolean(uid && me?.firebaseUid === uid);
  const seed = isMe
    ? {
        avatarUrl: me?.avatarUrl ?? null,
        ...(typeof me?.levelXp === 'number' ? { levelXp: me.levelXp } : {}),
      }
    : undefined;
  const remote = useLiveChatAuthorProfile(uid || null, seed);
  const avatarUrl =
    resolveUserAvatar(isMe ? me?.avatarUrl : null) || resolveUserAvatar(remote.avatarUrl);
  const levelXp = Math.max(Number(remote.levelXp || 0), isMe ? Number(me?.levelXp ?? 0) : 0);
  const style = getUserLevelStyle(levelXp);
  const handle = (username || displayName || uid).replace(/^@/, '');
  const nameStyle =
    style.slug === 'pro'
      ? {
          backgroundImage: 'linear-gradient(90deg, #fcd34d, #e879f9, #00f0ff)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        }
      : { color: style.usernameColor };

  return (
    <li className="lb-live-viewers-row">
      <LevelAvatarFrame
        levelXp={levelXp}
        avatarUrl={avatarUrl}
        fallbackLetter={handle}
        size="xs"
        className="lb-live-viewers-row__frame"
      />
      <div className="lb-live-viewers-row__meta">
        <span className="lb-live-viewers-row__name" style={nameStyle}>
          @{handle}
        </span>
        <span
          className="lb-live-viewers-row__badge"
          style={{
            background: style.badgeStyle.background,
            borderColor: style.badgeStyle.border,
            color: style.badgeStyle.color,
          }}
          title={style.title}
        >
          <img src={style.badgeImage} alt="" draggable={false} />
          {style.title}
        </span>
      </div>
      {canKick ? (
        <button
          type="button"
          disabled={kicking}
          className="lb-live-viewers-row__kick"
          onClick={onKick}
        >
          {kicking ? '…' : 'Expulsar'}
        </button>
      ) : null}
    </li>
  );
}
