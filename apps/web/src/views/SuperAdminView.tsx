import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { logAdminAction } from '../lib/superAdminSecurity';
import { AdminUsersPanel } from '../components/admin/AdminUsersPanel';
import { AdminMessagesPanel } from '../components/admin/AdminMessagesPanel';
import { AdminCatalogPanel } from '../components/admin/AdminCatalogPanel';
import { AdminAdsPanel } from '../components/admin/AdminAdsPanel';
import { AdminVaultSecurityPanel } from '../components/admin/AdminVaultSecurityPanel';
import { AdminWithdrawalsPanel } from '../components/admin/AdminWithdrawalsPanel';
import { AdminVerificationPanel } from '../components/admin/AdminVerificationPanel';
import { CommunityHeaderEditor } from '../components/admin/CommunityHeaderEditor';
import { AdminDelegatePanel } from '../components/admin/AdminDelegatePanel';
import { AdminChangeRequestsPanel } from '../components/admin/AdminChangeRequestsPanel';
import {
  hasSuperAdminCapability,
  isOwnerEmail,
  type SuperAdminCapability,
  type SuperAdminGrants,
} from '../lib/superAdmin';
import { listenSuperAdmins } from '../lib/superAdminsFirestore';
import { useSuperAdminVaultStore } from '../store/superAdminVaultStore';
import { LevelAvatarFrame } from '../components/profile/LevelAvatarFrame';
import { LevelInsignia } from '../components/profile/LevelInsignia';
import {
  avatarLayoutFromTier,
  buildDefaultConfig,
  saveLevelsConfig,
  uploadLevelAsset,
  type LevelsConfigDoc,
  type RemoteTierConfig,
} from '../lib/levelsConfigFirestore';
import { useAuthStore } from '../store/authStore';
import { useLevelsConfigStore } from '../store/levelsConfigStore';

type AdminTab =
  | 'delegate'
  | 'levels'
  | 'users'
  | 'messages'
  | 'community'
  | 'gifts'
  | 'blast'
  | 'ads'
  | 'requests'
  | 'withdrawals'
  | 'verifications'
  | 'security';

const TAB_CAPABILITY: Partial<Record<AdminTab, SuperAdminCapability>> = {
  messages: 'messages',
  gifts: 'gifts',
  blast: 'blast',
  ads: 'ads',
  levels: 'levels',
  community: 'community',
  requests: 'requests',
  withdrawals: 'withdrawals',
  verifications: 'verification',
};

const ALL_TABS: AdminTab[] = [
  'users',
  'delegate',
  'messages',
  'gifts',
  'blast',
  'ads',
  'levels',
  'community',
  'requests',
  'withdrawals',
  'verifications',
  'security',
];

function tabFromLocation(pathname: string, searchTab: string | null): AdminTab | null {
  if (/withdrawal-verifications|verificaciones-retiro/.test(pathname)) return 'verifications';
  if (searchTab && ALL_TABS.includes(searchTab as AdminTab)) return searchTab as AdminTab;
  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-cyan-300">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </label>
  );
}

function NumRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1 text-xs text-zinc-400">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
      />
    </label>
  );
}

