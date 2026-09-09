import { useMaybeRoomContext } from '@livekit/components-react';
import { RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

function pickRemoteVideo(room: NonNullable<ReturnType<typeof useMaybeRoomContext>>): RemoteTrack | null {
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

/** Video remoto de llamada privada. El <video> queda montado y visible; sin avatar encima. */
export function PrivateCallRemoteVideo({
  waitingLabel: _waitingLabel,
}: {
  name?: string;
  handle?: string;
  avatar?: string | null;
  peerUid?: string;
  waitingLabel: string;
}) {
  const room = useMaybeRoomContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachedRef = useRef<RemoteTrack | null>(null);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      console.warn('[VIDEO CALL] remoteVideoRef.current is null');
      return;
    }
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.autoplay = true;
    el.muted = true;
    console.info('[VIDEO CALL] remote video mounted', { hasRoom: Boolean(room) });
  }, [room]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    function markRemoteReady() {
      if (!el) return;
      void el.play().catch((error) => console.warn('[VIDEO CALL] remote play() failed', error));
    }

    function cameraIsOff(track: RemoteTrack | null) {
      const media = track?.mediaStreamTrack;
      if (!media) return false;
      return media.readyState === 'ended' || media.enabled === false;
    }

    function attach() {
      const liveRoom = room;
      if (!liveRoom || !el) return;
      const next = pickRemoteVideo(liveRoom);
      if (!next) {
        if (attachedRef.current) {
          try {
            attachedRef.current.detach(el);
          } catch {
            /* keep element mounted */
          }
          attachedRef.current = null;
        }
        setCameraOff(false);
        return;
      }
      if (cameraIsOff(next)) {
        setCameraOff(true);
        console.info('[CALL] remote camera off', { callId: liveRoom.name || null });
        return;
      }
      setCameraOff(false);
      if (attachedRef.current === next) {
        if (!el.srcObject && next.mediaStreamTrack) {
          el.srcObject = new MediaStream([next.mediaStreamTrack]);
        }
        void el.play().then(markRemoteReady, (error) => console.warn('[VIDEO CALL] remote play() failed', error));
        markRemoteReady();
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
        if (!el.srcObject && next.mediaStreamTrack) {
          el.srcObject = new MediaStream([next.mediaStreamTrack]);
        }
        const stream = el.srcObject instanceof MediaStream ? el.srcObject : null;
        console.info('[CALL] remote track received', {
          kind: next.kind,
          source: next.source,
          readyState: next.mediaStreamTrack?.readyState || null,
          videoTracks: stream?.getVideoTracks().length ?? 0,
          srcObject: Boolean(el.srcObject),
        });
        console.info('[REMOTE MEDIA]', {
          participant: [...liveRoom.remoteParticipants.values()][0]?.identity || null,
          videoTrack: true,
          audioTrack: [...liveRoom.remoteParticipants.values()].some((p) =>
            [...p.audioTrackPublications.values()].some((pub) => Boolean(pub.track)),
          ),
          stream: Boolean(stream),
        });
        el.onloadeddata = markRemoteReady;
        el.onplaying = markRemoteReady;
        void el.play().then(markRemoteReady, (error) => console.warn('[VIDEO CALL] remote play() failed', error));
        markRemoteReady();
      } catch (error) {
        console.warn('[VIDEO CALL] remote attach failed', error);
        if (next.mediaStreamTrack) {
          el.srcObject = new MediaStream([next.mediaStreamTrack]);
          void el.play().then(markRemoteReady, () => undefined);
          markRemoteReady();
        }
      }
    }

    if (!room) return;

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
      if (el) {
        el.onloadeddata = null;
        el.onplaying = null;
      }
    };
  }, [room]);

  useEffect(() => {
    const el = videoRef.current;
    return () => {
      const current = attachedRef.current;
      attachedRef.current = null;
      if (current && el) {
        try {
          current.detach(el);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return (
    <div className="lb-call-video-remote">
      <video
        ref={videoRef}
        className="lb-private-call-remote-video"
        playsInline
        muted
        autoPlay
      />
      {cameraOff ? (
        <p className="lb-call-video-caption">Cámara apagada</p>
      ) : null}
    </div>
  );
}
