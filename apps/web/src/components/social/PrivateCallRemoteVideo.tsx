import { useRoomContext } from '@livekit/components-react';
import { RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { UserAvatar } from '../profile/UserAvatar';

function pickRemoteVideo(room: ReturnType<typeof useRoomContext>): RemoteTrack | null {
  try {
    let camera: RemoteTrack | null = null;
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.videoTrackPublications.values()) {
        const track = pub.track;
        if (!track) continue;
        if (pub.source === Track.Source.ScreenShare) return track;
        if (pub.source === Track.Source.Camera && !camera) camera = track;
      }
    }
    return camera;
  } catch {
    return null;
  }
}

/** Video remoto de llamada privada. No usa VideoTrack/useTracks de LiveKit. */
export function PrivateCallRemoteVideo({
  name,
  handle,
  avatar,
  peerUid,
  waitingLabel,
}: {
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  waitingLabel: string;
}) {
  const room = useRoomContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachedRef = useRef<RemoteTrack | null>(null);
  const [hasRemote, setHasRemote] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.autoplay = true;
    el.muted = true;

    function detach() {
      const current = attachedRef.current;
      if (current && el) {
        try {
          current.detach(el);
        } catch {
          /* ignore */
        }
      }
      attachedRef.current = null;
      if (el) el.srcObject = null;
      setHasRemote(false);
    }

    function attach() {
      const next = pickRemoteVideo(room);
      if (!next || !el) {
        if (attachedRef.current) detach();
        return;
      }
    if (attachedRef.current === next) {
      setHasRemote(true);
      void el.play().then(
        () => console.info('[VIDEO CALL] remote video attached'),
        (error) => console.warn('[VIDEO CALL] remote play() failed', error),
      );
      return;
    }
      if (attachedRef.current) {
        try {
          attachedRef.current.detach(el);
        } catch {
          /* ignore */
        }
      }
      attachedRef.current = next;
      try {
        next.attach(el);
        setHasRemote(true);
        console.info('[VIDEO CALL] remote track subscribed', {
          kind: next.kind,
          source: next.source,
        });
        const stream = el.srcObject instanceof MediaStream ? el.srcObject : null;
        console.info('[REMOTE MEDIA]', {
          participant: [...room.remoteParticipants.values()][0]?.identity || null,
          videoTrack: true,
          audioTrack: [...room.remoteParticipants.values()].some((p) =>
            [...p.audioTrackPublications.values()].some((pub) => Boolean(pub.track)),
          ),
          stream: Boolean(stream),
        });
        void el.play().then(
          () => console.info('[VIDEO CALL] remote video attached'),
          (error) => console.warn('[VIDEO CALL] remote play() failed', error),
        );
      } catch {
        detach();
      }
    }

    attach();
    room.on(RoomEvent.Connected, attach);
    room.on(RoomEvent.TrackSubscribed, attach);
    room.on(RoomEvent.TrackUnsubscribed, attach);
    room.on(RoomEvent.TrackMuted, attach);
    room.on(RoomEvent.TrackUnmuted, attach);
    room.on(RoomEvent.ParticipantConnected, attach);
    room.on(RoomEvent.ParticipantDisconnected, attach);
    return () => {
      room.off(RoomEvent.Connected, attach);
      room.off(RoomEvent.TrackSubscribed, attach);
      room.off(RoomEvent.TrackUnsubscribed, attach);
      room.off(RoomEvent.TrackMuted, attach);
      room.off(RoomEvent.TrackUnmuted, attach);
      room.off(RoomEvent.ParticipantConnected, attach);
      room.off(RoomEvent.ParticipantDisconnected, attach);
      detach();
    };
  }, [room]);

  return (
    <div className="lb-call-video-remote">
      <video
        ref={videoRef}
        className={`lb-private-call-remote-video${hasRemote ? '' : ' is-idle'}`}
        playsInline
        muted
        autoPlay
      />
      {hasRemote ? null : (
        <div className="lb-call-video-wait">
          <UserAvatar
            src={avatar || null}
            uid={peerUid}
            username={handle}
            displayName={name}
            size={96}
            ringClassName="ring-0"
          />
          <p>{name || (handle ? `@${handle}` : 'LiveBoom')}</p>
          <p>{waitingLabel}</p>
        </div>
      )}
    </div>
  );
}
