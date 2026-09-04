/**
 * Banderas redondas como icono (no letras de Windows).
 * Países: Circle Flags (MIT). Especiales: SVGs propios LiveBoom.
 */

export type CircleFlag = {
  char: string;
  code: string;
  label: string;
  file: string;
};

const FLAG_DIR = '/emojis/flags';

function isoToFlag(iso: string) {
  return [...iso.toUpperCase()]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');
}

function fileFor(code: string) {
  return `${FLAG_DIR}/${code}.svg`;
}

/** Secuencias unicode (con y sin VS16) → código de archivo. */
const SPECIALS: Array<{ code: string; label: string; seqs: string[] }> = [
  { code: 'white', label: 'blanca', seqs: ['\u{1F3F3}\u{FE0F}', '\u{1F3F3}'] },
  { code: 'black', label: 'negra', seqs: ['\u{1F3F4}'] },
  { code: 'checkered', label: 'cuadros', seqs: ['\u{1F3C1}'] },
  { code: 'red', label: 'roja', seqs: ['\u{1F6A9}'] },
  { code: 'crossed', label: 'cruzadas', seqs: ['\u{1F38C}'] },
  {
    code: 'pirate',
    label: 'pirata',
    seqs: ['\u{1F3F4}\u{200D}\u{2620}\u{FE0F}', '\u{1F3F4}\u{200D}\u{2620}'],
  },
  {
    code: 'pride',
    label: 'orgullo',
    seqs: ['\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', '\u{1F3F3}\u{200D}\u{1F308}'],
  },
  {
    code: 'trans',
    label: 'trans',
    seqs: [
      '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}\u{FE0F}',
      '\u{1F3F3}\u{200D}\u{26A7}\u{FE0F}',
      '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}',
      '\u{1F3F3}\u{200D}\u{26A7}',
    ],
  },
];

/** iso2 + nombre para el picker (orden: LATAM primero, luego el resto). */
const COUNTRIES: Array<[string, string]> = [
  ['mx', 'méxico'],
  ['co', 'colombia'],
  ['ar', 'argentina'],
  ['cl', 'chile'],
  ['pe', 'perú'],
  ['ve', 'venezuela'],
  ['ec', 'ecuador'],
  ['bo', 'bolivia'],
  ['py', 'paraguay'],
  ['uy', 'uruguay'],
  ['br', 'brasil'],
  ['pa', 'panamá'],
  ['cr', 'costa rica'],
  ['gt', 'guatemala'],
  ['hn', 'honduras'],
  ['sv', 'el salvador'],
  ['ni', 'nicaragua'],
  ['cu', 'cuba'],
  ['do', 'república dominicana'],
  ['pr', 'puerto rico'],
  ['ht', 'haití'],
  ['jm', 'jamaica'],
  ['tt', 'trinidad'],
  ['bz', 'belice'],
  ['gy', 'guyana'],
  ['sr', 'surinam'],
  ['es', 'españa'],
  ['us', 'estados unidos'],
  ['ca', 'canadá'],
  ['gb', 'reino unido'],
  ['fr', 'francia'],
  ['de', 'alemania'],
  ['it', 'italia'],
  ['pt', 'portugal'],
  ['nl', 'países bajos'],
  ['be', 'bélgica'],
  ['ch', 'suiza'],
  ['at', 'austria'],
  ['se', 'suecia'],
  ['no', 'noruega'],
  ['dk', 'dinamarca'],
  ['fi', 'finlandia'],
  ['ie', 'irlanda'],
  ['pl', 'polonia'],
  ['ua', 'ucrania'],
  ['ru', 'rusia'],
  ['tr', 'turquía'],
  ['gr', 'grecia'],
  ['cz', 'chequia'],
  ['ro', 'rumanía'],
  ['hu', 'hungría'],
  ['sk', 'eslovaquia'],
  ['hr', 'croacia'],
  ['rs', 'serbia'],
  ['bg', 'bulgaria'],
  ['jp', 'japón'],
  ['kr', 'corea'],
  ['cn', 'china'],
  ['tw', 'taiwán'],
  ['hk', 'hong kong'],
  ['in', 'india'],
  ['pk', 'pakistán'],
  ['bd', 'bangladés'],
  ['id', 'indonesia'],
  ['ph', 'filipinas'],
  ['th', 'tailandia'],
  ['vn', 'vietnam'],
  ['my', 'malasia'],
  ['sg', 'singapur'],
  ['au', 'australia'],
  ['nz', 'nueva zelanda'],
  ['za', 'sudáfrica'],
  ['eg', 'egipto'],
  ['ng', 'nigeria'],
  ['ke', 'kenia'],
  ['ma', 'marruecos'],
  ['tn', 'túnez'],
  ['dz', 'argelia'],
  ['sa', 'arabia saudita'],
  ['ae', 'emiratos'],
  ['il', 'israel'],
  ['qa', 'catar'],
  ['kw', 'kuwait'],
  ['un', 'naciones unidas'],
  ['eu', 'unión europea'],
  ['af', 'afganistán'],
  ['al', 'albania'],
  ['am', 'armenia'],
  ['ao', 'angola'],
  ['az', 'azerbaiyán'],
  ['ba', 'bosnia'],
  ['bh', 'baréin'],
  ['by', 'bielorrusia'],
  ['cd', 'congo'],
  ['ci', 'costa de marfil'],
  ['cm', 'camerún'],
  ['cy', 'chipre'],
  ['ee', 'estonia'],
  ['et', 'etiopía'],
  ['ge', 'georgia'],
  ['gh', 'ghana'],
  ['iq', 'irak'],
  ['ir', 'irán'],
  ['is', 'islandia'],
  ['jo', 'jordania'],
  ['kh', 'camboya'],
  ['lb', 'líbano'],
  ['lk', 'sri lanka'],
  ['lt', 'lituania'],
  ['lu', 'luxemburgo'],
  ['lv', 'letonia'],
  ['ly', 'libia'],
  ['md', 'moldavia'],
  ['me', 'montenegro'],
  ['mk', 'macedonia'],
  ['mm', 'myanmar'],
  ['mn', 'mongolia'],
  ['np', 'nepal'],
  ['om', 'omán'],
  ['si', 'eslovenia'],
  ['sn', 'senegal'],
  ['so', 'somalia'],
  ['sy', 'siria'],
  ['tz', 'tanzania'],
  ['ug', 'uganda'],
  ['uz', 'uzbekistán'],
  ['ye', 'yemen'],
  ['zw', 'zimbabue'],
];

