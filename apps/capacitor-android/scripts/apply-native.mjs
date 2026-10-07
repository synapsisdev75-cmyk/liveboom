// Copia las clases nativas versionadas (native/*.java) al proyecto Android generado por Capacitor
// y deja el AndroidManifest con el mínimo de permisos (ver PERMISOS-ANDROID.md).
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'native');
const target = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'liveboom', 'app');
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!existsSync(target)) {
  console.warn(`[apply-native] No existe ${target}. Ejecuta primero: npx cap add android`);
  process.exit(0);
}

for (const file of readdirSync(source).filter((name) => name.endsWith('.java'))) {
  copyFileSync(join(source, file), join(target, file));
  console.log(`[apply-native] ${file} -> android/app/src/main/java/com/liveboom/app/`);
}

/** Permisos que usa LiveBoom; cada uno se pide en tiempo de ejecución solo al usar la función. */
const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.BLUETOOTH_CONNECT',
  // Android 12+ muestra "Aproximada / Precisa"; la WebView acepta solo aproximada.
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];

/**
 * Permisos heredados o de SDKs que LiveBoom no necesita: fotos y videos se eligen con el selector
 * del sistema (acceso por archivo, sin permiso amplio) y la ubicación nunca se usa en segundo plano.
 */
const REMOVED_PERMISSIONS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.ACCESS_MEDIA_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_PHONE_STATE',
];

/** Hardware opcional: la app se instala aunque el equipo no tenga cámara, micrófono o GPS. */
const OPTIONAL_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
  'android.hardware.microphone',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.bluetooth',
];

const START = '<!-- liveboom:permissions:start -->';
const END = '<!-- liveboom:permissions:end -->';
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function patchManifest(path) {
  let xml = readFileSync(path, 'utf8');
  xml = xml.replace(new RegExp(`\\s*${esc(START)}[\\s\\S]*?${esc(END)}`), '');
  if (!/xmlns:tools=/.test(xml)) {
    xml = xml.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
  }
  for (const name of REMOVED_PERMISSIONS) {
    xml = xml.replace(
      new RegExp(`\\s*<uses-permission(?:-sdk-23)?\\b[^>]*android:name="${esc(name)}"[^>]*/>`, 'g'),
      '',
    );
  }
  const has = (tag, name) => new RegExp(`<${tag}\\b[^>]*android:name="${esc(name)}"`).test(xml);
  const lines = [];
  for (const name of REQUIRED_PERMISSIONS) {
    if (!has('uses-permission', name)) lines.push(`<uses-permission android:name="${name}" />`);
  }
  for (const name of REMOVED_PERMISSIONS) {
    lines.push(`<uses-permission android:name="${name}" tools:node="remove" />`);
  }
  for (const name of OPTIONAL_FEATURES) {
    if (!has('uses-feature', name)) lines.push(`<uses-feature android:name="${name}" android:required="false" />`);
  }
  const block = `\n    ${START}\n${lines.map((line) => `    ${line}`).join('\n')}\n    ${END}\n`;
  if (!/<application\b/.test(xml)) {
    console.warn('[apply-native] AndroidManifest sin <application>; no se modificó.');
    return;
  }
  xml = xml.replace(/\n?(\s*)<application\b/, `${block}$1<application`);
  writeFileSync(path, xml);
  console.log('[apply-native] AndroidManifest: permisos mínimos aplicados (ver PERMISOS-ANDROID.md).');
}

/**
 * Enlaces que abren la app instalada en vez del navegador:
 * - https://(www.)liveboomapp.com/s/<id> (publicación compartida), verificado con /.well-known/assetlinks.json.
 * - liveboom://… (vuelta de la billetera y `liveboom://s/<id>` desde la página de compartir).
 * Solo /s/: el resto del sitio (p. ej. «Continuar en el navegador») sigue abriendo en el navegador.
 */
const LINKS_START = '<!-- liveboom:links:start -->';
const LINKS_END = '<!-- liveboom:links:end -->';
const LINK_FILTERS = [
  '<intent-filter android:autoVerify="true">',
  '    <action android:name="android.intent.action.VIEW" />',
  '    <category android:name="android.intent.category.DEFAULT" />',
  '    <category android:name="android.intent.category.BROWSABLE" />',
  '    <data android:scheme="https" android:host="liveboomapp.com" android:pathPrefix="/s/" />',
  '    <data android:scheme="https" android:host="www.liveboomapp.com" android:pathPrefix="/s/" />',
  '</intent-filter>',
  '<intent-filter>',
  '    <action android:name="android.intent.action.VIEW" />',
  '    <category android:name="android.intent.category.DEFAULT" />',
  '    <category android:name="android.intent.category.BROWSABLE" />',
  '    <data android:scheme="liveboom" />',
  '</intent-filter>',
];

function patchLinkFilters(path) {
  let xml = readFileSync(path, 'utf8');
  xml = xml.replace(new RegExp(`\\s*${esc(LINKS_START)}[\\s\\S]*?${esc(LINKS_END)}`), '');
  const activity = /(<activity\b[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(\n?\s*<\/activity>)/;
  if (!activity.test(xml)) {
    console.warn('[apply-native] AndroidManifest sin MainActivity; enlaces sin aplicar.');
    return;
  }
  const block = `\n            ${LINKS_START}\n${LINK_FILTERS.map((line) => `            ${line}`).join('\n')}\n            ${LINKS_END}`;
  xml = xml.replace(activity, `$1${block}$2`);
  writeFileSync(path, xml);
  console.log('[apply-native] AndroidManifest: enlaces de liveboomapp.com/s/ y liveboom:// abren la app.');
}

if (existsSync(manifestPath)) {
  patchManifest(manifestPath);
  patchLinkFilters(manifestPath);
} else console.warn(`[apply-native] No existe ${manifestPath}; permisos sin aplicar.`);

// Play (protección automática) rechaza bundles con minSdk 23 o menor.
const variablesPath = join(root, 'android', 'variables.gradle');
if (existsSync(variablesPath)) {
  const gradle = readFileSync(variablesPath, 'utf8');
  const next = gradle.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24');
  if (next !== gradle) {
    writeFileSync(variablesPath, next);
    console.log('[apply-native] minSdkVersion = 24 (Play exige 24 o superior).');
  }
}
