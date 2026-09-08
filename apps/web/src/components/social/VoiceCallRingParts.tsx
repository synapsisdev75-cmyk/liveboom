import type { ReactNode } from 'react';
import { BadgeCheck, Phone } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';
import { CallWinBar } from './FloatingCallFrame';

export type RingPerson = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

export function VoiceCallWave() {
  return (
    <div className="lb-video-ring-wave" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function VoiceCallAvatar({ person }: { person: RingPerson }) {
  return (
    <div className="lb-video-ring-avatar">
      <span className="lb-video-ring-avatar__halo" aria-hidden />
      <UserAvatar
        src={person.avatar}
        uid={person.uid}
        username={person.handle}
        displayName={person.name}
        size={128}
        ringClassName="ring-0"
      />
      <span className="lb-video-ring-avatar__badge is-voice" aria-hidden>
        <Phone size={14} />
      </span>
    </div>
  );
}

export function VoiceCallFrame({
  children,
  actions,
  variant,
  onMinimize,
  onMaximize,
  onClose,
  maximized,
}: {
  children: ReactNode;
  actions: ReactNode;
  variant: 'in' | 'out';
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  maximized?: boolean;
}) {
  return (
    <article className={`lb-video-ring-screen is-voice is-${variant}`} data-call-drag>
      <CallWinBar
        showLogo={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
      />
      <div className="lb-video-ring-screen__body">{children}</div>
      {actions}
    </article>
  );
}

export function VoiceCallIdentity({ person, status }: { person: RingPerson; status: string }) {
  const handle = person.handle.replace(/^@/, '');
  return (
    <>
      <VoiceCallAvatar person={person} />
      <p className="lb-video-ring-screen__name">
        <span>{person.name || (handle ? `@${handle}` : 'LiveBoom')}</span>
        <BadgeCheck size={16} className="lb-video-ring-screen__badge" aria-hidden />
      </p>
      {handle ? <p className="lb-video-ring-screen__handle">@{handle}</p> : null}
      <p className="lb-video-ring-screen__type">
        <Phone size={15} aria-hidden />
        Llamada de voz
      </p>
      <p className="lb-video-ring-screen__status" aria-live="polite">
        {status}
      </p>
      <VoiceCallWave />
      <p className="lb-video-ring-screen__quote">Las mejores conexiones se viven en video 💜</p>
    </>
  );
}
