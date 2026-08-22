import { Room, RoomEvent, Track } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Props = {
  streamId: string;
  fallbackUrl: string;
  coverUrl: string;
};

export function LivePlayer({ streamId, fallbackUrl, coverUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [livekit, setLivekit] = useState(false);

  useEffect(() => {
    let room: Room | null = null;
    let cancelled = false;

    void (async () => {
      const data = await api<{ enabled: boolean; token: string | null; url: string | null }>(
        `/api/streams/${streamId}/livekit-token`,
      );
      if (cancelled || !data.enabled || !data.token || !data.url) {
        const el = videoRef.current;
        if (el) {
          el.src = fallbackUrl;
          el.muted = true;
          el.loop = true;
          void el.play().catch(() => undefined);
        }
        return;
      }

      room = new Room();
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setLivekit(true);
        }
      });
      await room.connect(data.url, data.token);
    })();

    return () => {
      cancelled = true;
      void room?.disconnect();
    };
  }, [fallbackUrl, streamId]);

  return (
    <>
      {!livekit ? (
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        autoPlay
        muted
      />
    </>
  );
}
