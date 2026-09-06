import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const src = 'c:/Users/empre/Desktop/liveboom/apps/web/public/brand/icon-1024.png';
const res = 'c:/Users/empre/Desktop/liveboom/apps/capacitor-android/android/app/src/main/res';
const sizes = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

for (const [folder, size] of sizes) {
  const dir = path.join(res, folder);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(src).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
  await sharp(src).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  await sharp(src).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
}

const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
const launcher = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), launcher);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), launcher);

const values = path.join(res, 'values');
fs.mkdirSync(values, { recursive: true });
const colorsPath = path.join(values, 'ic_launcher_background.xml');
fs.writeFileSync(
  colorsPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B1B3A</color>
</resources>
`,
);

console.log('android icons ok');
