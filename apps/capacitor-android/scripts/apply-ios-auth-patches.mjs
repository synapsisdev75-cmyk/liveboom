import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const patches = join(root, 'ios-patches');
const targetDir = join(
  root,
  '..',
  '..',
  'node_modules',
  '@capacitor-firebase',
  'authentication',
  'ios',
  'Plugin',
  'Handlers',
);

const files = ['GoogleAuthProviderHandler.swift', 'AppleAuthProviderHandler.swift'];
if (!existsSync(targetDir)) {
  console.warn('[apply-ios-auth-patches] No está el plugin iOS en node_modules; se omite.');
  process.exit(0);
}
for (const file of files) {
  const from = join(patches, file);
  const to = join(targetDir, file);
  if (!existsSync(from)) {
    console.warn(`[apply-ios-auth-patches] Falta ${from}`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`[apply-ios-auth-patches] ${file}`);
}
