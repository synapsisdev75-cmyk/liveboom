import { Palette, RotateCcw, Sun, Moon, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACCENT_OPTIONS, type AppearanceAccent, type AppearanceTheme } from '../../lib/appearance';
import { clampIntensity } from '../../lib/appearanceTokens';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Logo } from '../brand/Logo';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n/es';

const LONG_PRESS_MS = 500;

export function AppearanceControl() {
  const t = useT();
  const theme = useAppearanceStore((s) => s.theme);
  const accent = useAppearanceStore((s) => s.accent);
  const darkIntensity = useAppearanceStore((s) => s.darkIntensity);
  const lightIntensity = useAppearanceStore((s) => s.lightIntensity);
  const toggleTheme = useAppearanceStore((s) => s.toggleTheme);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setAccent = useAppearanceStore((s) => s.setAccent);
  const setDarkIntensity = useAppearanceStore((s) => s.setDarkIntensity);
  const setLightIntensity = useAppearanceStore((s) => s.setLightIntensity);
  const resetAppearance = useAppearanceStore((s) => s.resetAppearance);
  const [open, setOpen] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const longTimer = useRef<number | null>(null);
  const longFired = useRef(false);
  const panelId = useId();
  const breakpoint = useBreakpoint();
  const sheet = breakpoint === 'phone';
  const isDark = theme === 'dark';

  function clearLong() {
    if (longTimer.current) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  function startLong() {
    longFired.current = false;
    clearLong();
    longTimer.current = window.setTimeout(() => {
      longFired.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  }

  function onToggleClick() {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    toggleTheme();
  }

  useEffect(() => () => clearLong(), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointer(event: MouseEvent | PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (clusterRef.current?.contains(target)) return;
      const panel = document.getElementById(panelId);
      if (panel?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open, panelId]);

  const nextLabel = isDark ? t('appearance.switchToLight') : t('appearance.switchToDark');

  return (
    <div ref={clusterRef} className="lb-appearance-cluster relative shrink-0">
      <button
        type="button"
        className="lb-theme-toggle"
        aria-label={nextLabel}
        title={nextLabel}
        onClick={onToggleClick}
        onPointerDown={startLong}
        onPointerUp={clearLong}
        onPointerCancel={clearLong}
        onPointerLeave={clearLong}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className={`lb-theme-toggle__icon ${isDark ? 'is-moon' : 'is-sun'}`}>
          {isDark ? <Moon size={15} strokeWidth={2.1} /> : <Sun size={15} strokeWidth={2.1} />}
        </span>
      </button>
      <button
        type="button"
        className="lb-appearance-palette-btn"
        aria-label={t('appearance.open')}
        aria-expanded={open}
        aria-controls={panelId}
        title={t('appearance.title')}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette size={11} strokeWidth={2.4} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <AppearancePopover
              id={panelId}
              sheet={sheet}
              anchor={clusterRef.current?.getBoundingClientRect() ?? null}
              theme={theme}
              accent={accent}
              darkIntensity={darkIntensity}
              lightIntensity={lightIntensity}
              onTheme={setTheme}
              onAccent={setAccent}
              onDarkIntensity={setDarkIntensity}
              onLightIntensity={setLightIntensity}
              onReset={resetAppearance}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function AppearancePopover({
  id,
  sheet,
  anchor,
  theme,
  accent,
  darkIntensity,
  lightIntensity,
  onTheme,
  onAccent,
  onDarkIntensity,
  onLightIntensity,
  onReset,
  onClose,
}: {
  id: string;
  sheet: boolean;
  anchor: DOMRect | null;
  theme: AppearanceTheme;
  accent: AppearanceAccent;
  darkIntensity: number;
  lightIntensity: number;
  onTheme: (theme: AppearanceTheme) => void;
  onAccent: (accent: AppearanceAccent) => void;
  onDarkIntensity: (value: number) => void;
  onLightIntensity: (value: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const style = !sheet && anchor
    ? {
        top: Math.min(anchor.bottom + 10, window.innerHeight - 24),
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 328)),
      }
    : undefined;

  return (
    <div className={sheet ? 'lb-appearance-sheet-root' : 'lb-appearance-pop-root'} role="presentation">
      {sheet ? (
        <button type="button" className="lb-appearance-sheet-backdrop" aria-label={t('appearance.close')} onClick={onClose} />
      ) : null}
      <div
        id={id}
        role="dialog"
        aria-label={t('appearance.title')}
        className={sheet ? 'lb-appearance-sheet' : 'lb-appearance-popover'}
        style={style}
      >
        <div className="lb-appearance-popover__head">
          <p>{t('appearance.title')}</p>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="lb-appearance-close">
            <X size={14} />
          </button>
        </div>

        <p className="lb-appearance-kicker">{t('appearance.mode')}</p>
        <div className="lb-appearance-modes">
          <div className={`lb-appearance-mode-block${theme === 'dark' ? ' is-on' : ''}`}>
            <button
              type="button"
              className={`lb-appearance-mode${theme === 'dark' ? ' is-on' : ''}`}
              onClick={() => onTheme('dark')}
            >
              <Moon size={16} />
              <span>{t('appearance.dark')}</span>
              {theme === 'dark' ? <em>{t('appearance.currentTheme')}</em> : null}
            </button>
            <label className={`lb-intensity${theme === 'dark' ? ' is-on' : ' is-off'}`}>
              <span>{t('appearance.intensity')} {darkIntensity}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={darkIntensity}
                aria-label={t('appearance.darkIntensity')}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onDarkIntensity(clampIntensity(event.target.value))}
              />
            </label>
          </div>
          <div className={`lb-appearance-mode-block${theme === 'light' ? ' is-on' : ''}`}>
            <button
              type="button"
              className={`lb-appearance-mode${theme === 'light' ? ' is-on' : ''}`}
              onClick={() => onTheme('light')}
            >
              <Sun size={16} />
              <span>{t('appearance.light')}</span>
              {theme === 'light' ? <em>{t('appearance.currentTheme')}</em> : null}
            </button>
            <label className={`lb-intensity${theme === 'light' ? ' is-on' : ' is-off'}`}>
              <span>{t('appearance.intensity')} {lightIntensity}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={lightIntensity}
                aria-label={t('appearance.lightIntensity')}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => onLightIntensity(clampIntensity(event.target.value))}
              />
            </label>
          </div>
        </div>

        <p className="lb-appearance-kicker">{t('appearance.accent')}</p>
        <p className="lb-appearance-hint">{t('appearance.accentHint')}</p>
        <div className="lb-accent-grid">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`lb-accent-swatch${accent === option.id ? ' is-on' : ''}`}
              aria-label={t(`appearance.${option.id}` as MessageKey)}
              aria-pressed={accent === option.id}
              title={t(`appearance.${option.id}` as MessageKey)}
              onClick={() => onAccent(option.id)}
            >
              <span style={{ background: option.swatch }} />
              <b>{t(`appearance.${option.id}` as MessageKey)}</b>
            </button>
          ))}
        </div>

        <p className="lb-appearance-kicker">{t('appearance.preview')}</p>
        <div className="lb-appearance-preview">
          <Logo compact className="[&_img]:!h-8 [&_img]:!max-w-[7.5rem]" />
          <div className="lb-appearance-preview__row">
            <span className="lb-appearance-preview__btn">{t('appearance.button')}</span>
            <span className="lb-appearance-preview__tab">{t('appearance.tab')}</span>
            <span className="lb-appearance-preview__link">{t('appearance.link')}</span>
          </div>
        </div>

        <button type="button" className="lb-appearance-reset" onClick={onReset}>
          <RotateCcw size={13} />
          {t('appearance.reset')}
        </button>
      </div>
    </div>
  );
}
