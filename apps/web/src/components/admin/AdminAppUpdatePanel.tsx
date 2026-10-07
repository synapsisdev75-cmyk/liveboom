import { useEffect, useState } from 'react';
import { listenAppUpdateConfig, saveAppUpdateConfig } from '../../lib/appUpdateFirestore';
import {
  DEFAULT_STORE_URL,
  normalizeAppUpdateConfig,
  type AppStorePlatform,
  type AppUpdateConfig,
  type PlatformRelease,
} from '../../lib/appUpdatePolicy';
import { useAuthStore } from '../../store/authStore';

const PLATFORMS: Array<{ id: AppStorePlatform; label: string; buildLabel: string }> = [
  { id: 'android', label: 'Android · Google Play', buildLabel: 'versionCode' },
  { id: 'ios', label: 'iOS · App Store', buildLabel: 'Build (CFBundleVersion)' },
];

const inputClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 text-sm text-white';

function buildInput(value: number) {
  return value > 0 ? String(value) : '';
}

export function AdminAppUpdatePanel() {
  const email = useAuthStore((state) => state.firebaseUser?.email ?? '');
  const [remote, setRemote] = useState<AppUpdateConfig | null>(null);
  const [draft, setDraft] = useState<AppUpdateConfig>(() => normalizeAppUpdateConfig(undefined));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => listenAppUpdateConfig(setRemote), []);
  useEffect(() => {
    if (remote && !dirty) setDraft(remote);
  }, [remote, dirty]);

  function patch(platform: AppStorePlatform, next: Partial<PlatformRelease>) {
    setNotice(null);
    setDirty(true);
    setDraft((prev) => ({ ...prev, [platform]: { ...prev[platform], ...next } }));
  }

  const invalid = PLATFORMS.some(({ id }) => draft[id].minBuild > draft[id].latestBuild);

  async function publish() {
    if (invalid) {
      setNotice({ kind: 'error', text: 'La versión mínima no puede ser mayor que la publicada.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await saveAppUpdateConfig(draft, email);
      setDirty(false);
      setNotice({ kind: 'ok', text: 'Publicado. Los usuarios con una versión anterior verán el aviso al abrir la app.' });
    } catch {
      setNotice({ kind: 'error', text: 'No se pudo guardar. Abre la bóveda de nuevo e inténtalo otra vez.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lb-panel flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white">Actualización de la app</h2>
          <p className="text-xs text-zinc-500">
            Cuando la tienda ya aprobó una versión nueva, escribe aquí su número de compilación. Quien tenga una
            anterior verá un aviso para ir a la tienda; con «Mínima obligatoria» no podrá seguir usando la app hasta
            actualizar. Deja la compilación vacía para no mostrar aviso.
          </p>
        </div>
        {dirty ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDirty(false);
              if (remote) setDraft(remote);
              setNotice(null);
            }}
            className="min-h-11 rounded-xl bg-zinc-800/70 px-4 text-sm font-semibold text-zinc-300 disabled:opacity-50"
          >
            Descartar
          </button>
        ) : null}
        <button
          type="button"
          disabled={!remote || !dirty || saving}
          onClick={() => void publish()}
          className="min-h-11 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Publicando…' : 'Guardar y publicar'}
        </button>
      </div>

      {notice ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.kind === 'ok'
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              : 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map(({ id, label, buildLabel }) => {
          const release = draft[id];
          const minTooHigh = release.minBuild > release.latestBuild;
          return (
            <section key={id} className="lb-panel min-w-0 space-y-3 rounded-2xl p-4">
              <div>
                <h3 className="font-bold text-white">{label}</h3>
                <p className="text-xs text-zinc-500">
                  {release.latestBuild > 0
                    ? `Avisa a quien tenga compilación menor a ${release.latestBuild}${
                        release.minBuild > 0 ? `; obligatorio por debajo de ${release.minBuild}` : ''
                      }.`
                    : 'Sin aviso activo.'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-300">Versión (ej. 1.0.63)</span>
                  <input
                    value={release.latestVersion}
                    maxLength={32}
                    onChange={(event) => patch(id, { latestVersion: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-zinc-300">Compilación publicada · {buildLabel}</span>
                  <input
                    inputMode="numeric"
                    value={buildInput(release.latestBuild)}
                    onChange={(event) => patch(id, { latestBuild: Number(event.target.value.replace(/\D/g, '')) || 0 })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-zinc-300">Mínima obligatoria (vacío = nunca obligatorio)</span>
                  <input
                    inputMode="numeric"
                    value={buildInput(release.minBuild)}
                    aria-invalid={minTooHigh}
                    onChange={(event) => patch(id, { minBuild: Number(event.target.value.replace(/\D/g, '')) || 0 })}
                    className={`${inputClass} ${minTooHigh ? 'border-fuchsia-500' : ''}`}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-zinc-300">Enlace de la tienda</span>
                  <input
                    type="url"
                    value={release.storeUrl}
                    placeholder={DEFAULT_STORE_URL[id]}
                    onChange={(event) => patch(id, { storeUrl: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-zinc-300">Novedades (opcional)</span>
                  <textarea
                    value={release.notes}
                    maxLength={400}
                    rows={3}
                    onChange={(event) => patch(id, { notes: event.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