export function SuperAdminView() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const liveConfig = useLevelsConfigStore((s) => s.config);
  const liveTiers = useLevelsConfigStore((s) => s.tiers);
  const lockVault = useSuperAdminVaultStore((s) => s.lock);
  const owner = isOwnerEmail(profile?.email);
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [grants, setGrants] = useState<SuperAdminGrants>({});

  useEffect(() => {
    return listenSuperAdmins((doc) => {
      setAllowlist(doc?.emails ?? []);
      setGrants(doc?.grants ?? {});
    });
  }, []);

  const can = useCallback(
    (capability: SuperAdminCapability) =>
      hasSuperAdminCapability(profile?.email, capability, grants, allowlist),
    [profile?.email, grants, allowlist],
  );

  const tabAllowed = useCallback(
    (id: AdminTab) => {
      if (id === 'users' || id === 'delegate' || id === 'security') return owner;
      const cap = TAB_CAPABILITY[id];
      return cap ? can(cap) : false;
    },
    [owner, can],
  );

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<AdminTab>(
    () => tabFromLocation(location.pathname, searchParams.get('tab')) || (owner ? 'users' : 'messages'),
  );

  const goTab = useCallback(
    (id: AdminTab) => {
      setTab(id);
      const params = new URLSearchParams(searchParams);
      params.set('tab', id);
      navigate({ pathname: '/super-admin', search: `?${params.toString()}` }, { replace: true });
    },
    [navigate, searchParams],
  );

  useEffect(() => {
    const fromUrl = tabFromLocation(location.pathname, searchParams.get('tab'));
    if (fromUrl && fromUrl !== tab && tabAllowed(fromUrl)) {
      setTab(fromUrl);
      return;
    }
    if (tabAllowed(tab)) return;
    const fallback: AdminTab[] = owner
      ? ['users', 'delegate', 'messages', 'gifts', 'blast', 'ads', 'levels', 'community', 'requests', 'withdrawals', 'verifications', 'security']
      : ['messages', 'gifts', 'blast', 'ads', 'levels', 'community', 'requests', 'withdrawals', 'verifications'];
    const next = fallback.find((id) => tabAllowed(id));
    if (next) setTab(next);
  }, [tab, tabAllowed, owner, location.pathname, searchParams]);
  const [draft, setDraft] = useState<LevelsConfigDoc>(() => buildDefaultConfig());
  const [selectedTier, setSelectedTier] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'frame' | 'badge' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewXp, setPreviewXp] = useState(0);
  const levelsDirtyRef = useRef(false);

  useEffect(() => {
    if (levelsDirtyRef.current) return;
    if (liveConfig?.tiers?.length) {
      setDraft({
        version: liveConfig.version,
        tiers: liveTiers.map((t) => ({ ...t })),
      });
    }
  }, [liveConfig, liveTiers]);

  const tier = draft.tiers.find((t) => t.tier === selectedTier) ?? draft.tiers[0]!;

  const updateTier = useCallback((patch: Partial<RemoteTierConfig>) => {
    levelsDirtyRef.current = true;
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((row) => (row.tier === selectedTier ? { ...row, ...patch } : row)),
    }));
  }, [selectedTier]);

  const previewLayout = useMemo(() => avatarLayoutFromTier(tier), [tier]);

  const previewInsignia = useMemo(
    () => ({
      mobile: { width: tier.insigniaWidthMobile, height: tier.insigniaHeightMobile },
      desktop: { width: tier.insigniaWidthDesktop, height: tier.insigniaHeightDesktop },
    }),
    [tier],
  );

  async function handleUpload(kind: 'frame' | 'badge', file: File | null) {
    if (!file || !tier.slug) return;
    setUploading(kind);
    setMessage(null);
    try {
      const url = await uploadLevelAsset(tier.slug, kind, file);
      if (kind === 'frame') updateTier({ frameImageUrl: url });
      else updateTier({ badgeImageUrl: url });
      setMessage(`${kind === 'frame' ? 'Marco' : 'Insignia'} subido correctamente.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploading(null);
    }
  }

  async function handlePublish() {
    setSaving(true);
    setMessage(null);
    try {
      const nextVersion = Math.max(1, (liveConfig?.version ?? draft.version) + 1);
      await saveLevelsConfig({ ...draft, version: nextVersion }, profile?.email ?? 'super-admin');
      if (firebaseUser?.uid && profile?.email) {
        void logAdminAction({
          action: 'levels_publish',
          uid: firebaseUser.uid,
          email: profile.email,
          meta: { version: nextVersion },
        });
      }
      levelsDirtyRef.current = false;
      setDraft((prev) => ({ ...prev, version: nextVersion }));
      setMessage('Publicado en Firestore. Todos los usuarios verán los cambios al recargar.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error al publicar');
    } finally {
      setSaving(false);
    }
  }

  function handleResetDefaults() {
    levelsDirtyRef.current = true;
    setDraft(buildDefaultConfig());
    setMessage('Borrador restaurado a valores por defecto (sin publicar).');
  }

  return (
    <div className="lb-page mx-auto max-w-6xl space-y-4 pb-24 pt-2">
      <header className="lb-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-400">
            Super Admin
          </p>
          <h1 className="text-xl font-bold text-white">Panel Super Admin</h1>
          <p className="text-xs text-zinc-500">{profile?.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void lockVault(firebaseUser?.uid || profile?.id || null, profile?.email)
            }
            className="rounded-xl border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:border-amber-400"
          >
            Cerrar bóveda
          </button>
          <Link
            to="/perfil/editar"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Volver al perfil
          </Link>
          {tab === 'levels' ? (
            <>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Restaurar defaults
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handlePublish()}
                className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Publicando…' : 'Publicar en Firestore'}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ...(owner ? [{ id: 'delegate' as const, label: 'Delegar' }] : []),
            ...(owner ? [{ id: 'users' as const, label: 'Usuarios / XP' }] : []),
            ...(can('messages') ? [{ id: 'messages' as const, label: 'Mensajes' }] : []),
            ...(can('gifts') ? [{ id: 'gifts' as const, label: 'Regalos' }] : []),
            ...(can('blast') ? [{ id: 'blast' as const, label: 'Blast' }] : []),
            ...(can('ads') ? [{ id: 'ads' as const, label: 'Publicidad' }] : []),
            ...(can('levels') ? [{ id: 'levels' as const, label: 'Niveles / Marcos' }] : []),
            ...(can('community') ? [{ id: 'community' as const, label: 'Comunidad' }] : []),
            ...(can('requests') ? [{ id: 'requests' as const, label: 'Solicitudes' }] : []),
            ...(can('withdrawals') ? [{ id: 'withdrawals' as const, label: 'Solicitud de retiros' }] : []),
            ...(can('verification') ? [{ id: 'verifications' as const, label: 'Verificación de retiros' }] : []),
            ...(owner ? [{ id: 'security' as const, label: 'Seguridad' }] : []),
          ] as { id: AdminTab; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => goTab(id)}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === id
                ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          {message}
        </p>
      ) : null}

      {tab === 'delegate' && owner ? <AdminDelegatePanel /> : null}
      {tab === 'users' && owner ? <AdminUsersPanel /> : null}
      {tab === 'messages' && can('messages') ? <AdminMessagesPanel /> : null}
      {tab === 'gifts' && can('gifts') ? <AdminCatalogPanel modules={['gifts']} /> : null}
      {tab === 'blast' && can('blast') ? <AdminCatalogPanel modules={['coins']} /> : null}
      {tab === 'ads' && can('ads') ? <AdminAdsPanel /> : null}
      {tab === 'community' && can('community') ? <CommunityHeaderEditor /> : null}
      {tab === 'requests' && can('requests') ? <AdminChangeRequestsPanel /> : null}
      {tab === 'withdrawals' && can('withdrawals') ? <AdminWithdrawalsPanel /> : null}
      {tab === 'verifications' && can('verification') ? <AdminVerificationPanel /> : null}
      {tab === 'security' && owner ? <AdminVaultSecurityPanel /> : null}

      {tab === 'levels' && can('levels') ? (
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="lb-panel space-y-1 rounded-2xl p-2">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Niveles
          </p>
          {draft.tiers.map((row) => (
            <button
              key={row.tier}
              type="button"
              onClick={() => {
                setSelectedTier(row.tier);
                setPreviewXp(row.minXp);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                row.tier === selectedTier
                  ? 'bg-fuchsia-500/20 font-semibold text-fuchsia-200'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {row.title}
              <span className="mt-0.5 block text-[10px] text-zinc-500">
                {row.minXp}
                {row.maxXp != null ? ` – ${row.maxXp} XP` : '+ XP'}
              </span>
            </button>
          ))}
        </aside>

        <div className="space-y-4">
          {/* Vista previa — igual que perfil */}
          <section className="lb-panel rounded-2xl p-4 sm:p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Vista previa en vivo
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <LevelAvatarFrame
                levelXp={previewXp}
                avatarUrl={profile?.avatarUrl ?? null}
                fallbackLetter={profile?.handle ?? 'A'}
                size="2xl"
                previewFrameSrc={tier.frameImageUrl}
                previewAvatarLayout={previewLayout}
              />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{tier.title}</h2>
                    <p className="text-sm text-cyan-300">
                      {tier.minXp}
                      {tier.maxXp != null ? ` – ${tier.maxXp} XP` : '+ XP'}
                    </p>
                    <label className="mt-2 block text-xs text-zinc-500">
                      XP de prueba
                      <input
                        type="number"
                        value={previewXp}
                        min={0}
                        onChange={(e) => setPreviewXp(Number(e.target.value))}
                        className="mt-1 w-full max-w-[140px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white"
                      />
                    </label>
                  </div>
                  <LevelInsignia
                    levelXp={previewXp}
                    previewSrc={tier.badgeImageUrl}
                    previewSize={previewInsignia}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {/* XP y metadatos */}
            <section className="lb-panel space-y-3 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white">XP y nivel</h3>
              <label className="block space-y-1 text-xs text-zinc-400">
                Título
                <input
                  value={tier.title}
                  onChange={(e) => updateTier({ title: e.target.value.toUpperCase() })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                Slug (archivos)
                <input
                  value={tier.slug}
                  onChange={(e) =>
                    updateTier({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <NumRow
                  label="XP mínimo"
                  value={tier.minXp}
                  onChange={(v) => updateTier({ minXp: Math.max(0, v) })}
                />
                <NumRow
                  label="XP máximo (vacío = PRO)"
                  value={tier.maxXp ?? 0}
                  onChange={(v) => updateTier({ maxXp: v <= 0 ? null : v })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={tier.entryEffect}
                  onChange={(e) => updateTier({ entryEffect: e.target.checked })}
                  className="accent-cyan-400"
                />
                Efecto de entrada en live
              </label>
            </section>

            {/* Assets */}
            <section className="lb-panel space-y-3 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white">Imágenes</h3>
              <label className="block space-y-1 text-xs text-zinc-400">
                URL marco (PNG transparente)
                <input
                  value={tier.frameImageUrl}
                  onChange={(e) => updateTier({ frameImageUrl: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">Subir marco PNG</span>
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  disabled={uploading === 'frame'}
                  onChange={(e) => void handleUpload('frame', e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs text-zinc-400"
                />
              </label>
              <label className="block space-y-1 text-xs text-zinc-400">
                URL insignia
                <input
                  value={tier.badgeImageUrl}
                  onChange={(e) => updateTier({ badgeImageUrl: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">Subir insignia PNG</span>
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  disabled={uploading === 'badge'}
                  onChange={(e) => void handleUpload('badge', e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs text-zinc-400"
                />
              </label>
            </section>

            {/* Foto dentro del marco */}
            <section className="lb-panel space-y-3 rounded-2xl p-4 md:col-span-2">
              <h3 className="text-sm font-bold text-white">Foto dentro del marco (%)</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SliderRow
                  label="Top"
                  value={tier.avatarTop}
                  min={0}
                  max={40}
                  onChange={(v) => updateTier({ avatarTop: clamp(v, 0, 40) })}
                />
                <SliderRow
                  label="Left"
                  value={tier.avatarLeft}
                  min={0}
                  max={40}
                  onChange={(v) => updateTier({ avatarLeft: clamp(v, 0, 40) })}
                />
                <SliderRow
                  label="Ancho"
                  value={tier.avatarWidth}
                  min={30}
                  max={90}
                  onChange={(v) => updateTier({ avatarWidth: clamp(v, 30, 90) })}
                />
                <SliderRow
                  label="Alto"
                  value={tier.avatarHeight}
                  min={30}
                  max={90}
                  onChange={(v) => updateTier({ avatarHeight: clamp(v, 30, 90) })}
                />
              </div>
            </section>

            {/* Insignia */}
            <section className="lb-panel space-y-3 rounded-2xl p-4 md:col-span-2">
              <h3 className="text-sm font-bold text-white">Tamaño insignia (px)</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <NumRow
                  label="Ancho móvil"
                  value={tier.insigniaWidthMobile}
                  onChange={(v) => updateTier({ insigniaWidthMobile: clamp(v, 40, 200) })}
                />
                <NumRow
                  label="Alto móvil"
                  value={tier.insigniaHeightMobile}
                  onChange={(v) => updateTier({ insigniaHeightMobile: clamp(v, 40, 240) })}
                />
                <NumRow
                  label="Ancho desktop"
                  value={tier.insigniaWidthDesktop}
                  onChange={(v) => updateTier({ insigniaWidthDesktop: clamp(v, 40, 240) })}
                />
                <NumRow
                  label="Alto desktop"
                  value={tier.insigniaHeightDesktop}
                  onChange={(v) => updateTier({ insigniaHeightDesktop: clamp(v, 40, 280) })}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
      ) : null}

      <p className="text-center text-[10px] text-zinc-600">
        Ruta secreta: /super-admin · v{draft.version} en borrador · v{liveConfig?.version ?? '—'} en
        producción
      </p>
    </div>
  );
}
