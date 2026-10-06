// Copia las clases nativas versionadas (native/*.java) al proyecto Android generado por Capacitor.
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'native');
const target = join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'liveboom', 'app');

if (!existsSync(target)) {
  console.warn(`[apply-native] No existe ${target}. Ejecuta primero: npx cap add android`);
  process.exit(0);
}

for (const file of readdirSync(source).filter((name) => name.endsWith('.java'))) {
  copyFileSync(join(source, file), join(target, file));
  console.log(`[apply-native] ${file} -> android/app/src/main/java/com/liveboom/app/`);
}
