/**
 * Descarga banderas circulares MIT (HatScripts/circle-flags) a public/emojis/flags.
 * No usa arte de Apple; son SVG propios del set Circle Flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'emojis', 'flags');
const VERSION = '2.7.0';
const BASE = `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@${VERSION}/flags`;

const ISO = [
  'ad','ae','af','ag','ai','al','am','ao','aq','ar','as','at','au','aw','ax','az',
  'ba','bb','bd','be','bf','bg','bh','bi','bj','bl','bm','bn','bo','bq','br','bs','bt','bv','bw','by','bz',
  'ca','cc','cd','cf','cg','ch','ci','ck','cl','cm','cn','co','cr','cu','cv','cw','cx','cy','cz',
  'de','dj','dk','dm','do','dz','ec','ee','eg','eh','er','es','et','fi','fj','fk','fm','fo','fr',
  'ga','gb','gd','ge','gf','gg','gh','gi','gl','gm','gn','gp','gq','gr','gs','gt','gu','gw','gy',
  'hk','hm','hn','hr','ht','hu','id','ie','il','im','in','io','iq','ir','is','it','je','jm','jo','jp',
  'ke','kg','kh','ki','km','kn','kp','kr','kw','ky','kz','la','lb','lc','li','lk','lr','ls','lt','lu','lv','ly',
  'ma','mc','md','me','mf','mg','mh','mk','ml','mm','mn','mo','mp','mq','mr','ms','mt','mu','mv','mw','mx','my','mz',
  'na','nc','ne','nf','ng','ni','nl','no','np','nr','nu','nz','om','pa','pe','pf','pg','ph','pk','pl','pm','pn','pr','ps','pt','pw','py',
  'qa','re','ro','rs','ru','rw','sa','sb','sc','sd','se','sg','sh','si','sj','sk','sl','sm','sn','so','sr','ss','st','sv','sx','sy','sz',
  'tc','td','tf','tg','th','tj','tk','tl','tm','tn','to','tr','tt','tv','tw','tz','ua','ug','um','us','uy','uz',
  'va','vc','ve','vg','vi','vn','vu','wf','ws','xk','ye','yt','za','zm','zw',
];

const ALIASES = [
  { code: 'eu', url: `${BASE}/european_union.svg` },
  { code: 'un', url: `${BASE}/united_nations.svg` },
  { code: 'pirate', url: `${BASE}/other/pirate.svg` },
];

async function save(code, url) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const svg = await res.text();
  if (!svg.includes('<svg')) return false;
  fs.writeFileSync(path.join(outDir, `${code}.svg`), svg);
  return true;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0;
  let fail = 0;
  const jobs = [
    ...ISO.map((code) => ({ code, url: `${BASE}/${code}.svg` })),
    ...ALIASES,
  ];
  const queue = [...jobs];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      try {
        const saved = await save(next.code, next.url);
        if (saved) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
  });
  await Promise.all(workers);
  console.log(`circle-flags: ${ok} ok, ${fail} skip → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
