import { BOOM_EMOJIS, LIVEBOOM_EMOJIS } from './liveboomEmojis';
import { STICKER_PACKS, STICKER_PACK_ITEMS, type StickerPackId } from './stickerPacks.data';

/** `mios` = stickers creados por el usuario (Storage, no catálogo). */
export type ComposerStickerPack = 'clasicos' | 'mios' | StickerPackId;

export type ComposerSticker = {
  id: string;
  label: string;
  src: string;
  text?: string;
  kind: 'sticker' | 'text';
  pack: ComposerStickerPack;
  /** Escala inicial al colocarlo sobre foto/video (18% del ancho × scale). */
  scale?: number;
};

const ART_STICKER_SCALE = 1.9;

const TEXT_STICKERS: ComposerSticker[] = [
  { id: 'txt-epico', label: 'Épico', src: '', text: '¡ÉPICO!', kind: 'text', pack: 'clasicos' },
  { id: 'txt-boom', label: 'Boom', src: '', text: 'BOOM', kind: 'text', pack: 'clasicos' },
  { id: 'txt-fire', label: 'Fire', src: '', text: 'FIRE', kind: 'text', pack: 'clasicos' },
  { id: 'txt-love', label: 'Love', src: '', text: 'LOVE', kind: 'text', pack: 'clasicos' },
  { id: 'txt-wow', label: 'Wow', src: '', text: 'WOW', kind: 'text', pack: 'clasicos' },
  { id: 'txt-yes', label: 'Yes', src: '', text: 'YAS', kind: 'text', pack: 'clasicos' },
];

export const COMPOSER_STICKER_PACKS: { id: ComposerStickerPack; label: string }[] = [
  ...STICKER_PACKS,
  { id: 'clasicos', label: 'Clásicos' },
];

export const COMPOSER_STICKERS: ComposerSticker[] = [
  ...STICKER_PACK_ITEMS.map((item) => ({
    id: `pk-${item.id}`,
    label: item.label,
    src: item.src,
    kind: 'sticker' as const,
    pack: item.pack,
    scale: ART_STICKER_SCALE,
  })),
  ...TEXT_STICKERS,
  ...LIVEBOOM_EMOJIS.map((item) => ({
    id: `st-${item.id}`,
    label: item.label,
    src: item.file,
    kind: 'sticker' as const,
    pack: 'clasicos' as const,
  })),
  ...BOOM_EMOJIS.map((item) => ({
    id: `st-${item.id}`,
    label: item.label,
    src: item.file,
    kind: 'sticker' as const,
    pack: 'clasicos' as const,
  })),
];
