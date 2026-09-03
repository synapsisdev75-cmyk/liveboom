import type { DeepAR } from 'deepar';
import { LocalVideoTrack, Room, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  applyCallFilter,
  createCallDeepAR,
  type CallFilterId,
} from '../../../lib/deepar';

type Args = {
  enabled: boolean;
  room: Room;
  cameraTrackRef: MutableRefObject<LocalVideoTrack | null>;
  facing: 'user' | 'environment';
  onFacingChange?: (facing: 'user' | 'environment') => void;
};

/**
 * DeepAR en la cámara del host durante LIVE.
 * Al recibir un regalo AR, publica el canvas filtrado por LiveKit para que lo vean todos.
 */
export function useHostLiveDeepAr({
  enabled,
  room,
  cameraTrackRef,
  facing,
  onFacingChange,
}: Args) {
  const deepArRef = useRef<DeepAR | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const arTrackRef = useRef<LocalVideoTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clearTimerRef = useRef(0);
  const facingRef = useRef(facing);
  facingRef.current = facing;
  const [activeFilter, setActiveFilter] = useState<CallFilterId | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const shutdown = useCallback(async () => {
    window.clearTimeout(clearTimerRef.current);
    const arTrack = arTrackRef.current;
    arTrackRef.current = null;
    if (arTrack) {
      try {
        await room.localParticipant.unpublishTrack(arTrack);
      } catch {
        // ignore
      }
      arTrack.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const instance = deepArRef.current;
    deepArRef.current = null;
    if (instance) {
      try {
        instance.stopCamera();
        instance.shutdown();
      } catch {
        // ignore
      }
    }
    if (previewRef.current) previewRef.current.innerHTML = '';
    setActiveFilter(null);
  }, [room]);

  useEffect(() => {
    if (enabled) return;
    void shutdown();
  }, [enabled, shutdown]);

  useEffect(() => {
    return () => {
      void shutdown();
    };
  }, [shutdown]);

  const ensurePreviewHost = () => {
    if (previewRef.current && document.body.contains(previewRef.current)) {
      return previewRef.current;
    }
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;width:405px;height:720px;opacity:0;pointer-events:none;overflow:hidden;';
    document.body.appendChild(host);
    previewRef.current = host;
    return host;
  };

  const ensureDeepAr = useCallback(async () => {
    if (deepArRef.current && arTrackRef.current) return deepArRef.current;
    const host = ensurePreviewHost();
    const nativeAlert = window.alert;
    window.alert = () => undefined;
    let instance: DeepAR;
    try {
      instance = await createCallDeepAR(host, facingRef.current);
    } finally {
      window.alert = nativeAlert;
    }
    await instance.startCamera({
      mirror: facingRef.current === 'user',
      mediaStreamConstraints: {
        video: {
          facingMode: facingRef.current,
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
      },
    });

    // Sustituye la cámara LiveKit por el canvas DeepAR (espectadores ven el filtro).
    const existing = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (item) => item.source === Track.Source.Camera,
    );
    if (existing?.track) {
      try {
        await room.localParticipant.unpublishTrack(existing.track);
        existing.track.stop();
      } catch {
        // ignore
      }
    }
    await room.localParticipant.setCameraEnabled(false).catch(() => undefined);

    const canvas = instance.getCanvas();
    const stream = canvas.captureStream(24);
    streamRef.current = stream;
    const mediaTrack = stream.getVideoTracks()[0];
    if (!mediaTrack) throw new Error('Sin track DeepAR');
    const localTrack = new LocalVideoTrack(mediaTrack, undefined, true);
    arTrackRef.current = localTrack;
    cameraTrackRef.current = localTrack;
    await room.localParticipant.publishTrack(localTrack, {
      source: Track.Source.Camera,
      name: 'camera-ar',
    });
    deepArRef.current = instance;
    return instance;
  }, [room, cameraTrackRef]);

  const applyFilter = useCallback(
    async (filterId: Exclude<CallFilterId, 'none'>, durationSec: number) => {
      if (!enabled) return;
      setBusy(true);
      setNote(null);
      try {
        const instance = await ensureDeepAr();
        await applyCallFilter(instance, filterId);
        setActiveFilter(filterId);
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = window.setTimeout(() => {
          void applyCallFilter(instance, 'none')
            .then(() => setActiveFilter(null))
            .catch(() => setActiveFilter(null));
        }, Math.max(1.5, durationSec) * 1000);
      } catch (error) {
        console.error('[live] DeepAR gift', error);
        setNote('No se pudo aplicar el filtro AR en este dispositivo/dominio.');
      } finally {
        setBusy(false);
      }
    },
    [enabled, ensureDeepAr],
  );

  const flipFacing = useCallback(async () => {
    const instance = deepArRef.current;
    if (!instance || !arTrackRef.current) return false;
    const next: 'user' | 'environment' = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      await instance.startCamera({
        mirror: next === 'user',
        mediaStreamConstraints: {
          video: {
            facingMode: next,
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        },
      });
      onFacingChange?.(next);
      return true;
    } catch (error) {
      console.error('[live] DeepAR flip', error);
      return false;
    }
  }, [onFacingChange]);

  return {
    applyFilter,
    flipFacing,
    activeFilter,
    busy,
    note,
    isUsingDeepAr: Boolean(arTrackRef.current),
  };
}
