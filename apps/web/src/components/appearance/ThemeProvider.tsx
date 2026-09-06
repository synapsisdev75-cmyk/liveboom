import { useEffect, type ReactNode } from 'react';
import { applyAppearanceToDocument } from '../../lib/appearance';
import { useAppearanceStore } from '../../store/appearanceStore';

/** Aplica tokens semánticos globales sin remount de rutas. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppearanceStore((state) => state.theme);
  const accent = useAppearanceStore((state) => state.accent);
  const darkIntensity = useAppearanceStore((state) => state.darkIntensity);
  const lightIntensity = useAppearanceStore((state) => state.lightIntensity);

  useEffect(() => {
    applyAppearanceToDocument({ theme, accent, darkIntensity, lightIntensity });
  }, [theme, accent, darkIntensity, lightIntensity]);

  return children;
}
