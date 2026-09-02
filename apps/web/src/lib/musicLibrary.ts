/** Biblioteca de música libre de derechos (generada en el navegador, sin copyright). */

export const MUSIC_CLIP_SEC = 8;

export type MusicPresetId =
  | 'bossa'
  | 'urban'
  | 'pop'
  | 'electro'
  | 'chill'
  | 'fiesta'
  | 'bright'
  | 'groove';

export type MusicGenre =
  | 'latino'
  | 'urbano'
  | 'pop'
  | 'electro'
  | 'chill'
  | 'fiesta';

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  genre: MusicGenre;
  mood: string;
  /** Duración generada del tema (s). */
  durationSec: number;
  preset: MusicPresetId;
  license: 'royalty-free';
};

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: 'salsa-fiesta',
    title: 'Salsa Fiesta',
    artist: 'LiveBoom',
    genre: 'latino',
    mood: 'Alegre',
    durationSec: 64,
    preset: 'fiesta',
    license: 'royalty-free',
  },
  {
    id: 'bossa-latina',
    title: 'Bossa Latina',
    artist: 'LiveBoom',
    genre: 'latino',
    mood: 'Suave',
    durationSec: 72,
    preset: 'bossa',
    license: 'royalty-free',
  },
  {
    id: 'deep-urban',
    title: 'Deep Urban',
    artist: 'LiveBoom',
    genre: 'urbano',
    mood: 'Urbano',
    durationSec: 68,
    preset: 'urban',
    license: 'royalty-free',
  },
  {
    id: 'hip-hop-groove',
    title: 'Hip Hop Groove',
    artist: 'LiveBoom',
    genre: 'urbano',
    mood: 'Flow',
    durationSec: 60,
    preset: 'groove',
    license: 'royalty-free',
  },
  {
    id: 'tech-house',
    title: 'Tech House',
    artist: 'LiveBoom',
    genre: 'electro',
    mood: 'Electrónica',
    durationSec: 70,
    preset: 'electro',
    license: 'royalty-free',
  },
  {
    id: 'pop-energy',
    title: 'Pop Energy',
    artist: 'LiveBoom',
    genre: 'pop',
    mood: 'Pop',
    durationSec: 56,
    preset: 'pop',
    license: 'royalty-free',
  },
  {
    id: 'valley-chill',
    title: 'Valley Chill',
    artist: 'LiveBoom',
    genre: 'chill',
    mood: 'Relajado',
    durationSec: 80,
    preset: 'chill',
    license: 'royalty-free',
  },
  {
    id: 'play-it-cool',
    title: 'Play It Cool',
    artist: 'LiveBoom',
    genre: 'fiesta',
    mood: 'Fiesta',
    durationSec: 62,
    preset: 'bright',
    license: 'royalty-free',
  },
];

export type SelectedMusicClip = {
  trackId: string;
  startSec: number;
  clipSec: number;
};

export const MUSIC_GENRE_LABELS: Record<MusicGenre, string> = {
  latino: 'Latino',
  urbano: 'Urbano',
  pop: 'Pop',
  electro: 'Electrónica',
  chill: 'Chill',
  fiesta: 'Fiesta',
};

export function findMusicTrack(id: string): MusicTrack | undefined {
  return MUSIC_LIBRARY.find((track) => track.id === id);
}

export function maxMusicStartSec(track: MusicTrack, clipSec = MUSIC_CLIP_SEC) {
  return Math.max(0, track.durationSec - clipSec);
}

export function clampMusicStart(startSec: number, track: MusicTrack, clipSec = MUSIC_CLIP_SEC) {
  return Math.min(Math.max(0, startSec), maxMusicStartSec(track, clipSec));
}
