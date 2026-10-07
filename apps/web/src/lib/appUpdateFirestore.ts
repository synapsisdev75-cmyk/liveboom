import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeAppUpdateConfig, type AppUpdateConfig, type PlatformRelease } from './appUpdatePolicy';

const DOC_PATH = 'config/appUpdate';

export function listenAppUpdateConfig(onChange: (config: AppUpdateConfig) => void): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    (snap) => onChange(normalizeAppUpdateConfig(snap.exists() ? snap.data() : undefined)),
    () => undefined,
  );
}

function releaseForFirestore(release: PlatformRelease): Record<string, unknown> {
  return {
    latestVersion: release.latestVersion,
    latestBuild: release.latestBuild,
    minBuild: release.minBuild,
    storeUrl: release.storeUrl,
    notes: release.notes,
  };
}

export async function saveAppUpdateConfig(config: AppUpdateConfig, updatedBy: string): Promise<void> {
  const normalized = normalizeAppUpdateConfig(config);
  await setDoc(doc(db, DOC_PATH), {
    android: releaseForFirestore(normalized.android),
    ios: releaseForFirestore(normalized.ios),
    updatedBy: updatedBy || 'super-admin',
    updatedAt: serverTimestamp(),
  });
}
