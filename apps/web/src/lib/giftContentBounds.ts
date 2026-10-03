/**
 * Ficha de diseño de cada animación, medida cuadro a cuadro sobre el canal alfa:
 * [x, y, ancho, alto] del contenido visible (fracción del video) y sus bordes.
 * Bordes (t r b l): mayúscula = el contenido sale cortado del video por ahí,
 * `!` = corte sólido y constante, minúscula = solo llegan partículas/brillos.
 * Los regalos que no aparecen se tratan como cortados en los cuatro lados.
 */
const GIFT_DESIGN: Record<string, readonly [number, number, number, number, string]> = {
  chichen_itza: [0, 0, 1, 1, 'trbL!'], // Chichén Itzá
  coliseo: [0, 0, 1, 1, 'tR!bL!'], // Coliseo
  cristo_redentor: [0, 0, 1, 0.909, 'tRl'], // Cristo Redentor
  guaracha: [0, 0, 1, 1, 'tRbL'], // Guaracha
  jet_privado: [0, 0, 1, 0.631, 'T!rl'], // Jet Privado
  locomotora: [0, 0, 1, 1, 'TRB!L!'], // Locomotora
  machu_picchu: [0, 0, 1, 1, 'trbl'], // Machu Picchu
  merengue: [0, 0, 1, 1, 'tRbL'], // Merengue
  muralla_china: [0, 0.106, 1, 0.894, 'R!B!L!'], // Muralla China
  norteno: [0, 0, 1, 1, 'tR!bL!'], // Norteño
  otome_band: [0, 0.02, 1, 0.98, 'rbl'], // Otome Band
  petra: [0, 0, 1, 1, 'TR!bL!'], // Petra
  regalo_mubuauzf: [0, 0, 1, 1, 'T!R!BL!'], // Botas llaneras
  regalo_mubusmeo: [0, 0, 1, 1, 'T!R!B!L!'], // cafecito
  regalo_mubvgnu9: [0.248, 0.286, 0.361, 0.52, ''], // Capibarita
  regalo_mubvv77q: [0, 0, 1, 1, 'tR!B!l'], // Chiva colombiana
  regalo_mubw2r22: [0, 0.343, 1, 0.344, 'rl'], // Ferrari
  regalo_mubwbjrx: [0, 0.019, 1, 0.981, 'R!bL!'], // Fiesta latina
  regalo_mubwl10j: [0, 0, 0.85, 1, 'TBl'], // Jaguar bebe
  regalo_mubws6j6: [0, 0.011, 1, 0.989, 'trB!L!'], // Jaguar dorado
  regalo_mubx7gm0: [0, 0.065, 1, 0.889, 'R!L!'], // Moto del caribe
  regalo_mubxomc1: [0, 0, 1, 1, 'T!R!B!L!'], // parranda
  regalo_mubxy3fh: [0, 0.024, 1, 0.976, 'rbl'], // Sombrero llanero
  regalo_muby1ux2: [0, 0, 1, 1, 'tR!bL!'], // Tambores
  regalo_muc06hks: [0, 0, 1, 1, 'T!R!BL!'], // Dios de live
  regalo_muc0r8tg: [0, 0, 1, 1, 'tR!B!L!'], // Helicóptero
  regalo_muc0zned: [0, 0, 1, 1, 'T!R!B!L!'], // Reina del live
  regalo_muc1b7jd: [0, 0, 1, 1, 'T!R!B!L!'], // Yate
  regalo_muc1hmst: [0, 0.08, 1, 0.761, 'R!L!'], // Tucán
  regalo_muc1oyiz: [0, 0, 1, 1, 'T!R!B!L!'], // Sombrero vueltiao
  regalo_muc1rtap: [0, 0.109, 1, 0.754, 'rl'], // Piña tropical
  regalo_muc1vtry: [0, 0, 1, 1, 'tR!bL!'], // Maracas
  regalo_muc20t06: [0, 0, 1, 1, 'TrBl'], // Guacamaya
  regalo_muc263mp: [0, 0, 1, 0.985, 'tR!L!'], // Flor latina
  regalo_muc2b5ag: [0, 0, 1, 1, 'T!R!B!L!'], // Empanada
  regalo_muc2em81: [0, 0, 1, 0.941, 'trl'], // Nuevo regalo
  regalo_muc2jffl: [0, 0, 1, 1, 'T!R!B!L!'], // Corazon latino
  regalo_muc2ohgy: [0, 0, 1, 1, 'tR!bL!'], // Coco tropical
  regalo_muc2rp44: [0, 0, 1, 0.998, 'T!R!bL!'], // Cafecito
  regalo_muc2wakv: [0, 0, 1, 0.956, 'tR!L'], // Café colombiano
  regalo_muc2zix1: [0, 0.107, 1, 0.728, 'R!L!'], // Besos
  regalo_muc326wp: [0, 0, 1, 1, 'tR!bL!'], // Jaguar imperial
  regalo_muc329w2: [0, 0, 1, 1, 'T!R!B!L!'], // Arepita
  regalo_muc36u8z: [0, 0, 1, 1, 'T!R!B!L!'], // Arepa venezolana
  regalo_muc3awq5: [0, 0, 1, 1, 'T!R!B!L!'], // Aguacate
  regalo_muc629hi: [0, 0, 1, 1, 'T!R!bL!'], // Dragon dorado
  regalo_muc6q3sb: [0, 0, 1, 1, 'TR!B!L!'], // Universo Boom
  regalo_muc98c8i: [0.279, 0.17, 0.428, 0.613, ''], // avion de papel
  regalo_mudato0w: [0.219, 0, 0.514, 1, 'tb'], // bombita traviesa
  regalo_mudaz5gw: [0, 0, 1, 1, 'T!R!B!L!'], // Diamante latino
  regalo_muouswt4: [0, 0, 1, 1, 'trbl'], // torre ifell
  rock_legends: [0, 0, 1, 1, 'T!RB!L!'], // Rock Legends
  salsa_fiesta: [0, 0, 1, 1, 'T!R!B!L!'], // banda salsa
  taj_mahal: [0, 0, 1, 0.794, 'T!R!l'], // Taj Mahal
  vallenato: [0, 0, 1, 1, 'T!R!B!L!'], // Vallenato
};

