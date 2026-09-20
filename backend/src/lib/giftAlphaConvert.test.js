const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  safeGiftId,
  safeGiftSourcePath,
  pixFmtHasAlpha,
  probeReportsAlpha,
  probeHasAudio,
  streamIsAudio,
  classifyProRes,
  inspectProbe,
  parseFfmpegProgress,
  parseSignalStats,
  classifyAlphaSamples,
  LIMITS,
  OPAQUE_ALPHA_WARNING,
  storagePathFromGiftUrl,
} = require('./giftAlphaConvert');

describe('conversión MOV ProRes 4444 → WebM', () => {
  it('rechaza rutas y regalos inseguros', () => {
    assert.equal(safeGiftSourcePath('config/gifts/besito-video.mov'), 'config/gifts/besito-video.mov');
    assert.equal(safeGiftSourcePath('config/gifts/../secret.mov'), null);
    assert.equal(safeGiftSourcePath('admin/private/gifts/x.mov'), null);
    assert.equal(safeGiftSourcePath('config/gifts/x.webm'), null);
    assert.equal(safeGiftId('besito'), 'besito');
    assert.equal(safeGiftId('../flor'), null);
    assert.equal(safeGiftId(''), null);
  });

  it('extrae la ruta de Storage desde URLs públicas o gs://', () => {
    assert.equal(
      storagePathFromGiftUrl(
        'https://firebasestorage.googleapis.com/v0/b/liveboom-app.firebasestorage.app/o/config%2Fgifts%2Fbotas_llaneras-video-1.webm?alt=media&token=abc',
      ),
      'config/gifts/botas_llaneras-video-1.webm',
    );
    assert.equal(
      storagePathFromGiftUrl('gs://liveboom-app.firebasestorage.app/config/gifts/botas_llaneras-video-1.webm'),
      'config/gifts/botas_llaneras-video-1.webm',
    );
    assert.equal(storagePathFromGiftUrl('/gifts/besito.webm'), null);
    assert.equal(storagePathFromGiftUrl('config/gifts/botas_llaneras-video-1.webm'), 'config/gifts/botas_llaneras-video-1.webm');
  });

  it('detecta alfa por formato de píxel, no por el nombre 4444', () => {
    assert.equal(pixFmtHasAlpha('yuva444p10le'), true);
    assert.equal(pixFmtHasAlpha('yuva420p'), true);
    assert.equal(pixFmtHasAlpha('yuv420p'), false);
    assert.equal(pixFmtHasAlpha('yuv422p10le'), false);
  });

  it('reconoce alfa de WebM VP9 aunque pix_fmt sea yuv420p', () => {
    assert.equal(
      probeReportsAlpha({
        streams: [{ codec_type: 'video', codec_name: 'vp9', pix_fmt: 'yuv420p', tags: { ALPHA_MODE: '1' } }],
      }),
      true,
    );
    assert.equal(
      probeReportsAlpha({
        streams: [
          { codec_type: 'video', codec_name: 'vp9', pix_fmt: 'yuv420p' },
          { codec_type: 'video', codec_name: 'vp9', pix_fmt: 'gray' },
        ],
      }),
      true,
    );
    assert.equal(
      probeReportsAlpha({
        streams: [{ codec_type: 'video', codec_name: 'vp9', pix_fmt: 'yuv420p' }],
      }),
      false,
    );
  });

  it('detecta pista de audio aunque el códec sea PCM de ProRes', () => {
    assert.equal(streamIsAudio({ codec_type: 'audio', codec_name: 'pcm_s24le' }), true);
    assert.equal(streamIsAudio({ codec_type: 'video', codec_name: 'prores' }), false);
    assert.equal(
      probeHasAudio({
        streams: [
          { codec_type: 'video', codec_name: 'vp9' },
          { codec_type: 'audio', codec_name: 'opus' },
        ],
      }),
      true,
    );
    assert.equal(probeHasAudio({ streams: [{ codec_type: 'video', codec_name: 'vp9' }] }), false);
  });

  it('distingue ProRes 4444 y 4444 XQ por etiqueta y perfil', () => {
    assert.equal(classifyProRes({ codec_name: 'prores', codec_tag_string: 'ap4h' }).profile, '4444');
    assert.equal(classifyProRes({ codec_name: 'prores', codec_tag_string: 'ap4x' }).profile, '4444XQ');
    assert.equal(classifyProRes({ codec_name: 'prores', profile: 4 }).ok, true);
    assert.equal(classifyProRes({ codec_name: 'prores', profile: 5 }).profile, '4444XQ');
    assert.equal(classifyProRes({ codec_name: 'h264' }).ok, false);
  });

  it('inspecciona el contenido y no infiere alfa por extensión', () => {
    const withAlpha = inspectProbe({
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '2.5' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'prores',
          codec_tag_string: 'ap4h',
          profile: '4444',
          pix_fmt: 'yuva444p10le',
          width: 1080,
          height: 1080,
          duration: '2.5',
        },
      ],
    });
    assert.equal(withAlpha.isProRes4444, true);
    assert.equal(withAlpha.hasAlphaChannel, true);
    assert.equal(withAlpha.hasAudio, false);
    assert.equal(withAlpha.error, null);

    const withPcmAudio = inspectProbe({
      format: { format_name: 'mov', duration: '2' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'prores',
          codec_tag_string: 'ap4h',
          pix_fmt: 'yuva444p10le',
          width: 720,
          height: 720,
          duration: '2',
        },
        { codec_type: 'audio', codec_name: 'pcm_s24le', duration: '2' },
      ],
    });
    assert.equal(withPcmAudio.hasAudio, true);

    const named4444ButNoAlpha = inspectProbe({
      format: { format_name: 'mov', duration: '1' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'prores',
          codec_tag_string: 'apch',
          pix_fmt: 'yuv422p10le',
          width: 720,
          height: 720,
          duration: '1',
        },
      ],
    });
    assert.equal(named4444ButNoAlpha.hasAlphaChannel, false);
    assert.equal(named4444ButNoAlpha.isProRes4444, false);

    const tooLong = inspectProbe({
      format: { format_name: 'mov', duration: String(LIMITS.maxDurationSec + 5) },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'prores',
          codec_tag_string: 'ap4h',
          pix_fmt: 'yuva444p10le',
          width: 100,
          height: 100,
          duration: String(LIMITS.maxDurationSec + 5),
        },
      ],
    });
    assert.match(String(tooLong.error), /supera/);
  });

  it('el progreso sale de out_time de FFmpeg, no de un temporizador', () => {
    const half = parseFfmpegProgress('out_time_us=5000000\nprogress=continue\n', 10);
    assert.equal(half.percent, 50);
    assert.equal(half.indeterminate, false);
    const unknown = parseFfmpegProgress('progress=continue\n', 0);
    assert.equal(unknown.percent, null);
    assert.equal(unknown.indeterminate, true);
    const cap = parseFfmpegProgress('out_time_us=20000000\nprogress=end\n', 10);
    assert.equal(cap.percent, 99);
  });

  it('clasifica alfa opaco vs utilizable con muestras de fotogramas', () => {
    const opaque = classifyAlphaSamples(parseSignalStats('lavfi.signalstats.YMIN=255\nlavfi.signalstats.YMAX=255\n'));
    assert.equal(opaque.opaque, true);
    assert.equal(opaque.usable, false);
    const usable = classifyAlphaSamples(
      parseSignalStats('lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\nlavfi.signalstats.YAVERAGE=80\n'),
    );
    assert.equal(usable.usable, true);
    assert.equal(usable.opaque, false);
    assert.match(OPAQUE_ALPHA_WARNING, /transparencia utilizable/);
  });
});
