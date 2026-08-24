import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import {
  FACE_LANDMARK,
  getFaceGiftProp,
  type FaceGiftProp,
} from '../../lib/faceGiftAnchors';
import { findLiveGift, GIFT_LEVEL_FX } from '../../lib/liveboomGifts';

type ActiveFaceGift = {
  id: string;
  giftId: string;
  endsAt: number;
};

type Props = {
  /** Contenedor del video LiveKit (busca el <video> hijo). */
  containerRef: React.RefObject<HTMLElement | null>;
  active: ActiveFaceGift | null;
};

type Pose = {
  x: number;
  y: number;
  size: number;
  rotate: number;
  prop: FaceGiftProp;
};

const MP_VERSION = '0.10.21';
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
      );
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      } catch (err) {
        console.warn('[FaceMesh] GPU falló, reintentando CPU', err);
        return FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      }
    })();
  }
  return landmarkerPromise;
}

function videoIsMirrored(video: HTMLVideoElement) {
  const style = getComputedStyle(video);
  return /matrix\(\s*-1/.test(style.transform) || video.className.includes('mirror');
}

function landmarkPose(face: NormalizedLandmark[], prop: FaceGiftProp, mirrored: boolean): Pose | null {
  const left = face[FACE_LANDMARK.leftTemple];
  const right = face[FACE_LANDMARK.rightTemple];
  const forehead = face[FACE_LANDMARK.forehead];
  const foreheadTop = face[FACE_LANDMARK.foreheadTop];
  const lip = face[FACE_LANDMARK.upperLip];
  if (!left || !right || !forehead) return null;

  const faceW = Math.hypot(right.x - left.x, right.y - left.y);
  const midX = (left.x + right.x) / 2;
  const angle = Math.atan2(right.y - left.y, right.x - left.x) * (180 / Math.PI);

  let cx = midX;
  let cy = forehead.y;
  if (prop.anchor === 'hat' || prop.anchor === 'crown') {
    cy = (foreheadTop?.y ?? forehead.y) + prop.offsetY * faceW;
    cx = midX;
  } else if (prop.anchor === 'kiss') {
    cy = (lip?.y ?? forehead.y) + prop.offsetY * faceW;
    cx = lip?.x ?? midX;
  } else if (prop.anchor === 'glasses') {
    const le = face[FACE_LANDMARK.leftEyeOuter];
    const re = face[FACE_LANDMARK.rightEyeOuter];
    cx = ((le?.x ?? left.x) + (re?.x ?? right.x)) / 2;
    cy = ((le?.y ?? left.y) + (re?.y ?? right.y)) / 2;
  } else {
    cy = forehead.y + prop.offsetY * faceW;
  }

  if (mirrored) cx = 1 - cx;

  return {
    x: cx * 100,
    y: cy * 100,
    size: Math.max(28, faceW * 100 * prop.scale * 1.15),
    rotate: mirrored ? -angle : angle,
    prop,
  };
}

/**
 * Overlay MediaPipe Face Mesh (468 landmarks): ancla sombreros/coronas/besos
 * a frente y sienes cuando llega un regalo face-anchored en el live.
 */
export function FaceMeshGiftOverlay({ containerRef, active }: Props) {
  const [pose, setPose] = useState<Pose | null>(null);
  const [ready, setReady] = useState(false);
  const rafRef = useRef(0);
  const lastTs = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    void getFaceLandmarker()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        console.error('[FaceMesh] no se pudo cargar', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !active) {
      setPose(null);
      return;
    }
    const prop = getFaceGiftProp(active.giftId);
    if (!prop) {
      setPose(null);
      return;
    }

    let running = true;
    const tick = async () => {
      if (!running) return;
      if (Date.now() > active.endsAt) {
        setPose(null);
        return;
      }
      const video = containerRef.current?.querySelector('video');
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const landmarker = await getFaceLandmarker();
          const now = performance.now();
          if (now > lastTs.current) {
            lastTs.current = now;
            const result = landmarker.detectForVideo(video, now);
            const face = result.faceLandmarks?.[0];
            if (face?.length) {
              const next = landmarkPose(face, prop, videoIsMirrored(video));
              if (next) setPose(next);
            }
          }
        } catch {
          // frame skip
        }
      }
      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
    };
    void tick();
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [ready, active, containerRef]);

  if (!active || !pose) return null;

  const gift = findLiveGift(active.giftId);
  const remaining = Math.max(0, active.endsAt - Date.now());
  const total = (gift ? GIFT_LEVEL_FX[gift.level].duration : 3) * 1000;
  const opacity = Math.min(1, remaining / Math.max(400, total * 0.15));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div
        className="absolute origin-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] transition-[opacity] duration-150"
        style={{
          left: `${pose.x}%`,
          top: `${pose.y}%`,
          fontSize: `${pose.size}px`,
          lineHeight: 1,
          transform: `translate(-50%, -50%) rotate(${pose.rotate}deg)`,
          opacity,
          filter: 'drop-shadow(0 0 12px rgba(255,220,120,0.55))',
        }}
      >
        {pose.prop.emoji}
      </div>
    </div>
  );
}

export type { ActiveFaceGift };
