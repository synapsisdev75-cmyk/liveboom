# LiveBoom — Auditoría técnica de rendimiento

Fecha: 2026-10-05 · Rama: `main` · Alcance: `apps/web` (frontend), `firebase.json` (hosting), revisión de `backend/` (sin cambios).

Restricciones respetadas: sin rediseño, sin tocar lógica financiera (BLAST, retiros, ledger, conversiones, precios, Wompi, conciliación, idempotencia), sin cambiar lógica funcional de LIVE / batallas / privados / llamadas / mensajes / regalos / catálogo / Superadmin / moderación / perfiles / publicaciones. Motor de regalos y composición LIVE 16:9 congelados (regla del repo).

## Línea base medida (producción, antes de cambios)

Pestaña de prueba con sesión iniciada, caché deshabilitada, `/explorar` y `/inicio`.

| Métrica | Wi-Fi | Slow 4G (150 ms, 1.6 Mbps) |
|---|---|---|
| TTFB | 128 ms | 150–179 ms |
| FCP | 560 ms | ~5.1 s |
| LCP | 4 960 ms (imagen de post en Firebase Storage) | 30–44.5 s |
| CLS | 0.045 | 0.105–0.145 |
| DOMContentLoaded | 598 ms | ~7.1 s |
| Load | 771 ms | 10.8–47 s |
| Último JS descargado | — | 18–20.5 s |
| Solicitudes | ≥ 250 (tope del buffer de Resource Timing) | ≥ 250 |
| JS | 155 solicitudes / ~1 000 KB | 155 / ~1 000 KB |
| Imágenes | 31 / 3 425 KB | 14–18 / 828–910 KB |
| Solicitudes Firestore | 53 | 57–58 |
| Heap JS | 21 MB | 21 MB |

Bundle estático (`scripts/measure-initial-bundle.mjs` sobre `dist/index.html`): **129 solicitudes JS/CSS iniciales, 4 091.9 KB (1 088.9 KB gzip)**.

## Hallazgos

Formato: problema · archivo / componente · causa · impacto · gravedad · solución.

### CRÍTICO

1. **React empaquetado dentro del chunk de LiveKit**
   - Archivo: `apps/web/vite.config.ts`
   - Causa: `manualChunks` (obsoleto en Vite 8 / rolldown) agrupa dependencias recursivamente; `livekit` absorbía `react`/`react-dom`, por lo que el chunk de LiveKit (575.8 KB) se cargaba en toda página.
   - Impacto: +150 KB gzip en la ruta crítica de todas las pantallas, aunque no haya LIVE.
   - Solución: `build.rolldownOptions.output.codeSplitting.groups` con `react-vendor` de prioridad mayor que `livekit`/`agora`/`firebase`.

2. **Fuga de sockets Socket.IO en producción**
   - Archivo: `apps/web/src/lib/socket.ts`
   - Causa: producción no tiene servidor Socket.IO (`/socket.io/` devuelve `index.html`); cada `getSocket()` creaba un socket nuevo si el anterior no estaba `connected`, y cada uno reintentaba indefinidamente.
   - Impacto: solicitudes de polling acumulativas mientras la sesión está abierta (billetera, notificaciones).
   - Solución: singleton que reutiliza el socket si está `connected || active`, promesa compartida para llamadas concurrentes, token vía callback `auth`, `reconnectionDelayMax` 30 s, import dinámico de `socket.io-client`.

3. **Chunk principal con módulos que no se usan al arrancar**
   - Archivos: `App.tsx` (`CallOverlay`), `MessagesQuickMenu.tsx` (`InternalChatPanel`), `MainLayout.tsx` (`CoinModal`), `SideRailPanel.tsx` (`PromoteAdsModal`, `MyPromotionsModal`), `ZoneCard.tsx` (`LocationShareModal`, `PlaceDirectionsModal`), `lib/deepar.ts` (`deepar`), `SocialPostCard.tsx` (`FollowButton` arrastraba toda la tarjeta de publicación al sidebar).
   - Causa: imports estáticos de modales / overlays que solo se abren por acción del usuario.
   - Impacto: `index.js` de 972 KB (252 KB gzip) + `InternalChatPanel` 158 KB + `FloatingGift` 148 KB + `RepostPostCard` 123 KB + `StickerPickerSheet` + `EmojiPicker` en la carga inicial.
   - Solución: `React.lazy` + `Suspense fallback={null}` montando solo al abrir; `deepar` con `import()` dinámico; `FollowButton` extraído a su propio archivo (re-exportado desde `SocialPostCard` para compatibilidad).

