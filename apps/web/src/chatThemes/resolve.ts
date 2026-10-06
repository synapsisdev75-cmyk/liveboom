import { TEXT_SCALE } from './appearance';
import { autoOverlayOpacity, clamp } from './contrast';
import { familyForChoice } from './fonts';
import { getChatTheme, resolveActiveThemeId } from './registry';
import type {
  ChatAppearance,
  ChatBubbleStyle,
  ChatThemeScheme,
  ChatThemesAdminConfig,
  ChatThemeTokens,
  ResolvedChatBackground,
  ResolvedChatTheme,
} from './types';

const LIVEBOOM_GRADIENT = 'linear-gradient(135deg, #ec4899 0%, #a855f7 55%, #6366f1 100%)';

function applyBubbleStyle(tokens: ChatThemeTokens, style: ChatBubbleStyle, scheme: ChatThemeScheme): ChatThemeTokens {
  switch (style) {
    case 'light':
      return {
        ...tokens,
        bubbleIncoming: '#ffffff',
        bubbleIncomingText: '#18181b',
        bubbleOutgoing: `color-mix(in srgb, ${tokens.accent} 18%, #ffffff)`,
        bubbleOutgoingText: '#18181b',
        bubbleBorder: 'rgba(24, 24, 27, 0.1)',
        bubbleBlur: 0,
      };
    case 'dark':
      return {
        ...tokens,
        bubbleIncoming: 'rgba(22, 22, 30, 0.95)',
        bubbleIncomingText: '#f4f4f5',
        bubbleOutgoing: 'rgba(46, 46, 62, 0.96)',
        bubbleOutgoingText: '#ffffff',
        bubbleBorder: 'rgba(255, 255, 255, 0.1)',
        bubbleBlur: 0,
      };
    case 'liveboom':
      return {
        ...tokens,
        bubbleIncoming: 'rgba(38, 38, 52, 0.95)',
        bubbleIncomingText: '#f4f4f5',
        bubbleOutgoing: LIVEBOOM_GRADIENT,
        bubbleOutgoingText: '#ffffff',
        bubbleBorder: 'rgba(255, 255, 255, 0.06)',
        bubbleBlur: 0,
      };
    case 'glass':
      return scheme === 'dark'
        ? {
            ...tokens,
            bubbleIncoming: 'rgba(255, 255, 255, 0.14)',
            bubbleIncomingText: '#ffffff',
            bubbleOutgoing: 'rgba(255, 255, 255, 0.26)',
            bubbleOutgoingText: '#ffffff',
            bubbleBorder: 'rgba(255, 255, 255, 0.28)',
            bubbleBlur: 14,
          }
        : {
            ...tokens,
            bubbleIncoming: 'rgba(255, 255, 255, 0.58)',
            bubbleIncomingText: '#18181b',
            bubbleOutgoing: 'rgba(255, 255, 255, 0.8)',
            bubbleOutgoingText: '#18181b',
            bubbleBorder: 'rgba(255, 255, 255, 0.72)',
            bubbleBlur: 14,
          };
    default:
      return tokens;
  }
}

function applyHighContrast(tokens: ChatThemeTokens, scheme: ChatThemeScheme): ChatThemeTokens {
  return scheme === 'dark'
    ? {
        ...tokens,
        bubbleIncoming: '#0a0a0f',
        bubbleIncomingText: '#ffffff',
        bubbleOutgoing: '#ffffff',
        bubbleOutgoingText: '#000000',
        bubbleBorder: 'rgba(255, 255, 255, 0.6)',
        textPrimary: '#ffffff',
        textSecondary: '#e4e4e7',
        surface: '#050507',
        surfaceSecondary: '#0a0a0f',
        inputBackground: '#0a0a0f',
        border: 'rgba(255, 255, 255, 0.5)',
        quoteBackground: 'rgba(255, 255, 255, 0.16)',
        bubbleBlur: 0,
      }
    : {
        ...tokens,
        bubbleIncoming: '#ffffff',
        bubbleIncomingText: '#000000',
        bubbleOutgoing: '#111111',
        bubbleOutgoingText: '#ffffff',
        bubbleBorder: 'rgba(0, 0, 0, 0.6)',
        textPrimary: '#000000',
        textSecondary: '#27272a',
        surface: '#ffffff',
        surfaceSecondary: '#ffffff',
        inputBackground: '#ffffff',
        border: 'rgba(0, 0, 0, 0.5)',
        quoteBackground: 'rgba(0, 0, 0, 0.08)',
        bubbleBlur: 0,
      };
}

export function resolveChatTheme(input: {
  appearance: ChatAppearance;
  admin: ChatThemesAdminConfig;
  appScheme: ChatThemeScheme;
}): ResolvedChatTheme {
  const { appearance, admin, appScheme } = input;
  const activeThemeId = resolveActiveThemeId(admin, appearance.themeId);
  const theme = getChatTheme(admin, activeThemeId);
  const useLight = appScheme === 'light' && Boolean(theme.lightVariant);
  const scheme: ChatThemeScheme = useLight ? 'light' : theme.scheme;
  const themeBg = useLight ? theme.lightVariant!.background : theme.background;
  let tokens: ChatThemeTokens = useLight ? theme.lightVariant!.tokens : theme.tokens;

  tokens = applyBubbleStyle(tokens, appearance.bubbleStyle, scheme);
  if (appearance.highContrast) tokens = applyHighContrast(tokens, scheme);

  const hcBoost = appearance.highContrast ? 0.25 : 0;
  const custom = appearance.customBackground;
  let background: ResolvedChatBackground;
  if (custom) {
    const auto = custom.autoReadability ? autoOverlayOpacity(custom.luminance, scheme) : 0;
    background = {
      kind: 'custom',
      baseColor: custom.baseColor,
      image: custom,
      overlayColor: tokens.backgroundOverlay,
      overlayOpacity: clamp(Math.max(custom.overlayOpacity, auto) + hcBoost, 0, 0.85),
    };
  } else {
    const hasImage = Boolean(themeBg.portrait || themeBg.landscape);
    background = {
      kind: 'theme',
      baseColor: tokens.background,
      gradient: themeBg.gradient,
      portrait: themeBg.portrait,
      landscape: themeBg.landscape,
      overlayColor: tokens.backgroundOverlay,
      overlayOpacity: hasImage ? clamp(autoOverlayOpacity(themeBg.luminance, scheme) + hcBoost, 0, 0.85) : 0,
    };
  }

  const manual = appearance.font === 'theme' ? null : familyForChoice(appearance.font);
  const fontFamily = manual || tokens.fontFamily;
  const fontHeading = tokens.fontHeading;
  const hasPhoto = background.kind === 'custom' || Boolean(background.portrait || background.landscape);
  const metaBackground = !hasPhoto
    ? 'transparent'
    : scheme === 'dark'
      ? appearance.highContrast
        ? 'rgba(0, 0, 0, 0.85)'
        : 'rgba(0, 0, 0, 0.4)'
      : appearance.highContrast
        ? 'rgba(255, 255, 255, 0.95)'
        : 'rgba(255, 255, 255, 0.72)';
  const metaText = scheme === 'dark' ? 'rgba(255, 255, 255, 0.9)' : '#3f3f46';

  return {
    theme,
    activeThemeId,
    scheme,
    tokens,
    background,
    fontFamily,
    fontHeading,
    fontScale: TEXT_SCALE[appearance.textSize] ?? 1,
    highContrast: appearance.highContrast,
    metaBackground,
    metaText,
    fonts: Array.from(new Set([fontFamily, fontHeading])),
  };
}
