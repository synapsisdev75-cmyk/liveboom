import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useLiveChatAuthorProfile } from '../../hooks/useLiveChatAuthorProfile';
import { db } from '../../lib/firebase';
import { roomKey } from '../../lib/roomKey';
import { resolveUserAvatar } from '../../lib/userAvatar';
import { LevelAvatarFrame } from '../profile/LevelAvatarFrame';

type Props = {
  uid?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  className?: string;
};

/** Foto + marco de nivel, pensado como fondo difuminado del LIVE privado. */
export function LiveHostFrameBackdrop({ uid, username, avatarUrl, className = '' }: Props) {
  const [roomHost, setRoomHost] = useState<{ uid: string; avatarUrl: string | null }>({
    uid: String(uid || '').trim(),
    avatarUrl: resolveUserAvatar(avatarUrl),
  });

  useEffect(() => {
    const givenUid = String(uid || '').trim();
    if (givenUid) {
      setRoomHost({ uid: givenUid, avatarUrl: resolveUserAvatar(avatarUrl) });
      return;
    }
    const room = username ? roomKey(username) : '';
    if (!room) return;
    return onSnapshot(
      doc(db, 'liveRooms', room),
      (snap) => {
        const data = snap.data() || {};
        setRoomHost({
          uid: String(data.hostUid || '').trim(),
          avatarUrl: resolveUserAvatar(data.avatarUrl) || resolveUserAvatar(avatarUrl),
        });
      },
      () => undefined,
    );
  }, [uid, username, avatarUrl]);

  const remote = useLiveChatAuthorProfile(roomHost.uid || null, {
    avatarUrl: roomHost.avatarUrl,
  });
  const photo = resolveUserAvatar(remote.avatarUrl) || roomHost.avatarUrl;
  const letter = String(username || '?').replace(/^@/, '');

  return (
    <div className={`lb-live-host-frame-backdrop ${className}`} aria-hidden>
      <LevelAvatarFrame
        levelXp={remote.levelXp}
        avatarUrl={photo}
        fallbackLetter={letter}
        size="2xl"
        className="lb-live-host-frame-backdrop__frame"
      />
    </div>
  );
}
