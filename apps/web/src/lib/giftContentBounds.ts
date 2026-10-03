/**
 * Caja del contenido visible de cada animación (píxeles con alfa ≥ ~10 %, unión de todos los cuadros),
 * en fracción del video: [x, y, ancho, alto]. Los regalos que no aparecen usan el cuadro completo.
 */
const GIFT_CONTENT_BOUNDS: Record<string, readonly [number, number, number, number]> = {
  cristo_redentor: [0, 0, 1, 0.909], // Cristo Redentor
  jet_privado: [0, 0, 1, 0.631], // Jet Privado
  muralla_china: [0, 0.106, 1, 0.894], // Muralla China
  otome_band: [0, 0.02, 1, 0.98], // Otome Band
  regalo_mubvgnu9: [0.248, 0.286, 0.361, 0.52], // Capibarita
  regalo_mubw2r22: [0, 0.343, 1, 0.344], // Ferrari
  regalo_mubwbjrx: [0, 0.019, 1, 0.981], // Fiesta latina
  regalo_mubwl10j: [0, 0, 0.85, 1], // Jaguar bebe
  regalo_mubws6j6: [0, 0.011, 1, 0.989], // Jaguar dorado
  regalo_mubx7gm0: [0, 0.065, 1, 0.889], // Moto del caribe
  regalo_mubxy3fh: [0, 0.024, 1, 0.976], // Sombrero llanero
  regalo_muc1hmst: [0, 0.08, 1, 0.761], // Tucán
  regalo_muc1rtap: [0, 0.109, 1, 0.754], // Piña tropical
  regalo_muc263mp: [0, 0, 1, 0.985], // Flor latina
  regalo_muc2em81: [0, 0, 1, 0.941], // Nuevo regalo
  regalo_muc2rp44: [0, 0, 1, 0.998], // Cafecito
  regalo_muc2wakv: [0, 0, 1, 0.956], // Café colombiano
  regalo_muc2zix1: [0, 0.107, 1, 0.728], // Besos
  regalo_muc98c8i: [0.279, 0.17, 0.428, 0.613], // avion de papel
  regalo_mudato0w: [0.219, 0, 0.514, 1], // bombita traviesa
  taj_mahal: [0, 0, 1, 0.794], // Taj Mahal
};

const FULL_FRAME = [0, 0, 1, 1] as const;
const EDGE = 0.015;
const MARGIN_X = 0.04;
const MARGIN_Y = 0.03;
const MAX_ZOOM = 1.8;

export type GiftImmersiveFit = {
  /** `scale` del slot: alto del stage si el video es vertical, ancho si es horizontal. */
  scale: number;
  anchorX: number;
  anchorY: number;
  /** Bordes donde el contenido toca el cuadro del video (ahí se difumina). */
  fade: { left: boolean; right: boolean; top: boolean; bottom: boolean };
};

/** Tamaño máximo con el que todo el contenido del regalo cabe en el stage, centrado sobre el contenido. */
export function giftImmersiveFit(
  giftId: string | undefined,
  mediaAspect: number,
  stageAspect: number,
): GiftImmersiveFit {
  const [x, y, bw, bh] = (giftId && GIFT_CONTENT_BOUNDS[giftId]) || FULL_FRAME;
  const media = mediaAspect > 0 ? mediaAspect : 9 / 16;
  const stage = stageAspect > 0 ? stageAspect : 16 / 9;
  const videoHeight = Math.min(
    MAX_ZOOM,
    (1 - 2 * MARGIN_Y) / bh,
    (stage * (1 - 2 * MARGIN_X)) / (media * bw),
  );
  return {
    scale: media <= 1 ? videoHeight : (videoHeight * media) / stage,
    anchorX: x + bw / 2,
    anchorY: y + bh / 2,
    fade: {
      left: x < EDGE,
      right: x + bw > 1 - EDGE,
      top: y < EDGE,
      bottom: y + bh > 1 - EDGE,
    },
  };
}
