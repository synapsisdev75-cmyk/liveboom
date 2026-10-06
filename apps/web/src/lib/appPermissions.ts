import { Capacitor, registerPlugin } from '@capacitor/core';

export type AppPermissionName = 'camera' | 'microphone' | 'location' | 'preciseLocation';
/** blocked = el sistema ya no muestra el diálogo ("no volver a preguntar" o bloqueado en el navegador). */
export type AppPermissionState = 'granted' | 'prompt' | 'denied' | 'blocked' | 'unknown';

type PermissionsPlugin = {
  check: (opts: { permission: AppPermissionName }) => Promise<{ state: AppPermissionState }>;
  markRequested: (opts: { permission: AppPermissionName }) => Promise<void>;
  openAppSettings: () => Promise<void>;
};

const NativePermissions = registerPlugin<PermissionsPlugin>('LiveBoomPermissions');

function nativePluginAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LiveBoomPermissions');
  } catch {
    return false;
  }
}

/** Solo consulta: nunca abre el diálogo del sistema. */
export async function checkAppPermission(name: AppPermissionName): Promise<AppPermissionState> {
  if (nativePluginAvailable()) {
    try {
      return (await NativePermissions.check({ permission: name })).state;
    } catch {
      return 'unknown';
    }
  }
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  const webName = name === 'camera' ? 'camera' : name === 'microphone' ? 'microphone' : 'geolocation';
  try {
    const status = await navigator.permissions.query({ name: webName as PermissionName });
    // En el navegador "denied" ya no vuelve a preguntar: se trata como bloqueado.
    return status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'blocked' : 'prompt';
  } catch {
    return 'unknown';
  }
}

/** Avisar tras mostrar la solicitud del sistema (permite detectar "no volver a preguntar"). */
export function markAppPermissionRequested(name: AppPermissionName) {
  if (!nativePluginAvailable()) return;
  void NativePermissions.markRequested({ permission: name }).catch(() => undefined);
}

export function canOpenAppSettings(): boolean {
  return nativePluginAvailable();
}

export async function openAppSettings(): Promise<boolean> {
  if (!nativePluginAvailable()) return false;
  try {
    await NativePermissions.openAppSettings();
    return true;
  } catch {
    return false;
  }
}
