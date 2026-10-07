import { Capacitor } from '@capacitor/core';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listenAppUpdateConfig } from '../../lib/appUpdateFirestore';
import {
  APP_UPDATE_SNOOZE_MS,
  decideAppUpdate,
  type AppStorePlatform,
  type AppUpdateConfig,
  type AppUpdateSnooze,
  type PlatformRelease,
} from '../../lib/appUpdatePolicy';

const SNOOZE_KEY = 'liveboom:app-update-snooze';

function storePlatform(): AppStorePlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

function readSnooze(): AppUpdateSnooze | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null') as Partial<AppUpdateSnooze> | null;
    return raw && typeof raw.build === 'number' && typeof raw.until === 'number'
      ? { build: raw.build, until: raw.until }
      : null;
  } catch {
    return null;
  }
}

/** Durante un directo el aviso opcional espera; el obligatorio sale siempre. */
function isLivePath(pathname: string) {
  return pathname.startsWith('/stream/') || pathname.startsWith('/transmitir');
}

/** Aviso en Android / iOS cuando la tienda ya tiene una versión más nueva que la instalada. */
export function AppUpdatePrompt() {
  const [platform] = useState(storePlatform);
  const { pathname } = useLocation();
  const [installed, setInstalled] = useState<{ build: number; version: string } | null>(null);
  const [config, setConfig] = useState<AppUpdateConfig | null>(null);
  const [snooze, setSnooze] = useState(readSnooze);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!platform) return;
    let cancelled = false;
    let removeResume: (() => void) | null = null;
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const info = await App.getInfo();
        if (cancelled) return;
        setInstalled({ build: Number(info.build) || 0, version: info.version });
        const handle = await App.addListener('resume', () => setNow(Date.now()));
        if (cancelled) void handle.remove();
        else removeResume = () => void handle.remove();
      })
      .catch(() => undefined);
    const unsubscribe = listenAppUpdateConfig(setConfig);
    return () => {
      cancelled = true;
      removeResume?.();
      unsubscribe();
    };
  }, [platform]);

  if (!platform || !config || !installed) return null;
  const decision = decideAppUpdate(config[platform], installed.build, snooze, now);
  if (decision.kind === 'none') return null;
  if (decision.kind === 'optional' && isLivePath(pathname)) return null;

  const { release } = decision;

  function later() {
    const next = { build: release.latestBuild, until: Date.now() + APP_UPDATE_SNOOZE_MS };
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: se pospone solo en esta sesión */
    }
    setSnooze(next);
  }

  return (
    <AppUpdateDialog
      platform={platform}
      release={release}
      installedVersion={installed.version}
      required={decision.kind === 'required'}
      onLater={later}
      onUpdate={() => window.location.assign(release.storeUrl)}
    />
  );
}

export function AppUpdateDialog({
  platform,
  release,
  installedVersion,
  required,
  onLater,
  onUpdate,
}: {
  platform: AppStorePlatform;
  release: PlatformRelease;
  installedVersion: string;
  required: boolean;
  onLater: () => void;
  onUpdate: () => void;
}) {
  const store = platform === 'ios' ? 'App Store' : 'Google Play';
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[rgba(0,0,0,0.6)] backdrop-blur-sm sm:items-center"
      style={{
        paddingTop: 'max(1rem, var(--lb-safe-top))',
        paddingBottom: 'max(1rem, var(--lb-safe-bottom))',
        paddingLeft: 'max(0.75rem, var(--lb-safe-left))',
        paddingRight: 'max(0.75rem, var(--lb-safe-right))',
      }}
      onClick={required ? undefined : onLater}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lb-app-update-title"
        aria-describedby="lb-app-update-body"
        className="flex max-h-full w-full max-w-[min(26rem,100%)] flex-col overflow-y-auto rounded-3xl border p-5 shadow-2xl"
        style={{ background: 'var(--lb-surface)', borderColor: 'var(--lb-line)', color: 'var(--lb-text)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
            style={{ background: 'linear-gradient(135deg, var(--lb-accent-primary), var(--lb-accent-secondary))' }}
            aria-hidden
          >
            <Download size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="lb-app-update-title" className="text-lg font-bold leading-tight">
              {required ? 'Actualiza LiveBoom para continuar' : 'Nueva versión de LiveBoom'}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--lb-text-muted)' }}>
              {release.latestVersion ? `Versión ${release.latestVersion}` : 'Versión nueva'}
              {installedVersion ? ` · tienes la ${installedVersion}` : ''}
            </p>
          </div>
        </div>

        <p id="lb-app-update-body" className="mt-4 text-sm leading-relaxed">
          {required
            ? `Esta versión ya no es compatible. Descarga la actualización en ${store} para seguir usando LiveBoom.`
            : `Ya está disponible en ${store}. Actualiza para tener las últimas mejoras.`}
        </p>
        {release.notes ? (
          <p
            className="mt-3 whitespace-pre-line rounded-2xl px-3 py-2.5 text-sm leading-relaxed"
            style={{ background: 'var(--lb-surface-2)', color: 'var(--lb-text-muted)' }}
          >
            {release.notes}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {required ? null : (
            <button
              type="button"
              onClick={onLater}
              className="min-h-11 rounded-2xl border px-4 text-sm font-semibold"
              style={{ borderColor: 'var(--lb-line)', color: 'var(--lb-text)' }}
            >
              Más tarde
            </button>
          )}
          <button
            type="button"
            onClick={onUpdate}
            className="min-h-11 rounded-2xl px-5 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(90deg, var(--lb-accent-primary), var(--lb-accent-secondary))' }}
          >
            Actualizar en {store}
          </button>
        </div>
      </div>
    </div>
  );
}
