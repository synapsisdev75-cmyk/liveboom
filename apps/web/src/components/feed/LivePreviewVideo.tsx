import { Room, RoomEvent, Track } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';

type Props = {
  username: string;
  avatarUrl: string | null;
  displayName: string;
  className?: string;
};

/**
 * Preview de directo en Directos Top (solo visual).
 * Conecta LiveKit para mostrar transmisión en vivo sin registrar espectador:
 * el contador real solo sube en /stream vía useLivePresence.
 */
export function LivePreviewVideo({ username, avatarUrl, displayName, className = '' }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const host = wrapRef.current;
    if (!host) return;

    let cancelled = false;

    function disconnect() {
      connectingRef.current = false;
      void roomRef.current?.disconnect();
      roomRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.pause();
      }
      setHasVideo(false);
    }

    async function connect() {
      if (connectingRef.current || roomRef.current || cancelled || !profile) return;
      const handle = profile.handle;
      connectingRef.current = true;
      try {
        const data = await api<{ token: string; serverUrl: string }>(
          `/api/stream/token/${encodeURIComponent(username)}?handle=${encodeURIComponent(handle)}`,
        );
        if (cancelled || !data.token || !data.serverUrl) return;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (cancelled || track.kind !== Track.Kind.Video || !videoRef.current) return;
          track.attach(videoRef.current);
          setHasVideo(true);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === Track.Kind.Video) {
            track.detach();
            setHasVideo(false);
          }
        });
        await room.connect(data.serverUrl, data.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        roomRef.current = room;
      } catch {
        // Fallback a thumbnail estático.
      } finally {
        connectingRef.current = false;
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          void connect();
        } else {
          disconnect();
        }
      },
      { threshold: [0, 0.35, 0.6] },
    );

    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
      disconnect();
    };
  }, [username, profile?.firebaseUid, profile?.handle]);

  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div ref={wrapRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      {!hasVideo && avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : !hasVideo ? (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-fuchsia-700/40 via-zinc-900 to-cyan-700/30 text-4xl font-black text-white/25">
          {initial}
        </div>
      ) : null}
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover ${hasVideo ? 'opacity-100' : 'opacity-0'}`}
        muted
        autoPlay
        playsInline
      />
    </div>
  );
}
