# LiveBoom — Visor de video (documentación)

Guía de cómo funciona el reproductor compartido sin mezclar módulos.

## Módulos separados

| Módulo | `contentType` | Componente principal | Cómo se abre |
|--------|---------------|-------------------|--------------|
| **Publicación** | `post` | `SocialPostCard` → `PostVideoPlayer` | Inline en feed + botón **Expandir** |
| **Boom Clip** | `boom_clip` | `ReelsRow` → `ReelFeedViewer` → `PostVideoPlayer` | Un clic en avatar/thumbnail |
| **Flash Boom** | `flashboom` | `FlashBoomRow` → `ReelFeedViewer` | Un clic en burbuja |
| **Explorar** | varios | `ExploreView` → `ReelFeedViewer` (`embedded`) | Feed vertical embebido |

**Regla:** un cambio en Publicaciones no debe alterar Boom Clip / Flash Boom / Explorar.

## `PostVideoPlayer` — modos (props)

El mismo componente se comporta distinto según props. **No** agregar lógica de un módulo sin prop explícita.

| Prop | Publicación | Boom Clip / Flash | Explorar |
|------|-------------|-------------------|----------|
| `overlayOnly` | `false` | `true` | `true` |
| `embedded` | `false` | `false` (modal) / `true` (página) | `true` |
| `reelNavigation` | — | `{ onNext, onPrev }` | `{ onNext, onPrev }` |
| `storyMode` | `false` | `false` | `false` / `true` (Flash) |
| `startExpanded` | solo tras publicar | `true` | `true` |
| `onRequestExpand` | opcional (padre abre `ReelFeedViewer`) | — | — |

### Render según modo

```
overlayOnly=false  →  video inline en feed + portal fullscreen al expandir
overlayOnly=true, embedded=true  →  visor dentro del contenedor (Explorar)
overlayOnly=true, embedded=false →  visor fullscreen (ReelFeedViewer modal)
```

**Importante:** si `overlayOnly=true` y `embedded=false`, el player **debe** renderizar `expandedChrome`. Devolver `null` rompe Boom Clip y Flash Boom al hacer clic.

## Publicaciones — interacción

### En el feed (inline)

- **Autoplay** silenciado cuando el video entra al viewport (≥45 % visible).
- **Clic en el video:** play / pause (no expande).
- **Botón Expandir:** abre visor fullscreen vía `createPortal(..., document.body)`.
- **Mute:** botón inferior izquierdo.
- **Compartir:** icono inferior derecho.

### Expandido (fullscreen)

- Portal a `document.body` (escapa `overflow-hidden` del feed).
- Conserva tiempo de reproducción y estado play/pause al expandir y al cerrar.
- Seek ±10 s (zonas laterales o botones móvil).
- Rail de acciones: Boom, comentarios, regalo, compartir.
- **Cerrar (X):** vuelve al feed en el mismo punto.

## Boom Clip / Flash Boom — interacción

- Un clic abre `ReelFeedViewer` (portal a `body`).
- `PostVideoPlayer` con `overlayOnly` + `startExpanded`.
- Navegación vertical (swipe / flechas / rueda).
- Flash Boom: `storyMode` + barras de progreso + auto-avance.

## Componentes compartidos (contrato)

| Componente | Responsabilidad | No hace |
|------------|-----------------|---------|
| `PostVideoPlayer` | play, pause, mute, expand, seek | clasificar `contentType` |
| `ImmersiveMediaStage` | layout 9:16 / landscape responsive | regalos, comentarios |
| `PostActionRail` | Boom, comentar, regalar, compartir | control de playback |
| `ReelFeedViewer` | secuencia de clips, reacciones, portal | lógica de publicación en feed |

## Checklist de regresión (obligatorio al tocar video)

Tras cualquier cambio en `PostVideoPlayer`, `ReelFeedViewer` o `ImmersiveMediaStage`:

| Funcionalidad | Publicación | Boom Clip | Flash Boom | Explorar |
|---------------|-------------|-----------|------------|----------|
| Ver video al abrir/clic | ✓ inline | ✓ modal | ✓ modal | ✓ embebido |
| Play / pause | ✓ | ✓ | ✓ | ✓ |
| Expandir (solo post) | ✓ | N/A | N/A | N/A |
| Regalo | ✓ | ✓ | ✓ | ✓ |
| Comentar | ✓ | ✓ | — | ✓ |
| Boom | ✓ | ✓ | ✓ | ✓ |
| Navegación clips | — | ✓ | ✓ | ✓ |

## Archivos clave

- `apps/web/src/components/social/PostVideoPlayer.tsx` — reproductor compartido
- `apps/web/src/components/social/SocialPostCard.tsx` — publicaciones en feed
- `apps/web/src/components/feed/ReelFeedViewer.tsx` — visor secuencial (clips / flash / explorar)
- `apps/web/src/components/social/ImmersiveMediaStage.tsx` — layout immersive
- `apps/web/src/lib/immersiveMediaLayout.ts` — cálculo de caja media
- `.cursor/rules/liveboom-change-isolation.mdc` — regla anti-regresiones

## Deploy

Tras cambios de producto en video:

```bash
npm run build -w apps/web
npx firebase deploy --only hosting --project liveboom-app
```
