export type ChatThemeScheme = 'dark' | 'light';

/** Tokens visuales de un tema. Todo el chat se pinta solo con estos valores. */
export type ChatThemeTokens = {
  /** Color base: se ve mientras carga la imagen y debajo de ella. */
  background: string;
  /** Velo sobre la imagen para legibilidad (color con alfa). */
  backgroundOverlay: string;
  /** Cabecera y barra de escritura (puede ser translúcido). */
  surface: string;
  /** Menús, chips y tarjetas (opaco). */
  surfaceSecondary: string;
  bubbleIncoming: string;
  bubbleIncomingText: string;
  /** Color o gradiente. */
  bubbleOutgoing: string;
  bubbleOutgoingText: string;
  bubbleBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSecondary: string;
  /** Texto sobre acento (botón enviar). */
  onAccent: string;
  border: string;
  inputBackground: string;
  icon: string;
  reactionBackground: string;
  quoteBackground: string;
  /** Color de autor en respuestas / citas. */
  reply: string;
  audioWave: string;
  selection: string;
  fontFamily: string;
  fontHeading: string;
  borderRadius: string;
  shadow: string;
  /** Desenfoque tras las burbujas (estilo cristal). 0 = sin efecto. */
  bubbleBlur: number;
  /** Marco de fotos/videos/GIF: solo radio y borde, nunca filtro de color. */
  mediaRadius: string;
  mediaBorder: string;
};

export type ChatImageVariants = { thumb: string; medium: string; full: string };

export type ChatThemeBackground = {
  /** Gradiente CSS opcional (se usa si no hay imagen o mientras carga). */
  gradient?: string;
  portrait?: ChatImageVariants;
  landscape?: ChatImageVariants;
  /** Luminancia media 0..1 de la imagen (para contraste automático). */
  luminance: number;
};

export type ChatTheme = {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  scheme: ChatThemeScheme;
  background: ChatThemeBackground;
  tokens: ChatThemeTokens;
  /** Familias de Google Fonts que usa el tema. */
  fonts: string[];
  /** Variante para la app en modo claro (solo temas que deban seguir el modo de la app). */
  lightVariant?: {
    tokens: ChatThemeTokens;
    background: ChatThemeBackground;
  };
  /** LiveBoom Original no se puede eliminar ni desactivar. */
  locked?: boolean;
};

export type ChatFontChoice =
  | 'theme'
  | 'liveboom'
  | 'inter'
  | 'sora'
  | 'manrope'
  | 'nunito'
  | 'space-grotesk';

export type ChatTextSize = 'sm' | 'md' | 'lg' | 'xl';

export type ChatBubbleStyle = 'theme' | 'light' | 'dark' | 'liveboom' | 'glass';

export type ChatCustomBackground = {
  id: string;
  thumb: string;
  medium: string;
  full: string;
  /** Dimensiones de la imagen `full` (sin rotar). */
  width: number;
  height: number;
  /** 0..100 — 50 = centrado. */
  backgroundPositionX: number;
  backgroundPositionY: number;
  /** 1..4 sobre el encuadre "cubrir". */
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  /** px, 0..12 */
  blur: number;
  /** 0..0.8 */
  overlayOpacity: number;
  autoReadability: boolean;
  luminance: number;
  baseColor: string;
};

export type ChatAppearance = {
  /** 'default' = el tema por defecto publicado (LiveBoom Original salvo cambio de admin). */
  themeId: string;
  font: ChatFontChoice;
  textSize: ChatTextSize;
  bubbleStyle: ChatBubbleStyle;
  highContrast: boolean;
  customBackground: ChatCustomBackground | null;
  updatedAtMs: number;
};

/** Ajustes que el Super Admin puede publicar por tema (config/chatThemes). */
export type ChatThemeAdminEntry = {
  enabled: boolean;
  published: boolean;
  order: number;
  name?: string;
  thumbnail?: string;
  portrait?: ChatImageVariants;
  landscape?: ChatImageVariants;
  luminance?: number;
  fontFamily?: string;
  fontHeading?: string;
  tokens?: Partial<Pick<
    ChatThemeTokens,
    | 'background'
    | 'surface'
    | 'bubbleIncoming'
    | 'bubbleIncomingText'
    | 'bubbleOutgoing'
    | 'bubbleOutgoingText'
    | 'textPrimary'
    | 'textSecondary'
    | 'accent'
    | 'accentSecondary'
  >>;
};

export type ChatThemesAdminConfig = {
  version: number;
  defaultThemeId: string;
  themes: Record<string, ChatThemeAdminEntry>;
};

export type ResolvedChatBackground =
  | {
      kind: 'theme';
      baseColor: string;
      gradient?: string;
      portrait?: ChatImageVariants;
      landscape?: ChatImageVariants;
      overlayColor: string;
      overlayOpacity: number;
    }
  | {
      kind: 'custom';
      baseColor: string;
      image: ChatCustomBackground;
      overlayColor: string;
      overlayOpacity: number;
    };

export type ResolvedChatTheme = {
  theme: ChatTheme;
  /** Id realmente mostrado (puede diferir del elegido si el tema está desactivado). */
  activeThemeId: string;
  scheme: ChatThemeScheme;
  tokens: ChatThemeTokens;
  background: ResolvedChatBackground;
  fontFamily: string;
  fontHeading: string;
  fontScale: number;
  highContrast: boolean;
  /** Etiquetas de hora / día sobre el fondo. */
  metaBackground: string;
  metaText: string;
  fonts: string[];
};
