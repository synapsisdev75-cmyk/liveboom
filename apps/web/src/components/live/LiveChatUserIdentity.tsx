import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveChatAuthorProfile } from '../../hooks/useLiveChatAuthorProfile';
import { getUserLevelStyle, LIVE_CHAT_DEFAULT_AVATAR } from '../../lib/liveChatLevelStyle';
import { profileHref } from '../../lib/profileFirestore';
import { resolveUserAvatar } from '../../lib/userAvatar';
import { useAuthStore } from '../../store/authStore';

type Layout = 'stack' | 'inline';

type Props = {
  author: string;
  authorUid?: string | null;
  layout?: Layout;
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
};

function LiveChatAvatar({
  src,
  borderColor,
  glow,
  premium,
}: {
  src: string;
  borderColor: string;
  glow: string;
  premium: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = failed === src ? LIVE_CHAT_DEFAULT_AVATAR : src;

  return (
    <span
      className="lb-live-chat-msg__avatar lb-live-chat-identity__avatar"
      style={{
        borderColor,
        boxShadow: premium ? `0 0 8px ${glow}` : `0 0 5px ${glow}`,
      }}
      aria-hidden
    >
      <img
        src={photo}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => {
          if (photo !== LIVE_CHAT_DEFAULT_AVATAR) setFailed(src);
        }}
      />
    </span>
  );
}

export function LiveChatUserIdentity({
  author,
  authorUid,
  layout = 'stack',
  trailing,
  children,
  className = '',
}: Props) {
  const me = useAuthStore((state) => state.profile);
  const uid = String(authorUid || '').trim();
  const isMe = Boolean(uid && me?.firebaseUid === uid);
  const seed = isMe
    ? {
        avatarUrl: me?.avatarUrl ?? null,
        ...(typeof me?.levelXp === 'number' ? { levelXp: me.levelXp } : {}),
      }
    : undefined;
  const remote = useLiveChatAuthorProfile(uid || null, seed);
  const avatarUrl =
    resolveUserAvatar(isMe ? me?.avatarUrl : null) ||
    resolveUserAvatar(remote.avatarUrl);
  const levelXp = Math.max(Number(remote.levelXp || 0), isMe ? Number(me?.levelXp ?? 0) : 0);
  const style = getUserLevelStyle(levelXp);
  const photo = avatarUrl || LIVE_CHAT_DEFAULT_AVATAR;
  const href = uid ? profileHref(author, uid) : null;
  const nameClass = 'lb-live-chat-identity__user font-semibold hover:underline';
  const nameStyle =
    style.slug === 'pro'
      ? {
          backgroundImage: 'linear-gradient(90deg, #fcd34d, #e879f9, #00f0ff)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
        }
      : { color: style.usernameColor };

  const nameNode = href ? (
    <Link to={href} className={nameClass} style={nameStyle}>
      {author}
    </Link>
  ) : (
    <span className={nameClass} style={nameStyle}>
      {author}
    </span>
  );

  const badge = (
    <span
      className="lb-live-chat-identity__badge"
      style={{
        background: style.badgeStyle.background,
        borderColor: style.badgeStyle.border,
        color: style.badgeStyle.color,
      }}
      title={style.title}
    >
      <img src={style.badgeImage} alt="" className="lb-live-chat-identity__badge-icon" draggable={false} />
      {style.title}
    </span>
  );

  const avatar = (
    <LiveChatAvatar
      src={photo}
      borderColor={style.avatarBorder}
      glow={style.glow}
      premium={style.premium}
    />
  );

  if (layout === 'inline') {
    return (
      <span className={`lb-live-chat-identity lb-live-chat-identity--inline ${className}`}>
        {avatar}
        <span className="lb-live-chat-identity__meta min-w-0">
          <span className="lb-live-chat-msg__name">
            {nameNode}
            {badge}
            {trailing}
          </span>
          {children}
        </span>
      </span>
    );
  }

  return (
    <>
      {avatar}
      <div className={`lb-live-chat-msg__copy min-w-0 text-sm text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${className}`}>
        <span className="lb-live-chat-msg__name">
          {nameNode}
          {badge}
          {trailing}
        </span>
        {children}
      </div>
    </>
  );
}