### ALTO

4. **Imágenes de UI sobredimensionadas**
   - Archivos: `public/brand/explore-icon-cut.png` (721×978, 814 KB, se muestra a ≤ 52 px), `public/reactions/{like,dislike}-{on,off}.png` (~110–131 KB cada una, se muestran a ~30 px).
   - Impacto: ~1.3 MB descargados en el feed.
   - Solución: redimensionado lanczos3 a 2–4× el tamaño mostrado, PNG sin paleta (sin pérdida de color), script `apps/web/scripts/optimize-ui-images.mjs`.

5. **Assets con hash sin caché inmutable**
   - Archivo: `firebase.json`
   - Causa: `/assets/**` (nombres con hash) usaba la política por defecto de Hosting.
   - Impacto: revalidaciones en visitas repetidas.
   - Solución: `Cache-Control: public, max-age=31536000, immutable` para `/assets/**/*.@(js|css)`.

6. **Escrituras de "entregado" repetidas en cada snapshot del inbox**
   - Archivo: `components/social/CallOverlay.tsx`, `lib/socialFirestore.ts` (`markInboxDelivered`)
   - Causa: cada emisión de `listenConversations` volvía a marcar todos los chats, sin control de concurrencia.
   - Impacto: escrituras Firestore redundantes (coste + listeners en cascada).
   - Solución: solo chats cuyo `lastAt` cambió, máx. 20 por lote, una ejecución a la vez, se marcan como revisados solo los que tuvieron éxito.

7. **Elementos `<video>` de precalentamiento sin límite**
   - Archivo: `lib/feedVideoWarmup.ts`
   - Causa: cada warmup dejaba el elemento vivo.
   - Impacto: memoria y decodificadores retenidos al hacer scroll largo.
   - Solución: máximo 3 retenidos; el más antiguo se libera (`pause`, quitar `src`, `load()`, `remove()`).

8. **Listeners de Firestore sin uso en `NotificationBell`**
   - Archivo: `components/social/NotificationBell.tsx`
   - Causa: `listenFriends` y `listenRecentPosts` escribían en refs que nunca se leían.
   - Impacto: lecturas en tiempo real permanentes para cada usuario conectado.
   - Solución: eliminados (referencias verificadas). `pollLives` se mantiene igual (semántica de alertas).

### MEDIO

9. **Heartbeat de Explorar y verificación periódica en Home con la pestaña oculta**
   - Archivos: `lib/explorePresence.ts`, `views/HomeView.tsx`
   - Solución: se omite el trabajo con `document.hidden` y se ejecuta al volver a `visibilitychange` visible.

10. **Emisiones duplicadas de LIVE activos**
    - Archivo: `lib/liveGiftsFirestore.ts` (`listenActiveLiveRooms`)
    - Causa: cada snapshot provocaba re-render aunque la lista resultante fuera idéntica.
    - Solución: firma `JSON.stringify` de la lista ordenada; no se emite si no cambió.

11. **Efectos que se re-suscriben por identidad de arrays**
    - Archivos: `InternalChatPanel.tsx` (presencia), `ReelFeedViewer.tsx` (precarga de siguientes videos)
    - Solución: dependencias por clave estable (`uids` ordenados unidos / URLs unidas).

12. **Listener de billetera eliminaba otros listeners**
    - Archivo: `views/WalletView.tsx`
    - Causa: `socket.off('wallet_updated')` sin handler quitaba también el de `pendingBlastRecharge`.
    - Solución: `off` con la referencia exacta del handler. Sin cambios en lógica financiera.

