import type { CSSProperties } from 'react';
import { classifyVideoOrientation, type VideoOrientation } from './videoAspect';

/** Explorar / Flash Boom: rail fijo al lado para horizontal y cuadrado (sin scroll interno). */
export function usesImmersiveAsideRail(
  mediaWidth: number,
  mediaHeight: number,
  immersiveLandscapeLayout: boolean,
): boolean {
  if (!immersiveLandscapeLayout || mediaWidth <= 0 || mediaHeight <= 0) return false;
  return classifyVideoOrientation(mediaWidth, mediaHeight) !== 'portrait';
}

export type ImmersiveLayoutInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Espacio reservado para action rail (se superpone en móvil). */
  actionRail: number;
};

export type ImmersiveMediaBox = {
  width: number;
  height: number;
  orientation: VideoOrientation;
};

const DEFAULT_INSETS: ImmersiveLayoutInsets = {
  top: 56,
  bottom: 120,
  left: 8,
  right: 8,
  actionRail: 56,
};

/** Calcula el tamaño óptimo del media en visor inmersivo según orientación real del archivo. */
export function computeImmersiveMediaBox(
  mediaWidth: number,
  mediaHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  insets: Partial<ImmersiveLayoutInsets> = {},
  desktop = false,
  railAside = false,
): ImmersiveMediaBox {
  const pad = { ...DEFAULT_INSETS, ...insets };
  const orientation = classifyVideoOrientation(mediaWidth, mediaHeight);
  const ratio = mediaWidth > 0 && mediaHeight > 0 ? mediaWidth / mediaHeight : 9 / 16;

  const railReserve =
    railAside && orientation !== 'portrait' ? Math.max(56, pad.actionRail) + 8 : 0;
  const availW = Math.max(160, viewportWidth - pad.left - pad.right - railReserve);
  const availH = Math.max(200, viewportHeight - pad.top - pad.bottom);

  let width = availW;
  let height = width / ratio;

  if (orientation === 'portrait') {
    height = availH;
    width = height * ratio;
    if (width > availW) {
      width = availW;
      height = width / ratio;
    }
    if (desktop) {
      const maxPortraitW = Math.min(480, availW * 0.42, 36 * 16);
      if (width > maxPortraitW) {
        width = maxPortraitW;
        height = width / ratio;
      }
    }
  } else if (orientation === 'landscape') {
    width = availW;
    height = width / ratio;
    if (height > availH) {
      height = availH;
      width = height * ratio;
    }
    if (desktop) {
      const maxLandscapeW = Math.min(availW * 0.88, 1280);
      if (width > maxLandscapeW) {
        width = maxLandscapeW;
        height = width / ratio;
      }
    }
  } else {
    if (railAside) {
      width = availW;
      height = width / ratio;
      if (height > availH) {
        height = availH;
        width = height * ratio;
      }
      if (desktop) {
        const maxSquareW = Math.min(availW * 0.88, 720);
        if (width > maxSquareW) {
          width = maxSquareW;
          height = width / ratio;
        }
      }
    } else {
      const side = Math.min(availW, availH);
      width = side;
      height = side;
      if (desktop && width > 560) {
        width = 560;
        height = 560;
      }
    }
  }

  return {
    width: Math.round(Math.max(120, width)),
    height: Math.round(Math.max(120, height)),
    orientation,
  };
}

export function immersiveMediaBoxStyle(box: ImmersiveMediaBox): CSSProperties {
  return {
    width: `${box.width}px`,
    height: `${box.height}px`,
    maxWidth: '100%',
    maxHeight: '100%',
  };
}