const UNKNOWN_DESIGN = [0, 0, 1, 1, 'T!R!B!L!'] as const;
const MARGIN_X = 0.04;
const MARGIN_Y = 0.03;
const MAX_ZOOM = 1.8;
/** Sobremedida mínima para que un corte pegado al borde del stage nunca deje una línea de 1px. */
const OVERSCAN = 1.006;
const FADE_CUT = { x: 18, y: 12 };
const FADE_SOFT = { x: 8, y: 6 };

type Edge = 't' | 'r' | 'b' | 'l';

export type GiftImmersiveFit = {
  /** `scale` del slot: alto del stage si el video es vertical, ancho si es horizontal. */
  scale: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  /** Difuminado por borde, en % del video. */
  fade: Record<Edge, number>;
};

/**
 * Coloca el regalo según su diseño: los bordes donde la animación sale cortada se apoyan en el
 * borde del stage (el corte desaparece con la pantalla); los que quedan dentro se difuminan.
 */
export function giftImmersiveFit(
  giftId: string | undefined,
  mediaAspect: number,
  stageAspect: number,
): GiftImmersiveFit {
  const [bx, by, bw, bh, code] = (giftId && GIFT_DESIGN[giftId]) || UNKNOWN_DESIGN;
  const media = mediaAspect > 0 ? mediaAspect : 9 / 16;
  const stage = stageAspect > 0 ? stageAspect : 16 / 9;
  const cut = (e: Edge) => code.includes(e.toUpperCase());
  const strong = (e: Edge) => code.includes(`${e.toUpperCase()}!`);
  const soft = (e: Edge) => code.includes(e);

  const vMode = cut('t') && cut('b') ? 'both' : cut('t') ? 'top' : cut('b') ? 'bottom' : 'center';
  const hMode =
    cut('l') && cut('r')
      ? 'both'
      : cut('l') && strong('l')
        ? 'left'
        : cut('r') && strong('r')
          ? 'right'
          : 'center';

  // Alto del video en unidades del alto del stage.
  const vFill = 1 / bh;
  const vLimit = vMode === 'both' ? vFill : vMode === 'center' ? (1 - 2 * MARGIN_Y) / bh : (1 - MARGIN_Y) / bh;
  const hFill = stage / (media * bw);
  const hLimit =
    hMode === 'both' ? hFill : hMode === 'center' ? (stage * (1 - 2 * MARGIN_X)) / (media * bw) : (stage * (1 - MARGIN_X)) / (media * bw);
  let videoHeight = Math.min(MAX_ZOOM, vLimit, hLimit);

  const vFlushBoth = vMode === 'both' && videoHeight >= vFill - 1e-6;
  const hFlushBoth = hMode === 'both' && videoHeight >= hFill - 1e-6;
  if (vFlushBoth || hFlushBoth) videoHeight *= OVERSCAN;

  const flush: Record<Edge, boolean> = {
    t: vFlushBoth || vMode === 'top',
    b: vFlushBoth || vMode === 'bottom',
    l: hFlushBoth || hMode === 'left',
    r: hFlushBoth || hMode === 'right',
  };

  const y = vMode === 'top' ? 0 : vMode === 'bottom' ? 100 : 50;
  const anchorY = vMode === 'top' ? by : vMode === 'bottom' ? by + bh : by + bh / 2;
  const x = hMode === 'left' ? 0 : hMode === 'right' ? 100 : 50;
  const anchorX = hMode === 'left' ? bx : hMode === 'right' ? bx + bw : bx + bw / 2;

  const fadeFor = (e: Edge): number => {
    if (flush[e]) return 0;
    const axis = e === 'l' || e === 'r' ? 'x' : 'y';
    if (cut(e)) return FADE_CUT[axis];
    if (soft(e)) return FADE_SOFT[axis];
    return 0;
  };

  return {
    scale: media <= 1 ? videoHeight : (videoHeight * media) / stage,
    x,
    y,
    anchorX,
    anchorY,
    fade: { t: fadeFor('t'), r: fadeFor('r'), b: fadeFor('b'), l: fadeFor('l') },
  };
}
