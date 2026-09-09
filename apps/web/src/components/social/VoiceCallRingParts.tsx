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
    <div className="lb-voice-ring-wave" aria-hidden>
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
    <div className="lb-voice-out-avatar">
      <span className="lb-voice-out-avatar__ring" aria-hidden />
      <UserAvatar
        src={person.avatar}
        uid={person.uid}
        username={person.handle}
        displayName={person.name}
        size={128}
        ringClassName="ring-0"
      />
      <span className="lb-voice-out-avatar__badge" aria-hidden>
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
  const screen = variant === 'in' ? 'lb-voice-in-screen' : 'lb-voice-out-screen';
  const body = variant === 'in' ? 'lb-voice-in-screen__body' : 'lb-voice-out-screen__body';
  return (
    <article className={`lb-voice-card is-float lb-voice-ring-screen ${screen} is-${variant}`} data-call-kind="voice" data-call-drag>
      <CallWinBar
        showLogo={false}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
        onClose={onClose}
        maximized={maximized}
      />
      <div className={body}>{children}</div>
      {actions}
    </article>
  );
}

export function VoiceCallIdentity({ person, status }: { person: RingPerson; status: string }) {
  const handle = person.handle.replace(/^@/, '');
  return (
    <>
      <VoiceCallAvatar person={person} />
      <p className="lb-voice-out-screen__name">
        <span>{person.name || (handle ? `@${handle}` : 'LiveBoom')}</span>
        <BadgeCheck size={16} className="lb-voice-out-screen__badge" aria-hidden />
      </p>
      {handle ? <p className="lb-voice-out-screen__handle">@{handle}</p> : null}
      <p className="lb-voice-out-screen__type">
        <Phone size={15} aria-hidden />
        Llamada de voz
      </p>
      <p className="lb-voice-out-screen__status" aria-live="polite">
        {status}
      </p>
      <VoiceCallWave />
      <p className="lb-voice-in-screen__quote">Las mejores conexiones se viven en video 💜</p>
    </>
  );
}
