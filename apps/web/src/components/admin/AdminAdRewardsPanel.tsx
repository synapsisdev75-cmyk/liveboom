import { BarChart3, Check, Copy, Pause, Pencil, Play, Plus, RefreshCw, ShieldAlert, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  adRewardsAdminApi,
  formatPoints,
  type AdActionType,
  type AdRewardsConfig,
  type AdSurface,
  type AdminCampaign,
  type AdminClaim,
  type AdminLead,
} from '../../lib/adRewardsApi';
import { fetchPublicUserByUsername } from '../../lib/profileFirestore';
import { uploadUserMedia } from '../../lib/storage';
import { useAuthStore } from '../../store/authStore';

const ACTION_IDS: AdActionType[] = [
  'VIEW_SHORT',
  'VIEW_FULL',
  'VIEW_LONG',
  'VISIT_PROFILE',
  'FOLLOW',
  'VIEW_FOLLOW',
  'COMMENT',
  'REGISTER',
  'DOWNLOAD_FORM',
  'PURCHASE',
];

const NEEDS_ACCOUNT: AdActionType[] = ['VISIT_PROFILE', 'FOLLOW', 'VIEW_FOLLOW'];
const EXTERNAL: AdActionType[] = ['REGISTER', 'DOWNLOAD_FORM', 'PURCHASE'];
const TIMED: AdActionType[] = ['VIEW_SHORT', 'VIEW_FULL', 'VIEW_LONG', 'VISIT_PROFILE', 'VIEW_FOLLOW'];

const STATUSES = ['BORRADOR', 'PROGRAMADA', 'ACTIVA', 'PAUSADA', 'FINALIZADA', 'AGOTADA', 'CANCELADA'];

const SURFACE_LABEL: Record<AdSurface, string> = {
  inicio: 'Inicio',
  explorar: 'Explorar (Para ti, Virales, Recientes)',
  clips: 'Boom Clips',
  flash: 'Flash Boom',
};

const STATUS_TONE: Record<string, string> = {
  ACTIVA: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  PROGRAMADA: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/30',
  PAUSADA: 'bg-amber-500/15 text-amber-300 ring-amber-300/30',
  AGOTADA: 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30',
  FINALIZADA: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
  CANCELADA: 'bg-zinc-500/15 text-zinc-400 ring-zinc-400/30',
  BORRADOR: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
};

const SIGNAL_LABEL: Record<string, string> = {
  AUTOMATION: 'Automatización',
  EMULATOR_SUSPECT: 'Posible emulador',
  ACCELERATED_PLAYBACK: 'Reproducción acelerada',
  SEEK_FORWARD: 'Adelantó el video',
  CLOCK_MANIPULATION: 'Reloj manipulado',
  FAST_BEATS: 'Latidos acelerados',
  MULTI_SESSION: 'Varias sesiones',
  MULTI_ACCOUNT_DEVICE: 'Varias cuentas en un dispositivo',
  SHARED_IP: 'Muchas cuentas en una IP',
  RAPID_CLAIMS: 'Reclamos muy seguidos',
  SIMILAR_COMMENT: 'Comentario parecido a otro',
};

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

type Draft = Partial<AdminCampaign> & { startAt?: string; endAt?: string; interestsText?: string };

