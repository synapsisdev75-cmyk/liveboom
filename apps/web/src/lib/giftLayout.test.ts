/**
 * Layout de regalos: dispositivo × formato LIVE, sin deformar.
 * Ejecutar: npx tsx apps/web/src/lib/giftLayout.test.ts
 */
import {
  copyGiftLayoutActiveToDevices,
  copyGiftLayoutFormat,
  copyGiftLayoutToAllDevices,
  defaultGiftLayoutSlot,
  giftLayoutDeviceFromViewport,
  giftLayoutMediaStyle,
  giftLayoutVariantFor,
  giftLiveFormatFromAspect,
  giftPlaybackLiveFormat,
  isGiftLayoutBleed,
  normalizeGiftLayout,
  patchGiftLayout,
  patchGiftLayoutCell,
  resetGiftLayoutCell,
  resolveGiftLayoutCell,
  resolveGiftLayoutSlot,
  serializeGiftLayout,
  setGiftLayoutPreferredArea,
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

function testAspectAvoidsSquareLetterbox() {
  const slot = defaultGiftLayoutSlot(0.72);
  const portrait = giftLayoutMediaStyle(slot, { width: 720, height: 1280 });
  assert(portrait.height === '72%', 'portrait uses height');
  assert(portrait.width === 'auto', 'portrait width follows alpha frame');
  assert(portrait.aspectRatio === '720 / 1280', 'portrait aspect');
  const landscape = giftLayoutMediaStyle(slot, { width: 1920, height: 1080 });
  assert(landscape.width === '72%', 'landscape uses width');
  assert(landscape.height === 'auto', 'landscape height follows alpha frame');
  assert(landscape.background === 'transparent', 'no opaque box');
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

function testVariantsIndependent() {
  let layout = normalizeGiftLayout(undefined, 0.72);
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'chat', device: 'desktop', area: 'viewport' },
    { x: 12, y: 80, scale: 0.4 },
  );
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'live_9_16', device: 'desktop', area: 'content' },
    { x: 88, y: 18, scale: 1.1 },
  );
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'publicaciones', device: 'mobile', area: 'content' },
    { x: 30, y: 60, scale: 0.55 },
  );
  const chat = resolveGiftLayoutCell({
    layout,
    variant: 'chat',
    device: 'desktop',
    area: 'viewport',
  });
  const live = resolveGiftLayoutCell({
    layout,
    variant: 'live_9_16',
    device: 'desktop',
    area: 'content',
  });
  const post = resolveGiftLayoutCell({
    layout,
    variant: 'publicaciones',
    device: 'mobile',
    area: 'content',
  });
  almost(chat.slot.x, 12, 'chat x');
  almost(live.slot.x, 88, 'live x independent');
  almost(post.slot.scale, 0.55, 'post scale independent');
  assert(chat.source === 'exact', 'chat exact');
  assert(giftLayoutVariantFor('live', { liveFormat: 'portrait916' }) === 'live_9_16', 'live variant');
  assert(giftLayoutVariantFor('call', { callKind: 'voice' }) === 'llamadas_voz', 'voice variant');
}

function testPreferredAreaKeepsBoth() {
  let layout = normalizeGiftLayout(undefined, 0.72);
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'live_9_16', device: 'desktop', area: 'content' },
    { x: 20, y: 20, scale: 0.5 },
  );
  layout = setGiftLayoutPreferredArea(layout, {
    variant: 'live_9_16',
    device: 'desktop',
    area: 'viewport',
  });
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'live_9_16', device: 'desktop', area: 'viewport' },
    { x: 90, y: 10, scale: 0.9 },
  );
  const content = resolveGiftLayoutCell({
    layout,
    variant: 'live_9_16',
    device: 'desktop',
    area: 'content',
  });
  const viewport = resolveGiftLayoutCell({
    layout,
    variant: 'live_9_16',
    device: 'desktop',
    area: 'viewport',
  });
  almost(content.slot.x, 20, 'content kept');
  almost(viewport.slot.x, 90, 'viewport independent');
  assert(viewport.area === 'viewport', 'preferred viewport');
}

function testResetAndCopyDoNotLeak() {
  let layout = normalizeGiftLayout(undefined, 0.72);
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'chat', device: 'mobile', area: 'content' },
    { x: 15, scale: 0.8 },
  );
  layout = patchGiftLayoutCell(
    layout,
    { variant: 'boom_clip', device: 'mobile', area: 'content' },
    { x: 70, scale: 1.2 },
  );
  layout = copyGiftLayoutActiveToDevices(layout, 'chat', 'mobile');
  almost(layout.variants?.chat?.devices?.desktop?.areas.content?.x || 0, 15, 'copy chat to desktop');
  almost(layout.variants?.boom_clip?.devices?.mobile?.areas.content?.x || 0, 70, 'boom clip untouched');
  layout = resetGiftLayoutCell(layout, { variant: 'chat', device: 'desktop', area: 'content' });
  const after = resolveGiftLayoutCell({
    layout,
    variant: 'chat',
    device: 'desktop',
    area: 'content',
  });
  assert(after.source !== 'exact', 'desktop chat reset');
  almost(layout.variants?.chat?.devices?.mobile?.areas.content?.x || 0, 15, 'mobile chat kept');
}

function testLegacyRoundtripKeepsVariants() {
  let layout = patchGiftLayoutCell(
    undefined,
    { variant: 'flash_boom', device: 'tablet', area: 'viewport' },
    { y: 22, scale: 0.66, fit: 'width' },
  );
  const saved = serializeGiftLayout(layout);
  const loaded = normalizeGiftLayout(saved);
  almost(loaded.variants?.flash_boom?.devices?.tablet?.areas.viewport?.y || 0, 22, 'variant persisted');
  const slot = resolveGiftLayoutSlot({
    layout: loaded,
    variant: 'flash_boom',
    device: 'tablet',
    area: 'viewport',
  });
  almost(slot.y, 22, 'resolve after load');
  assert(slot.fit === 'width', 'fit persisted');
}

testDefaults();
testIndependentSlots();
testCopy();
testDetect();
testResolveAndBleed();
testContainDoesNotStretch();
testAspectAvoidsSquareLetterbox();
testRoundtrip();
testScaleClamp();
testVariantsIndependent();
testPreferredAreaKeepsBoth();
testResetAndCopyDoNotLeak();
testLegacyRoundtripKeepsVariants();
console.log('giftLayout tests ok');
