const { asFn } = require('../lib/asFn');
const { hasAdminCredentials, getAdminDb } = require('../lib/firestoreAdmin');

const router = require('express').Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

const jobs = new Map();
const timers = new Map();

const STAGES = [
  'Analizando fotografías',
  'Alineando cámaras',
  'Calculando profundidad',
  'Reconstruyendo geometría',
  'Generando textura',
  'Optimizando modelo',
];

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job) {
  return {
    id: job.id,
    userId: job.userId,
    status: job.status,
    captureCount: job.captureCount,
    progress: job.progress,
    stage: job.stage || '',
    sourceImages: job.sourceImages || [],
    previewImage: job.previewImage || null,
    modelUrl: job.modelUrl || null,
    optimizedModelUrl: job.optimizedModelUrl || null,
    videoRenderUrl: job.videoRenderUrl || null,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function persist(job) {
  if (!hasAdminCredentials()) return;
  try {
    const db = getAdminDb();
    await db
      .collection('threeDReconstructions')
      .doc(job.id)
      .set(
        {
          ...publicJob(job),
          updatedAt: nowIso(),
        },
        { merge: true },
      );
  } catch (error) {
    console.warn('[reconstructions] persist skipped', error.message);
  }
}

function stopTimer(id) {
  const timer = timers.get(id);
  if (timer) clearInterval(timer);
  timers.delete(id);
}

function startProcessing(job) {
  stopTimer(job.id);
  job.status = 'processing';
  job.progress = Math.max(1, Number(job.progress) || 0);
  job.stage = STAGES[0];
  job.updatedAt = nowIso();
  const timer = setInterval(() => {
    if (job.status !== 'processing') {
      stopTimer(job.id);
      return;
    }
    job.progress = Math.min(100, job.progress + 7);
    const index = Math.min(STAGES.length - 1, Math.floor((job.progress / 100) * STAGES.length));
    job.stage = STAGES[index];
    job.updatedAt = nowIso();
    if (job.progress >= 100) {
      job.status = 'ready';
      job.stage = STAGES[STAGES.length - 1];
      stopTimer(job.id);
    }
    void persist(job);
  }, 450);
  timers.set(job.id, timer);
}

function requireJob(req, res) {
  const job = jobs.get(String(req.params.id || ''));
  if (!job || job.userId !== req.user.uid) {
    res.status(404).json({ error: 'Reconstrucción no encontrada' });
    return null;
  }
  return job;
}

router.post('/', requireAuth, async (req, res) => {
  const id = String(req.body?.id || '').trim() || `r3d_${Date.now().toString(36)}`;
  const existing = jobs.get(id);
  if (existing && existing.userId !== req.user.uid) {
    res.status(409).json({ error: 'El trabajo ya existe' });
    return;
  }
  const job = existing || {
    id,
    userId: req.user.uid,
    status: 'draft',
    captureCount: 0,
    progress: 0,
    stage: '',
    sourceImages: [],
    previewImage: null,
    modelUrl: null,
    optimizedModelUrl: null,
    videoRenderUrl: null,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.set(id, job);
  await persist(job);
  res.json(publicJob(job));
});

router.get('/:id', requireAuth, (req, res) => {
  const job = requireJob(req, res);
  if (!job) return;
  res.json(publicJob(job));
});

router.post('/:id/images', requireAuth, (req, res) => {
  const job = requireJob(req, res);
  if (!job) return;
  job.captureCount = Math.max(0, Math.floor(Number(req.body?.captureCount) || job.captureCount));
  job.status = 'uploading';
  job.updatedAt = nowIso();
  void persist(job);
  res.json(publicJob(job));
});

router.post('/:id/process', requireAuth, (req, res) => {
  const job = requireJob(req, res);
  if (!job) return;
  startProcessing(job);
  void persist(job);
  res.json(publicJob(job));
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const job = requireJob(req, res);
  if (!job) return;
  stopTimer(job.id);
  job.status = 'cancelled';
  job.updatedAt = nowIso();
  void persist(job);
  res.json(publicJob(job));
});

router.delete('/:id', requireAuth, (req, res) => {
  const job = requireJob(req, res);
  if (!job) return;
  stopTimer(job.id);
  jobs.delete(job.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.router = router;
module.exports.default = router;