13. **`framer-motion` completo para una burbuja de navegación**
    - Archivo: `components/layout/LiquidBottomNav.tsx`
    - Solución: `LazyMotion` + `m` + `domAnimation` (mismas props y animación).

14. **Sin `preconnect` a Firestore / Storage**
    - Archivo: `apps/web/index.html`
    - Solución: `preconnect` a `firestore.googleapis.com` y `firebasestorage.googleapis.com`.

### BAJO

15. **Imágenes de listas sin `loading="lazy"`**
    - Archivos: `UserAvatar.tsx`, `FlashBoomRow.tsx` (anillos de otros usuarios), `SocialPostCard.tsx` (lista de seguidores), `HomeView.tsx` (`LiveHeroCard`)
    - Solución: `loading="lazy"` + `decoding="async"` (UserAvatar ya fija `width`/`height`, sin CLS).

## Hallazgos documentados que NO se corrigen en esta tarea

| Hallazgo | Archivo | Gravedad | Motivo |
|---|---|---|---|
| `listenActiveStories` abre ~170 listeners | `lib/socialFirestore.ts` | ALTO | Cambiar el modelo de consulta de Flash Boom altera agrupación / 24 h (módulo protegido) |
| Amigos / seguidores / seguidos sin `limit` | `socialFirestore.ts` | ALTO | Contadores y listas de perfil dependen del conjunto completo |
| `listenPostReactions` / `listenPostComments` por tarjeta leen subcolección completa | `socialFirestore.ts` | ALTO | Requiere contadores agregados (cambio de modelo + backend) |
| `postViews` incrementa docs dentro de queries en vivo grandes | feed | MEDIO | Cambiar a contador separado afecta ranking |
| `listenLiveGifts` lee subcolección completa | `liveGiftsFirestore.ts` | MEDIO | Motor de regalos congelado |
| `listenLiveViewers` sin límite | `lib/liveGiftsFirestore.ts` | MEDIO | Lógica LIVE (contador de sala) |
| `listenConversations` abierto ~9 veces + escrituras de "escribiendo" en el doc del chat | Mensajes | MEDIO | Requiere store compartido de conversaciones (refactor de Mensajes) |
| `PostVideoPlayer` en `storyMode` hace `setState` por frame | Flash Boom | MEDIO | Barra de progreso visual de Flash Boom |
| `NotificationBell` sondea cada 12 s incluso oculta | `NotificationBell.tsx` | BAJO | Semántica de alertas de LIVE |
| Presencia de `CallOverlay` cada 25 s con pestaña oculta | `CallOverlay.tsx` | BAJO | Llamadas entrantes dependen de presencia |
| Avatares originales de 1080 px mostrados a 40 px | Storage | ALTO | Requiere pipeline de miniaturas (backend + migración) |
| Todos los idiomas i18n en el bundle | `i18n` | MEDIO | `translate` es síncrono; carga diferida mostraría inglés momentáneamente |
| CSS de 689 KB en un solo archivo | `index.css` | MEDIO | Dividir altera el orden de cascada (riesgo visual) |
| `logo-clear.png` original de 1024 px | login | BAJO | Se renderiza hasta 288 px en login |
| GIFs de regalos / emoticonos | `public/gifts` | — | Congelado |
| Sin servidor Socket.IO en producción | infraestructura | MEDIO | Decisión de arquitectura; el cliente ya no fuga sockets |
| `<link rel=preload as=video>` en Explorar | `ExploreView.tsx` | BAJO | Ignorado por navegadores; inocuo |
| `listenMyGroups` hasta 40 `getDoc` | `lib/groupsFirestore.ts` | BAJO | Fuera de alcance |
| CLS 0.25 en `/explorar` sin sesión | layout | MEDIO | Igual antes y después; requiere ajustar layout (cambio visual) |
| `processGiftAlphaQueue` cada minuto con 8 GiB | `backend` | MEDIO | Código de regalos congelado |

## Backend

`backend/index.js`: rutas montadas de forma diferida, `minInstances: 1`, compresión a cargo de Hosting. Sin cambios necesarios en esta tarea.