function toLocalInput(ms?: number) {
  if (!ms) return '';
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(value?: string) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function emptyDraft(config: AdRewardsConfig | null): Draft {
  const action = config?.actions.VIEW_SHORT;
  return {
    name: '',
    advertiser: '',
    advertiserUsername: '',
    description: '',
    ctaLabel: '',
    imageUrl: '',
    videoUrl: '',
    linkUrl: '',
    actionType: 'VIEW_SHORT',
    points: action?.points ?? 50,
    minSeconds: action?.minSeconds ?? 45,
    budgetPoints: 100_000,
    maxActions: 0,
    maxParticipationsPerUser: 1,
    allowRecurrence: false,
    frequencyMinutes: config?.adIntervalMinutes ?? 10,
    country: '',
    city: '',
    ageMin: 18,
    ageMax: 100,
    gender: 'todos',
    interestsText: '',
    surfaces: ['inicio', 'explorar', 'clips', 'flash'],
    status: 'BORRADOR',
    autoPublish: true,
    startAt: '',
    endAt: '',
  };
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  'min-h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none';

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_TONE[status] || STATUS_TONE.BORRADOR}`}>
      {status}
    </span>
  );
}

function CampaignForm({
  initial,
  config,
  onClose,
  onSaved,
}: {
  initial: Draft;
  config: AdRewardsConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const profile = useAuthStore((s) => s.profile);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(initial.id);
  const actionType = (d.actionType || 'VIEW_SHORT') as AdActionType;
  const action = config?.actions[actionType];

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  function changeAction(next: AdActionType) {
    const a = config?.actions[next];
    setD((prev) => ({ ...prev, actionType: next, points: a?.points ?? prev.points, minSeconds: a?.minSeconds ?? prev.minSeconds }));
  }

  async function upload(file?: File | null) {
    if (!file || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
      const out = await uploadUserMedia(profile.firebaseUid, file, `ad-reward-${Date.now()}-${file.name || 'media'}`, 'public');
      if (isVideo) set('videoUrl', out.url);
      else set('imageUrl', out.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let advertiserUid = d.advertiserUid || '';
      const username = String(d.advertiserUsername || '').trim().replace(/^@/, '');
      if (username) {
        const user = await fetchPublicUserByUsername(username);
        if (!user) throw new Error(`No existe la cuenta @${username} en LiveBoom.`);
        advertiserUid = user.firebaseUid;
      } else {
        advertiserUid = '';
      }
      const payload: Partial<AdminCampaign> = {
        ...d,
        advertiserUsername: username,
        advertiserUid,
        startAtMs: fromLocalInput(d.startAt),
        endAtMs: fromLocalInput(d.endAt),
        interests: String(d.interestsText || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (editing && d.id) await adRewardsAdminApi.update(d.id, payload);
      else await adRewardsAdminApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const internalCop =
    config && d.budgetPoints ? Math.round((Number(d.budgetPoints) / config.pointsPerBlast) * config.copPerEarnedBlast) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(0,0,0,0.7)] sm:items-center" role="dialog" aria-modal="true">
      <div className="lb-panel relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 sm:rounded-3xl">
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h3 className="text-base font-bold text-white">{editing ? 'Editar campaña' : 'Nueva campaña'}</h3>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre de la campaña">
              <input className={inputCls} value={d.name || ''} onChange={(e) => set('name', e.target.value)} maxLength={90} />
            </Field>
            <Field label="Anunciante">
              <input className={inputCls} value={d.advertiser || ''} onChange={(e) => set('advertiser', e.target.value)} maxLength={90} />
            </Field>
            <Field
              label="Cuenta LiveBoom del anunciante"
              hint={NEEDS_ACCOUNT.includes(actionType) ? 'Obligatoria para visitar o seguir.' : 'Opcional.'}
            >
              <input className={inputCls} value={d.advertiserUsername || ''} onChange={(e) => set('advertiserUsername', e.target.value)} placeholder="@usuario" />
            </Field>
            <Field label="Enlace" hint={EXTERNAL.includes(actionType) ? 'Obligatorio: registro, descarga o compra.' : 'Opcional.'}>
              <input className={inputCls} value={d.linkUrl || ''} onChange={(e) => set('linkUrl', e.target.value)} placeholder="https://" />
            </Field>
          </div>

          <Field label="Descripción">
            <textarea className={`${inputCls} resize-none`} rows={3} value={d.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={600} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Imagen (URL)">
              <input className={inputCls} value={d.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Video (URL)">
              <input className={inputCls} value={d.videoUrl || ''} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://" />
            </Field>
            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 px-3 text-sm font-semibold text-cyan-200">
              <Upload size={14} /> Subir
              <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
          </div>
          {d.imageUrl || d.videoUrl ? (
            <div className="flex flex-wrap gap-2">
              {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-24 rounded-xl object-contain bg-black" /> : null}
              {d.videoUrl ? <video src={d.videoUrl} className="h-24 rounded-xl bg-black" muted playsInline controls /> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Tipo de acción">
              <select className={inputCls} value={actionType} onChange={(e) => changeAction(e.target.value as AdActionType)}>
                {ACTION_IDS.map((id) => (
                  <option key={id} value={id}>
                    {config?.actions[id]?.label || id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Puntos a entregar" hint={actionType === 'PURCHASE' && action ? `Entre ${action.minPoints} y ${action.maxPoints}` : undefined}>
              <input type="number" min={1} className={inputCls} value={d.points ?? ''} onChange={(e) => set('points', Number(e.target.value))} />
            </Field>
            <Field label="Tiempo mínimo (s)" hint={TIMED.includes(actionType) ? undefined : 'No aplica'}>
              <input
                type="number"
                min={0}
                disabled={!TIMED.includes(actionType)}
                className={inputCls}
                value={d.minSeconds ?? ''}
                onChange={(e) => set('minSeconds', Number(e.target.value))}
              />
            </Field>
            <Field label="Texto del botón">
              <input className={inputCls} value={d.ctaLabel || ''} onChange={(e) => set('ctaLabel', e.target.value)} maxLength={30} placeholder="Opcional" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Fecha de inicio">
              <input type="datetime-local" className={inputCls} value={d.startAt || ''} onChange={(e) => set('startAt', e.target.value)} />
            </Field>
            <Field label="Fecha final">
              <input type="datetime-local" className={inputCls} value={d.endAt || ''} onChange={(e) => set('endAt', e.target.value)} />
            </Field>
            <Field label="Presupuesto (puntos)" hint={internalCop ? `Costo interno: ${COP.format(internalCop)}` : undefined}>
              <input type="number" min={1} className={inputCls} value={d.budgetPoints ?? ''} onChange={(e) => set('budgetPoints', Number(e.target.value))} />
            </Field>
            <Field label="Máximo de acciones" hint="0 = sin tope">
              <input type="number" min={0} className={inputCls} value={d.maxActions ?? 0} onChange={(e) => set('maxActions', Number(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="País">
              <input className={inputCls} value={d.country || ''} onChange={(e) => set('country', e.target.value)} placeholder="Todos" />
            </Field>
            <Field label="Ciudad">
              <input className={inputCls} value={d.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="Todas" />
            </Field>
            <Field label="Edad">
              <div className="flex items-center gap-1.5">
                <input type="number" min={18} max={100} className={inputCls} value={d.ageMin ?? 18} onChange={(e) => set('ageMin', Number(e.target.value))} />
                <span className="text-zinc-500">–</span>
                <input type="number" min={18} max={100} className={inputCls} value={d.ageMax ?? 100} onChange={(e) => set('ageMax', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Género">
              <select className={inputCls} value={d.gender || 'todos'} onChange={(e) => set('gender', e.target.value as Draft['gender'])}>
                <option value="todos">Todos</option>
                <option value="mujer">Mujer</option>
                <option value="hombre">Hombre</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Intereses" hint="Separados por coma">
              <input className={inputCls} value={d.interestsText || ''} onChange={(e) => set('interestsText', e.target.value)} placeholder="música, moda" />
            </Field>
            <Field label="Frecuencia por usuario (min)" hint="Tiempo mínimo antes de volver a mostrarla">
              <input type="number" min={1} className={inputCls} value={d.frequencyMinutes ?? 10} onChange={(e) => set('frequencyMinutes', Number(e.target.value))} />
            </Field>
            <Field label="Participaciones por usuario">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  disabled={!d.allowRecurrence}
                  className={inputCls}
                  value={d.allowRecurrence ? d.maxParticipationsPerUser ?? 1 : 1}
                  onChange={(e) => set('maxParticipationsPerUser', Number(e.target.value))}
                />
                <label className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-zinc-300">
                  <input type="checkbox" checked={Boolean(d.allowRecurrence)} onChange={(e) => set('allowRecurrence', e.target.checked)} />
                  Recurrente
                </label>
              </div>
            </Field>
          </div>

          <Field label="Dónde se muestra">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SURFACE_LABEL) as AdSurface[]).map((s) => {
                const on = (d.surfaces || []).includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      set('surfaces', on ? (d.surfaces || []).filter((x) => x !== s) : [...(d.surfaces || []), s])
                    }
                    className={`min-h-10 rounded-full px-3 text-[12px] font-semibold ring-1 ${
                      on ? 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/40' : 'text-zinc-400 ring-white/10'
                    }`}
                  >
                    {SURFACE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <select className={inputCls} value={d.status || 'BORRADOR'} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Publicación automática" hint="Si está activa, la campaña programada se publica sola al llegar la fecha de inicio.">
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-zinc-200">
                <input type="checkbox" checked={d.autoPublish !== false} onChange={(e) => set('autoPublish', e.target.checked)} />
                Sí, publicar automáticamente
              </label>
            </Field>
          </div>
          {error ? <p className="rounded-xl bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,var(--lb-safe-bottom))]">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-zinc-200">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-5 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? 'Guardando…' : 'Guardar campaña'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function CampaignStats({ c }: { c: AdminCampaign }) {
  const s = c.stats || {};
  const rows: [string, number | string][] = [
    ['Impresiones', s.impressions || 0],
    ['Vistas iniciadas', s.viewsStarted || 0],
    ['Vistas completadas', s.viewsCompleted || 0],
    ['Tiempo promedio', `${c.avgViewSeconds || 0} s`],
    ['Clics', s.clicks || 0],
    ['Visitas al perfil', s.visits || 0],
    ['Seguidores', s.follows || 0],
    ['Comentarios', s.comments || 0],
    ['Registros', s.registrations || 0],
    ['Descargas / formularios', s.downloads || 0],
    ['Conversiones', s.conversions || 0],
    ['Usuarios únicos', s.uniqueUsers || 0],
    ['Puntos entregados', formatPoints(s.pointsDelivered || 0)],
    ['Puntos pendientes', formatPoints(s.pointsPending || 0)],
    ['Puntos rechazados', formatPoints(s.pointsRejected || 0)],
    ['Abandonos', s.abandoned || 0],
  ];
  return (
    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-white/5 px-2.5 py-1.5">
          <dt className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{label}</dt>
          <dd className="text-sm font-bold text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LeadsPanel({ campaign }: { campaign: AdminCampaign }) {
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    void adRewardsAdminApi
      .leads(campaign.id)
      .then((r) => setLeads(r.leads))
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : 'Error'));
  }, [campaign.id]);

  useEffect(load, [load]);

  async function confirm(code: string) {
    try {
      await adRewardsAdminApi.confirmLead(code);
      setMsg('Participación confirmada y puntos acreditados.');
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo confirmar');
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-3">
      <p className="text-[12px] text-zinc-400">
        El anunciante confirma con <code className="text-cyan-300">POST https://liveboomapp.com/api/rewards/webhooks/conversion</code>{' '}
        enviando <code>{'{ campaignId, ref }'}</code> y la cabecera <code>x-liveboom-signature</code> = HMAC-SHA256(llave,{' '}
        <code>campaignId.ref</code>). El parámetro <code>lb_ref</code> llega en el enlace.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-500">ID campaña: {campaign.id}</span>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[12px] text-zinc-200"
          onClick={() =>
            void adRewardsAdminApi
              .webhookSecret(campaign.id)
              .then((r) => setSecret(r.secret))
              .catch(() => setMsg('No se pudo leer la llave'))
          }
        >
          Ver llave del webhook
        </button>
        {secret ? (
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white/5 px-2.5 font-mono text-[11px] text-zinc-200"
            onClick={() => void navigator.clipboard?.writeText(secret)}
          >
            {secret.slice(0, 10)}… <Copy size={12} />
          </button>
        ) : null}
      </div>
      {msg ? <p className="text-[12px] text-cyan-200">{msg}</p> : null}
      {leads === null ? (
        <p className="text-[12px] text-zinc-500">Cargando participaciones…</p>
      ) : leads.length ? (
        <ul className="divide-y divide-white/5">
          {leads.map((l) => (
            <li key={l.code} className="flex flex-wrap items-center gap-2 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-white">@{l.user?.username || l.uid.slice(0, 8)}</span>
              <span className="font-mono text-zinc-500">{l.code.slice(0, 8)}</span>
              <span className="text-zinc-400">{new Date(l.createdAtMs).toLocaleString('es-CO')}</span>
              <span className="font-semibold text-zinc-200">{l.status}</span>
              {l.status === 'ABIERTO' ? (
                <button type="button" onClick={() => void confirm(l.code)} className="min-h-9 rounded-lg bg-emerald-500/15 px-2.5 font-semibold text-emerald-300">
                  Confirmar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-zinc-500">Aún no hay participaciones.</p>
      )}
    </div>
  );
}

function ConfigEditor({ config, onSaved }: { config: AdRewardsConfig; onSaved: () => void }) {
  const [c, setC] = useState<AdRewardsConfig>(config);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setC(config), [config]);

  function setNum<K extends keyof AdRewardsConfig>(key: K, value: string) {
    setC((prev) => ({ ...prev, [key]: Number(value) }));
  }

  function setAction(id: AdActionType, key: 'points' | 'minSeconds' | 'minPoints' | 'maxPoints' | 'enabled', value: number | boolean) {
    setC((prev) => ({ ...prev, actions: { ...prev.actions, [id]: { ...prev.actions[id], [key]: value } } }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await adRewardsAdminApi.saveConfig(c);
      setMsg('Configuración guardada.');
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">Variables del programa</h3>
        <label className="inline-flex items-center gap-2 text-[12px] text-zinc-300">
          <input type="checkbox" checked={c.enabled} onChange={(e) => setC((p) => ({ ...p, enabled: e.target.checked }))} />
          Programa activo
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="PUNTOS_POR_BLAST">
          <input type="number" min={1} className={inputCls} value={c.pointsPerBlast} onChange={(e) => setNum('pointsPerBlast', e.target.value)} />
        </Field>
        <Field label="INTERVALO_PUBLICIDAD (min)">
          <input type="number" min={1} className={inputCls} value={c.adIntervalMinutes} onChange={(e) => setNum('adIntervalMinutes', e.target.value)} />
        </Field>
        <Field label="Recompensas por día" hint="Entre 1 y 30">
          <input type="number" min={1} max={30} className={inputCls} value={c.dailyRewardLimit} onChange={(e) => setNum('dailyRewardLimit', e.target.value)} />
        </Field>
        <Field label="Seguimientos por día">
          <input type="number" min={1} className={inputCls} value={c.dailyFollowLimit} onChange={(e) => setNum('dailyFollowLimit', e.target.value)} />
        </Field>
        <Field label="Espera de seguimiento (h)">
          <input type="number" min={1} className={inputCls} value={c.followHoldHours} onChange={(e) => setNum('followHoldHours', e.target.value)} />
        </Field>
        <Field label="Cuentas por dispositivo">
          <input type="number" min={1} className={inputCls} value={c.maxAccountsPerDevice} onChange={(e) => setNum('maxAccountsPerDevice', e.target.value)} />
        </Field>
        <Field label="Cuentas por IP / día">
          <input type="number" min={1} className={inputCls} value={c.maxAccountsPerIp} onChange={(e) => setNum('maxAccountsPerIp', e.target.value)} />
        </Field>
        <Field label="COP por BLAST ganado" hint="Interno, nunca visible al usuario">
          <input type="number" min={0} className={inputCls} value={c.copPerEarnedBlast} onChange={(e) => setNum('copPerEarnedBlast', e.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-[12px]">
          <thead className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
            <tr>
              <th className="py-1.5 pr-2">Acción</th>
              <th className="py-1.5 pr-2">Puntos</th>
              <th className="py-1.5 pr-2">Tiempo (s)</th>
              <th className="py-1.5 pr-2">Activa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ACTION_IDS.map((id) => {
              const a = c.actions[id];
              return (
                <tr key={id}>
                  <td className="py-1.5 pr-2 text-zinc-200">{a.label}</td>
                  <td className="py-1.5 pr-2">
                    {id === 'PURCHASE' ? (
                      <div className="flex items-center gap-1">
                        <input type="number" className={`${inputCls} !min-h-9 w-24`} value={a.minPoints ?? 1000} onChange={(e) => setAction(id, 'minPoints', Number(e.target.value))} />
                        <span className="text-zinc-500">–</span>
                        <input type="number" className={`${inputCls} !min-h-9 w-24`} value={a.maxPoints ?? 5000} onChange={(e) => setAction(id, 'maxPoints', Number(e.target.value))} />
                      </div>
                    ) : (
                      <input type="number" className={`${inputCls} !min-h-9 w-24`} value={a.points} onChange={(e) => setAction(id, 'points', Number(e.target.value))} />
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {TIMED.includes(id) ? (
                      <input type="number" className={`${inputCls} !min-h-9 w-20`} value={a.minSeconds} onChange={(e) => setAction(id, 'minSeconds', Number(e.target.value))} />
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="checkbox" checked={a.enabled !== false} onChange={(e) => setAction(id, 'enabled', e.target.checked)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2">
        {msg ? <span className="text-[12px] text-cyan-200">{msg}</span> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-5 text-sm font-black text-white disabled:opacity-60"
        >
          {busy ? 'Guardando…' : 'Guardar variables'}
        </button>
      </div>
    </section>
  );
}

function AuditPanel() {
  const [status, setStatus] = useState<'SOSPECHOSO' | 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO'>('SOSPECHOSO');
  const [claims, setClaims] = useState<AdminClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setClaims(null);
    void adRewardsAdminApi
      .claims(status)
      .then((r) => setClaims(r.claims))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'));
  }, [status]);

  useEffect(load, [load]);

  async function resolve(id: string, decision: 'VALIDADO' | 'RECHAZADO') {
    try {
      await adRewardsAdminApi.resolve(id, decision);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['SOSPECHOSO', 'PENDIENTE', 'VALIDADO', 'RECHAZADO'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`min-h-10 rounded-full px-3 text-[12px] font-semibold ring-1 ${
              status === s ? 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/40' : 'text-zinc-400 ring-white/10'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-fuchsia-300">{error}</p> : null}
      {claims === null ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : claims.length ? (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/10 p-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">@{c.user?.username || c.uid.slice(0, 8)}</span>
                <span className="text-zinc-400">{c.campaignName}</span>
                <span className="text-zinc-400">· {c.actionLabel}</span>
                <span className="font-bold text-white">· {formatPoints(c.points)} pts</span>
                <span className="ml-auto text-[11px] text-zinc-500">{new Date(c.createdAtMs).toLocaleString('es-CO')}</span>
              </div>
              {c.signals?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.signals.map((s) => (
                    <span key={s} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-300/30">
                      {SIGNAL_LABEL[s] || s}
                    </span>
                  ))}
                </div>
              ) : null}
              {c.status === 'PENDIENTE' && c.validatesAtMs ? (
                <p className="mt-1 text-[11px] text-zinc-500">Se valida solo el {new Date(c.validatesAtMs).toLocaleString('es-CO')}</p>
              ) : null}
              {c.status === 'SOSPECHOSO' || c.status === 'PENDIENTE' ? (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void resolve(c.id, 'VALIDADO')} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-500/15 px-3 text-[12px] font-semibold text-emerald-300">
                    <Check size={13} /> Validar
                  </button>
                  <button type="button" onClick={() => void resolve(c.id, 'RECHAZADO')} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-fuchsia-500/15 px-3 text-[12px] font-semibold text-fuchsia-200">
                    <X size={13} /> Rechazar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No hay recompensas en este estado.</p>
      )}
    </section>
  );
}

