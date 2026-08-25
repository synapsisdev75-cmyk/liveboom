import * as deepar from 'deepar';
import type { DeepAR } from 'deepar';

/** Clave de licencia DeepAR (dominio www.liveboomapp.com en el portal). */
export const DEEPAR_LICENSE_KEY =
  import.meta.env.VITE_DEEPAR_LICENSE_KEY ||
  'd5d6cd0be12cdbe42077cea0ce920c964eb26f24125fa5c29f29a81f5b7fc63500d5955d851b94e5';

/** Misma versión que el paquete npm para wasm/modelos desde CDN. */
export const DEEPAR_ROOT = 'https://cdn.jsdelivr.net/npm/deepar@5.6.20/';

export type CallFilterId = 'none' | 'aviators' | 'dalmatian' | 'koala' | 'lion' | 'galaxy' | 'blur';

export type CallFilterOption = {
  id: CallFilterId;
  label: string;
  effectUrl?: string;
  blur?: boolean;
};

export const CALL_FILTERS: CallFilterOption[] = [
  { id: 'none', label: 'Sin filtro' },
  { id: 'aviators', label: 'Lentes', effectUrl: `${DEEPAR_ROOT}effects/aviators` },
  { id: 'dalmatian', label: 'Dálmata', effectUrl: `${DEEPAR_ROOT}effects/dalmatian` },
  { id: 'koala', label: 'Koala', effectUrl: `${DEEPAR_ROOT}effects/koala` },
  { id: 'lion', label: 'León', effectUrl: `${DEEPAR_ROOT}effects/lion` },
  { id: 'galaxy', label: 'Galaxia', effectUrl: `${DEEPAR_ROOT}effects/galaxy_background` },
  { id: 'blur', label: 'Fondo blur', blur: true },
];

export async function createCallDeepAR(
  previewElement: HTMLElement,
  facingMode: 'user' | 'environment' = 'user',
): Promise<DeepAR> {
  return deepar.initialize({
    licenseKey: DEEPAR_LICENSE_KEY,
    previewElement,
    rootPath: DEEPAR_ROOT,
    additionalOptions: {
      cameraConfig: {
        disableDefaultCamera: true,
        facingMode,
      },
    },
  });
}

export async function applyCallFilter(instance: DeepAR, filterId: CallFilterId): Promise<void> {
  const option = CALL_FILTERS.find((item) => item.id === filterId) ?? CALL_FILTERS[0]!;
  await instance.backgroundBlur(false, 1).catch(() => undefined);
  if (option.blur) {
    instance.clearEffect();
    await instance.backgroundBlur(true, 6);
    return;
  }
  if (!option.effectUrl) {
    instance.clearEffect();
    return;
  }
  await instance.switchEffect(option.effectUrl);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
