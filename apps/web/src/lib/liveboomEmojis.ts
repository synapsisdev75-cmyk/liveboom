/** Set básico LiveBoom — 5×10 desde assets/emojis/source-sheet.jpg */

/** Tamaños inline al mostrar emoticones enviados */
export const SENT_EMOJI_SIZE = 30;
export const SENT_EMOJI_SIZE_COMPACT = 28;
export const CHAT_EMOJI_SIZE = 28;
export const POST_EMOJI_SIZE = 26;

/** Comentarios de video (alias de enviados) */
export const COMMENT_EMOJI_SIZE = SENT_EMOJI_SIZE;
export const COMMENT_EMOJI_SIZE_COMPACT = SENT_EMOJI_SIZE_COMPACT;

export type LiveboomEmoji = {
  id: string;
  label: string;
  file: string;
};

export const LIVEBOOM_EMOJIS: LiveboomEmoji[] = [
  { id: 'grin', label: 'Sonrisa', file: '/emojis/grin.png' },
  { id: 'laugh', label: 'Risa', file: '/emojis/laugh.png' },
  { id: 'big_grin', label: 'Gran sonrisa', file: '/emojis/big_grin.png' },
  { id: 'teeth_grin', label: 'Dientes', file: '/emojis/teeth_grin.png' },
  { id: 'sweat_smile', label: 'Sudor', file: '/emojis/sweat_smile.png' },
  { id: 'joy_tears', label: 'Lágrimas de alegría', file: '/emojis/joy_tears.png' },
  { id: 'rofl', label: 'Rodando de risa', file: '/emojis/rofl.png' },
  { id: 'blush', label: 'Rubor', file: '/emojis/blush.png' },
  { id: 'wink', label: 'Guiño', file: '/emojis/wink.png' },
  { id: 'smile', label: 'Feliz', file: '/emojis/smile.png' },
  { id: 'peaceful', label: 'Tranquilo', file: '/emojis/peaceful.png' },
  { id: 'neutral', label: 'Neutral', file: '/emojis/neutral.png' },
  { id: 'tongue_wink', label: 'Lengua guiño', file: '/emojis/tongue_wink.png' },
  { id: 'tongue_squint', label: 'Lengua', file: '/emojis/tongue_squint.png' },
  { id: 'kiss', label: 'Beso', file: '/emojis/kiss.png' },
  { id: 'kiss_smile', label: 'Beso feliz', file: '/emojis/kiss_smile.png' },
  { id: 'blow_kiss', label: 'Beso al aire', file: '/emojis/blow_kiss.png' },
  { id: 'heart_eyes', label: 'Ojos corazón', file: '/emojis/heart_eyes.png' },
  { id: 'yum', label: 'Ñam', file: '/emojis/yum.png' },
  { id: 'surprised', label: 'Sorprendido', file: '/emojis/surprised.png' },
  { id: 'angel', label: 'Ángel', file: '/emojis/angel.png' },
  { id: 'sad', label: 'Triste', file: '/emojis/sad.png' },
  { id: 'worried', label: 'Preocupado', file: '/emojis/worried.png' },
  { id: 'grimace', label: 'Mueca', file: '/emojis/grimace.png' },
  { id: 'expressionless', label: 'Sin expresión', file: '/emojis/expressionless.png' },
  { id: 'disappointed', label: 'Decepcionado', file: '/emojis/disappointed.png' },
  { id: 'cry', label: 'Llora', file: '/emojis/cry.png' },
  { id: 'sad_cry', label: 'Triste llora', file: '/emojis/sad_cry.png' },
  { id: 'sob', label: 'Solloza', file: '/emojis/sob.png' },
  { id: 'upset', label: 'Molesto', file: '/emojis/upset.png' },
  { id: 'silly', label: 'Tonto', file: '/emojis/silly.png' },
  { id: 'scream', label: 'Grito', file: '/emojis/scream.png' },
  { id: 'think', label: 'Piensa', file: '/emojis/think.png' },
  { id: 'shocked', label: 'Impactado', file: '/emojis/shocked.png' },
  { id: 'stunned', label: 'Atónito', file: '/emojis/stunned.png' },
  { id: 'star_eyes', label: 'Estrellas', file: '/emojis/star_eyes.png' },
  { id: 'sneeze', label: 'Estornudo', file: '/emojis/sneeze.png' },
  { id: 'angry_steam', label: 'Enojado', file: '/emojis/angry_steam.png' },
  { id: 'nervous', label: 'Nervioso', file: '/emojis/nervous.png' },
  { id: 'sleep', label: 'Duerme', file: '/emojis/sleep.png' },
  { id: 'cool', label: 'Cool', file: '/emojis/cool.png' },
  { id: 'frown', label: 'Ceño', file: '/emojis/frown.png' },
  { id: 'angry', label: 'Furioso', file: '/emojis/angry.png' },
  { id: 'dizzy', label: 'Mareado', file: '/emojis/dizzy.png' },
  { id: 'sick', label: 'Mareado verde', file: '/emojis/sick.png' },
  { id: 'drool', label: 'Babeo', file: '/emojis/drool.png' },
  { id: 'yawn', label: 'Bostezo', file: '/emojis/yawn.png' },
  { id: 'red_angry', label: 'Rojo furioso', file: '/emojis/red_angry.png' },
  { id: 'devil_happy', label: 'Diablito feliz', file: '/emojis/devil_happy.png' },
  { id: 'devil_angry', label: 'Diablito enojado', file: '/emojis/devil_angry.png' },
];

