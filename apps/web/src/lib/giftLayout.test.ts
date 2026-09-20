/**
 * Layout de regalos: dispositivo × formato LIVE, sin deformar.
 * Ejecutar: npx tsx apps/web/src/lib/giftLayout.test.ts
 */
import {
  copyGiftLayoutFormat,
  copyGiftLayoutToAllDevices,
  defaultGiftLayoutSlot,
  giftLayoutDeviceFromViewport,
  giftLayoutMediaStyle,
  giftLiveFormatFromAspect,
  giftPlaybackLiveFormat,
  isGiftLayoutBleed,
  normalizeGiftLayout,
  patchGiftLayout,
  resolveGiftLayoutSlot,
  serializeGiftLayout,
} from './giftLayout.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, msg: string) {
  assert(Math.abs(a - b) < 0.001, msg);
}

function testDefaults() {
  const slot = defaultGiftLayoutSlot(0.9);
  almost(slot.scale, 0.9, 'scale from animScale');
  assert(slot.fit === 'contain', 'default contain');
  assert(slot.x === 50 && slot.y === 50, 'centered');
  assert(slot.displayArea === 'live', 'inside live');
  assert(slot.fullscreenMode === 'none', 'no fullscreen');
}

function testIndependentSlots() {
  let layout = normalizeGiftLayout(undefined, 0.72);
  layout = patchGiftLayout(layout, 'mobile', 'portrait916', { scale: 0.9, fit: 'cover' });
  layout = patchGiftLayout(layout, 'mobile', 'landscape169', { scale: 0.65, x: 40 });
  layout = patchGiftLayout(layout, 'desktop', 'landscape169', { scale: 1.1, displayArea: 'global' });
  almost(layout.mobile.portrait916.scale, 0.9, 'mobile 9:16');
  almost(layout.mobile.landscape169.scale, 0.65, 'mobile 16:9');
  almost(layout.desktop.landscape169.scale, 1.1, 'pc 16:9');
  assert(layout.desktop.portrait916.scale === 0.72, 'pc 9:16 untouched');
  assert(layout.tablet.portrait916.fit === 'contain', 'tablet independent');
}

function testCopy() {
  let layout = normalizeGiftLayout(undefined, 0.5);
  layout = patchGiftLayout(layout, 'mobile', 'portrait916', { scale: 1.3, y: 40, fit: 'width' });
  layout = copyGiftLayoutToAllDevices(layout, 'mobile');
  almost(layout.desktop.portrait916.scale, 1.3, 'copy devices');
  almost(layout.tablet.portrait916.y, 40, 'copy y');
  layout = copyGiftLayoutFormat(layout, 'portrait916', 'landscape169');
  almost(layout.desktop.landscape169.scale, 1.3, 'copy 9:16 -> 16:9');
  assert(layout.mobile.landscape169.fit === 'width', 'copy fit');
}

function testDetect() {
  assert(giftLiveFormatFromAspect('9:16') === 'portrait916', '9:16');
  assert(giftLiveFormatFromAspect('16:9') === 'landscape169', '16:9');
  assert(giftLayoutDeviceFromViewport(360, 800) === 'mobile', '360 mobile');
  assert(giftLayoutDeviceFromViewport(820, 1180) === 'tablet', '820 tablet portrait');
  assert(giftLayoutDeviceFromViewport(1440, 900) === 'desktop', '1440 desktop');
  assert(giftPlaybackLiveFormat('mobile', 'portrait') === 'portrait916', 'phone 9:16');
  assert(giftPlaybackLiveFormat('mobile', 'landscape') === 'portrait916', 'phone stays 9:16');
  assert(giftPlaybackLiveFormat('tablet', 'portrait') === 'portrait916', 'tablet portrait 9:16');
  assert(giftPlaybackLiveFormat('tablet', 'landscape') === 'landscape169', 'tablet landscape 16:9');
  assert(giftPlaybackLiveFormat('desktop', 'portrait') === 'landscape169', 'desktop 16:9');
}

function testResolveAndBleed() {
  const layout = patchGiftLayout(undefined, 'desktop', 'landscape169', {
    fit: 'cover',
    fullscreenMode: 'live',
    displayArea: 'live',
    scale: 1,
  });
  const slot = resolveGiftLayoutSlot({
    layout,
    device: 'desktop',
    liveAspect: '16:9',
  });
  assert(isGiftLayoutBleed(slot), 'cover/live is full bleed');
  const style = giftLayoutMediaStyle(slot);
  assert(style.objectFit === 'cover', 'cover never stretches');
  assert(style.inset === 0, 'bleed inset 0');
}

function testContainDoesNotStretch() {
  const slot = defaultGiftLayoutSlot(0.5);
  const style = giftLayoutMediaStyle(slot);
  assert(style.objectFit === 'contain', 'contain');
  assert(style.transform?.includes('translate(-50%, -50%)'), 'centered transform');
}

function testRoundtrip() {
  const original = patchGiftLayout(undefined, 'tablet', 'portrait916', {
    fit: 'height',
    scale: 1.5,
    x: 52,
    y: 46,
    cropX: 30,
    cropY: 70,
    displayArea: 'global',
    fullscreenMode: 'global',
  });
  const saved = serializeGiftLayout(original);
  const loaded = normalizeGiftLayout(saved);
  assert(JSON.stringify(loaded) === JSON.stringify(saved), 'serialize roundtrip');
  almost(loaded.tablet.portrait916.scale, 1.5, 'scale 150% kept');
  almost(loaded.tablet.portrait916.x, 52, 'x kept');
  almost(loaded.tablet.portrait916.cropY, 70, 'crop independent');
}

function testScaleClamp() {
  const high = defaultGiftLayoutSlot(4);
  const low = defaultGiftLayoutSlot(0.01);
  almost(high.scale, 2, 'max 200%');
  almost(low.scale, 0.2, 'min 20%');
}

testDefaults();
testIndependentSlots();
testCopy();
testDetect();
testResolveAndBleed();
testContainDoesNotStretch();
testRoundtrip();
testScaleClamp();
console.log('giftLayout tests ok');
