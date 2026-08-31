import { useEffect, useState, type CSSProperties } from 'react';

export type VideoOrientation = 'portrait' | 'landscape' | 'square';

/** Clasifica orientación a partir de dimensiones intrínsecas del video. */
export function classifyVideoOrientation(width: number, height: number): VideoOrientation {
  if (width <= 0 || height <= 0) return 'portrait';
  const ratio = width / height;
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.1) return 'landscape';
  return 'square';
}

export function videoAspectClass(orientation: VideoOrientation): string {
  switch (orientation) {
    case 'portrait':
      return 'aspect-[9/16]';
    case 'landscape':
      return 'aspect-video';
    case 'square':
      return 'aspect-square';
  }
}

export function videoMaxWidthClass(orientation: VideoOrientation): string {
  switch (orientation) {
    case 'portrait':
      return 'max-w-[min(100%,22.5rem)]';
    case 'landscape':
      return 'max-w-full';
    case 'square':
      return 'max-w-[min(100%,24rem)]';
  }
}

export function videoAspectStyle(width: number, height: number): CSSProperties {
  if (width > 0 && height > 0) return { aspectRatio: `${width} / ${height}` };
  return { aspectRatio: '9 / 16' };
}

export function applyVideoDimensions(width: number, height: number) {
  const orientation = classifyVideoOrientation(width, height);
  return {
    orientation,
    aspectClass: videoAspectClass(orientation),
    maxWidthClass: videoMaxWidthClass(orientation),
    aspectStyle: videoAspectStyle(width, height),
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
    isSquare: orientation === 'square',
  };
}

type VideoAspectState = ReturnType<typeof applyVideoDimensions> & {
  width: number;
  height: number;
  isReady: boolean;
};

const PORTRAIT_FALLBACK = applyVideoDimensions(9, 16);

/** Lee metadata del video para adaptar contenedor (vertical 9:16 vs horizontal 16:9). */
export function useVideoAspect(src: string | null | undefined): VideoAspectState {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!src) {
      setSize(null);
      return;
    }

    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const onMetadata = () => {
      if (cancelled) return;
      const { videoWidth, videoHeight } = video;
      if (videoWidth > 0 && videoHeight > 0) {
        setSize({ width: videoWidth, height: videoHeight });
      }
    };

    const onError = () => {
      if (!cancelled) setSize(null);
    };

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('error', onError);
    video.src = src;

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  if (!size) {
    return {
      ...PORTRAIT_FALLBACK,
      width: 0,
      height: 0,
      isReady: false,
    };
  }

  return {
    width: size.width,
    height: size.height,
    isReady: true,
    ...applyVideoDimensions(size.width, size.height),
  };
}