/** Set Boom — 4×6 bombas desde assets/emojis/source-boom-sheet.jpg */
export const BOOM_EMOJIS: LiveboomEmoji[] = [
  { id: 'boom_thumbs_up', label: 'Boom pulgar arriba', file: '/emojis/boom/boom_thumbs_up.png' },
  { id: 'boom_cool', label: 'Boom cool', file: '/emojis/boom/boom_cool.png' },
  { id: 'boom_love', label: 'Boom enamorado', file: '/emojis/boom/boom_love.png' },
  { id: 'boom_wink_tongue', label: 'Boom guiño', file: '/emojis/boom/boom_wink_tongue.png' },
  { id: 'boom_laugh_tears', label: 'Boom risa', file: '/emojis/boom/boom_laugh_tears.png' },
  { id: 'boom_rock_on', label: 'Boom rock', file: '/emojis/boom/boom_rock_on.png' },
  { id: 'boom_angry', label: 'Boom enojado', file: '/emojis/boom/boom_angry.png' },
  { id: 'boom_crying', label: 'Boom llora', file: '/emojis/boom/boom_crying.png' },
  { id: 'boom_kiss', label: 'Boom beso', file: '/emojis/boom/boom_kiss.png' },
  { id: 'boom_shush', label: 'Boom shhh', file: '/emojis/boom/boom_shush.png' },
  { id: 'boom_shocked', label: 'Boom sorprendido', file: '/emojis/boom/boom_shocked.png' },
  { id: 'boom_nerd', label: 'Boom nerd', file: '/emojis/boom/boom_nerd.png' },
  { id: 'boom_smirk', label: 'Boom picardía', file: '/emojis/boom/boom_smirk.png' },
  { id: 'boom_money', label: 'Boom dinero', file: '/emojis/boom/boom_money.png' },
  { id: 'boom_sleep', label: 'Boom duerme', file: '/emojis/boom/boom_sleep.png' },
  { id: 'boom_panic', label: 'Boom pánico', file: '/emojis/boom/boom_panic.png' },
  { id: 'boom_devil', label: 'Boom diablo', file: '/emojis/boom/boom_devil.png' },
  { id: 'boom_gambler', label: 'Boom apuesta', file: '/emojis/boom/boom_gambler.png' },
  { id: 'boom_dizzy', label: 'Boom mareado', file: '/emojis/boom/boom_dizzy.png' },
  { id: 'boom_think', label: 'Boom piensa', file: '/emojis/boom/boom_think.png' },
  { id: 'boom_party', label: 'Boom fiesta', file: '/emojis/boom/boom_party.png' },
  { id: 'boom_dj', label: 'Boom DJ', file: '/emojis/boom/boom_dj.png' },
  { id: 'boom_rage', label: 'Boom furia', file: '/emojis/boom/boom_rage.png' },
  { id: 'boom_zen', label: 'Boom zen', file: '/emojis/boom/boom_zen.png' },
];

const byId = new Map([...LIVEBOOM_EMOJIS, ...BOOM_EMOJIS].map((e) => [e.id, e]));

export function emojiToken(id: string) {
  return `:${id}:`;
}

export function insertEmojiToken(text: string, id: string) {
  const token = emojiToken(id);
  if (!text) return token;
  return text.endsWith(' ') ? `${text}${token}` : `${text} ${token}`;
}

export function resolveEmoji(id: string) {
  return byId.get(id);
}

export const EMOJI_SHORTCODE_RE = /:([a-z_]+):/g;
