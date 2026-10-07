/**
 * Aviso de actualización: cuándo se muestra, cuándo es obligatorio y cuándo se pospone.
 * Ejecutar: npx tsx apps/web/src/lib/appUpdatePolicy.test.ts
 */
import {
  APP_UPDATE_SNOOZE_MS,
  DEFAULT_STORE_URL,
  decideAppUpdate,
  normalizeAppUpdateConfig,
} from './appUpdatePolicy';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const NOW = 1_000_000;

const empty = normalizeAppUpdateConfig(undefined);
assert(empty.android.latestBuild === 0 && empty.ios.latestBuild === 0, 'sin configuración no hay versión publicada');
assert(empty.android.storeUrl === DEFAULT_STORE_URL.android, 'Android usa Play Store por defecto');
assert(decideAppUpdate(empty.android, 62, null, NOW).kind === 'none', 'sin versión publicada no hay aviso');

const config = normalizeAppUpdateConfig({
  android: { latestVersion: '1.0.63', latestBuild: 63, minBuild: 0, storeUrl: 'javascript:alert(1)' },
  ios: { latestVersion: '1.0.5', latestBuild: '5', minBuild: 9, notes: '  Mejoras  ' },
});
assert(config.android.storeUrl === DEFAULT_STORE_URL.android, 'enlace no https vuelve a la tienda oficial');
assert(config.ios.latestBuild === 5, 'acepta compilación como texto');
assert(config.ios.minBuild === 5, 'la mínima nunca supera la publicada');
assert(config.ios.notes === 'Mejoras', 'recorta espacios de las novedades');

const android = config.android;
assert(decideAppUpdate(android, 63, null, NOW).kind === 'none', 'ya tiene la última versión');
assert(decideAppUpdate(android, 64, null, NOW).kind === 'none', 'versión instalada más nueva que la tienda');
assert(decideAppUpdate(android, null, null, NOW).kind === 'none', 'sin saber la versión instalada no se avisa');
assert(decideAppUpdate(android, 62, null, NOW).kind === 'optional', 'versión vieja: aviso que se puede posponer');

const snooze = { build: 63, until: NOW + APP_UPDATE_SNOOZE_MS };
assert(decideAppUpdate(android, 62, snooze, NOW).kind === 'none', 'pospuesto: no vuelve a salir hoy');
assert(decideAppUpdate(android, 62, snooze, NOW + APP_UPDATE_SNOOZE_MS).kind === 'optional', 'al día siguiente vuelve a salir');
assert(
  decideAppUpdate({ ...android, latestBuild: 64 }, 62, snooze, NOW).kind === 'optional',
  'una versión aún más nueva vuelve a avisar aunque se haya pospuesto la anterior',
);

const required = { ...android, minBuild: 63 };
assert(decideAppUpdate(required, 62, null, NOW).kind === 'required', 'por debajo de la mínima: obligatorio');
assert(decideAppUpdate(required, 62, snooze, NOW).kind === 'required', 'lo obligatorio no se puede posponer');

console.log('appUpdatePolicy: ok');
