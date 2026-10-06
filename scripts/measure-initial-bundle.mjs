#!/usr/bin/env node
// Mide el JS/CSS que el navegador descarga al abrir LiveBoom (entrada + modulepreload + stylesheets de index.html).
// Uso: node scripts/measure-initial-bundle.mjs [apps/web/dist]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] || 'apps/web/dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const unique = [...new Set(refs)];

let raw = 0;
let gz = 0;
const rows = [];
for (const ref of unique) {
  const buf = readFileSync(join(dist, ref));
  const g = gzipSync(buf, { level: 9 }).length;
  raw += buf.length;
  gz += g;
  rows.push({ ref, raw: buf.length, gz: g });
}
rows.sort((a, b) => b.raw - a.raw);

let totalJs = 0;
let totalJsGz = 0;
let jsFiles = 0;
for (const name of readdirSync(join(dist, 'assets'))) {
  if (!name.endsWith('.js')) continue;
  const buf = readFileSync(join(dist, 'assets', name));
  totalJs += statSync(join(dist, 'assets', name)).size;
  totalJsGz += gzipSync(buf, { level: 9 }).length;
  jsFiles += 1;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Solicitudes iniciales JS/CSS: ${unique.length}`);
console.log(`Peso inicial: ${kb(raw)} (gzip ${kb(gz)})`);
console.log(`JS total generado: ${jsFiles} archivos, ${kb(totalJs)} (gzip ${kb(totalJsGz)})`);
console.log('Top 15 iniciales:');
for (const r of rows.slice(0, 15)) console.log(`  ${r.ref.padEnd(52)} ${kb(r.raw).padStart(10)}  gzip ${kb(r.gz)}`);
