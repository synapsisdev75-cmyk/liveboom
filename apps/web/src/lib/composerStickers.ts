import { BOOM_EMOJIS, LIVEBOOM_EMOJIS } from './liveboomEmojis';

export type ComposerSticker = {
  id: string;
  label: string;
  src: string;
  text?: string;
  kind: 'sticker' | 'text';
};

const TEXT_STICKERS: ComposerSticker[] = [
  { id: 'txt-epico', label: 'Épico', src: '', text: '¡ÉPICO!', kind: 'text' },
  { id: 'txt-boom', label: 'Boom', src: '', text: 'BOOM', kind: 'text' },
  { id: 'txt-fire', label: 'Fire', src: '', text: 'FIRE', kind: 'text' },
  { id: 'txt-love', label: 'Love', src: '', text: 'LOVE', kind: 'text' },
  { id: 'txt-wow', label: 'Wow', src: '', text: 'WOW', kind: 'text' },
  { id: 'txt-yes', label: 'Yes', src: '', text: 'YAS', kind: 'text' },
];

export const COMPOSER_STICKERS: ComposerSticker[] = [
  ...TEXT_STICKERS,
  ...LIVEBOOM_EMOJIS.map((item) => ({
    id: `st-${item.id}`,
    label: item.label,
    src: item.file,
    kind: 'sticker' as const,
  })),
  ...BOOM_EMOJIS.map((item) => ({
    id: `st-${item.id}`,
    label: item.label,
    src: item.file,
    kind: 'sticker' as const,
  })),
];