const specialFlags: CircleFlag[] = SPECIALS.map((item) => ({
  char: item.seqs[0]!,
  code: item.code,
  label: item.label,
  file: fileFor(item.code),
}));

const countryFlags: CircleFlag[] = COUNTRIES.map(([iso, label]) => ({
  char: isoToFlag(iso),
  code: iso,
  label,
  file: fileFor(iso),
}));

export const CIRCLE_FLAGS: CircleFlag[] = [...specialFlags, ...countryFlags];

export const FLAG_PICKER_EMOJIS = CIRCLE_FLAGS.map(({ char, label }) => ({ char, label }));

const byChar = new Map<string, CircleFlag>();
for (const item of specialFlags) {
  for (const seq of SPECIALS.find((row) => row.code === item.code)?.seqs ?? [item.char]) {
    byChar.set(seq, item);
  }
}
for (const item of countryFlags) byChar.set(item.char, item);

const byIso = new Map(countryFlags.map((item) => [item.code, item]));

const specialSeqs = SPECIALS.flatMap((item) =>
  item.seqs.map((seq) => ({ seq, flag: specialFlags.find((row) => row.code === item.code)! })),
).sort((a, b) => b.seq.length - a.seq.length);

function isRegionalIndicator(code: number) {
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

export function resolveFlagIcon(char: string): CircleFlag | undefined {
  return byChar.get(char) ?? byChar.get(char.replace(/\uFE0F/g, ''));
}

export function flagIconSrc(code: string) {
  return fileFor(code);
}

export type FlagSpan = { start: number; end: number; flag: CircleFlag };

export function matchFlagAt(
  text: string,
  index: number,
): { flag: CircleFlag; length: number } | null {
  if (index >= text.length) return null;

  for (const { seq, flag } of specialSeqs) {
    if (!text.startsWith(seq, index)) continue;
    if (flag.code === 'white' || flag.code === 'black') {
      const after = index + seq.length;
      if (text.codePointAt(after) === 0x200d) continue;
    }
    return { flag, length: seq.length };
  }

  const first = text.codePointAt(index);
  if (first == null || !isRegionalIndicator(first)) return null;
  const firstLen = first > 0xffff ? 2 : 1;
  const second = text.codePointAt(index + firstLen);
  if (second == null || !isRegionalIndicator(second)) return null;
  const secondLen = second > 0xffff ? 2 : 1;
  const iso =
    String.fromCharCode(first - 0x1f1e6 + 65).toLowerCase() +
    String.fromCharCode(second - 0x1f1e6 + 65).toLowerCase();
  const known = byIso.get(iso);
  const flag =
    known ??
    ({
      char: text.slice(index, index + firstLen + secondLen),
      code: iso,
      label: iso.toUpperCase(),
      file: fileFor(iso),
    } satisfies CircleFlag);
  return { flag, length: firstLen + secondLen };
}

export function listFlagSpans(text: string): FlagSpan[] {
  const out: FlagSpan[] = [];
  let index = 0;
  while (index < text.length) {
    const hit = matchFlagAt(text, index);
    if (hit) {
      out.push({ start: index, end: index + hit.length, flag: hit.flag });
      index += hit.length;
      continue;
    }
    const cp = text.codePointAt(index) ?? 0;
    index += cp > 0xffff ? 2 : 1;
  }
  return out;
}

export const CIRCLE_FLAG_ISO_CODES = COUNTRIES.map(([iso]) => iso);