export function AdminAdRewardsPanel() {
  const [view, setView] = useState<'resumen' | 'campanas' | 'auditoria'>('campanas');
  const [config, setConfig] = useState<AdRewardsConfig | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Draft | null>(null);
  const [openStats, setOpenStats] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, list] = await Promise.all([adRewardsAdminApi.overview(), adRewardsAdminApi.campaigns()]);
      setConfig(ov.config);
      setTotals(ov.totals);
      setCampaigns(list.campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(c: AdminCampaign, status: string) {
    try {
      await adRewardsAdminApi.setStatus(c.id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    }
  }

  const summary = useMemo(
    () => [
      ['Campañas activas', `${totals.active || 0} / ${totals.campaigns || 0}`],
      ['Puntos entregados', formatPoints(totals.pointsDelivered || 0)],
      ['Puntos pendientes', formatPoints(totals.pointsPending || 0)],
      ['BLAST convertidos', formatPoints(totals.blastConverted || 0)],
      ['Conversiones', formatPoints(totals.conversions || 0)],
      ['Pasivo interno', COP.format(totals.liabilityCop || 0)],
    ],
    [totals],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">Publicidad y recompensas</h2>
          <p className="text-[12px] text-zinc-500">Campañas Gana Puntos: puntos → BLAST ganados → retiro.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-zinc-300"
            aria-label="Actualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setForm(emptyDraft(config))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-4 text-sm font-black text-white"
          >
            <Plus size={15} /> Nueva campaña
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{label}</dt>
            <dd className="text-base font-black text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <nav className="flex flex-wrap gap-2">
        {(
          [
            ['campanas', 'Campañas'],
            ['auditoria', 'Auditoría antifraude'],
            ['resumen', 'Variables'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`min-h-10 rounded-full px-4 text-[13px] font-semibold ring-1 ${
              view === id ? 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/40' : 'text-zinc-400 ring-white/10'
            }`}
          >
            {id === 'auditoria' ? <ShieldAlert size={13} className="mr-1 inline" /> : null}
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className="rounded-xl bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-200">{error}</p> : null}

      {view === 'resumen' && config ? <ConfigEditor config={config} onSaved={() => void load()} /> : null}
      {view === 'auditoria' ? <AuditPanel /> : null}
      {view === 'campanas' ? (
        campaigns.length ? (
          <ul className="space-y-2.5">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded-2xl border border-white/10 p-3">
                <div className="flex flex-wrap items-start gap-3">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-black object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/5 text-[10px] text-zinc-500">Video</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-white">{c.name}</span>
                      <StatusPill status={c.effectiveStatus} />
                    </div>
                    <p className="text-[12px] text-zinc-400">
                      {c.advertiser} · {config?.actions[c.actionType]?.label || c.actionType} · {formatPoints(c.points)} pts
                    </p>
                    <p className="text-[12px] text-zinc-500">
                      Presupuesto {formatPoints(c.budgetPoints)} · entregado {formatPoints(c.awardedPoints)} · reservado{' '}
                      {formatPoints(c.reservedPoints)} · disponible {formatPoints(c.remainingPoints)} · costo interno{' '}
                      {COP.format(c.internalCostCop || 0)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOpenStats(openStats === c.id ? null : c.id)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[12px] text-zinc-200"
                    >
                      <BarChart3 size={13} /> Estadísticas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...c,
                          startAt: toLocalInput(c.startAtMs),
                          endAt: toLocalInput(c.endAtMs),
                          interestsText: (c.interests || []).join(', '),
                        })
                      }
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[12px] text-zinc-200"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                    {c.effectiveStatus === 'ACTIVA' ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(c, 'PAUSADA')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 text-[12px] font-semibold text-amber-300"
                      >
                        <Pause size={13} /> Pausar
                      </button>
                    ) : ['BORRADOR', 'PAUSADA', 'PROGRAMADA'].includes(c.effectiveStatus) ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(c, 'ACTIVA')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 text-[12px] font-semibold text-emerald-300"
                      >
                        <Play size={13} /> Publicar
                      </button>
                    ) : null}
                    {!['CANCELADA', 'FINALIZADA'].includes(c.effectiveStatus) ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(c, 'CANCELADA')}
                        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-[12px] text-zinc-400 hover:text-fuchsia-200"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
                {openStats === c.id ? (
                  <div className="mt-3 space-y-3">
                    <CampaignStats c={c} />
                    {EXTERNAL.includes(c.actionType) ? <LeadsPanel campaign={c} /> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            Aún no hay campañas. Crea la primera con «Nueva campaña».
          </p>
        ) : null
      ) : null}

      {form ? (
        <CampaignForm
          initial={form}
          config={config}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
