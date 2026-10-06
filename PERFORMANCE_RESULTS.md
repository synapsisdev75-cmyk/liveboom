# LiveBoom — Resultados de optimización de rendimiento

Ver hallazgos completos en `PERFORMANCE_AUDIT.md`.

## 1. Problemas atacados

- React atrapado en el chunk de LiveKit (cargado en todas las páginas).
- Modales, overlays y SDKs pesados en la carga inicial (llamadas, chat interno, recarga de monedas, promociones, ubicación, DeepAR, tarjeta de publicación completa en el sidebar).
- Fuga de sockets Socket.IO (un socket nuevo con reintentos infinitos por cada `getSocket()`).
- Imágenes de UI de 110–814 KB mostradas a 30–52 px.
- Assets con hash sin caché inmutable.
- Escrituras Firestore redundantes (inbox entregado), listeners sin uso (`NotificationBell`), emisiones duplicadas (LIVE activos), trabajo periódico con pestaña oculta, `<video>` de warmup sin límite, efectos re-suscritos por identidad de arrays.

## 2. Cambios realizados

| Cambio | Tipo |
|---|---|
| `codeSplitting.groups` en Vite (react-vendor > livekit/agora > firebase) | Bundle |
| `lazy` + `Suspense` para `CallOverlay`, `InternalChatPanel`, `CoinModal`, `PromoteAdsModal`, `MyPromotionsModal`, `LocationShareModal`, `PlaceDirectionsModal` (montan solo al abrir) | Bundle |
| `deepar` con `import()` dinámico | Bundle |
| `FollowButton` en archivo propio (re-export desde `SocialPostCard`) | Bundle |
| `LazyMotion` + `m` en `LiquidBottomNav` | Bundle |
| Singleton de Socket.IO con import dinámico y token por callback | Red |
| `Cache-Control: immutable` en `/assets/**` | Red |
| `preconnect` a Firestore y Storage | Red |
| 5 PNG de UI redimensionados sin pérdida | Imágenes |
| `loading="lazy"` en avatares e imágenes de listas | Imágenes |
| Inbox entregado: solo chats cambiados, lotes de 20, sin concurrencia | Firestore |
| Eliminados `listenFriends` / `listenRecentPosts` sin uso en `NotificationBell` | Firestore |
| `listenActiveLiveRooms` no re-emite listas idénticas | Firestore / render |
| Heartbeat de Explorar y verificación de Home pausados con pestaña oculta | Red / CPU |
| Máximo 3 `<video>` de warmup retenidos | Memoria |
| Claves estables en efectos de presencia (chat) y precarga (reels) | Render |
| `WalletView`: `socket.off` con handler exacto | Corrección |

## 3. Archivos

Modificados:
`apps/web/vite.config.ts`, `apps/web/index.html`, `firebase.json`,
`apps/web/src/App.tsx`, `apps/web/src/lib/{socket,deepar,explorePresence,feedVideoWarmup,liveGiftsFirestore,socialFirestore}.ts`,
`apps/web/src/components/layout/{LiquidBottomNav,MainLayout,SideRailPanel,SidebarSuggestedCreatorsCard,ZoneCard}.tsx`,
`apps/web/src/components/social/{CallOverlay,InternalChatPanel,MessagesQuickMenu,NotificationBell,SocialPostCard}.tsx`,
`apps/web/src/components/feed/{FlashBoomRow,ReelFeedViewer}.tsx`, `apps/web/src/components/profile/UserAvatar.tsx`,
`apps/web/src/views/{HomeView,WalletView}.tsx`,
`apps/web/public/brand/explore-icon-cut.png`, `apps/web/public/reactions/{like-on,like-off,dislike-on,dislike-off}.png`.

Nuevos:
`apps/web/src/components/social/FollowButton.tsx`, `apps/web/scripts/optimize-ui-images.mjs`, `scripts/measure-initial-bundle.mjs`, `PERFORMANCE_AUDIT.md`, `PERFORMANCE_RESULTS.md`.

Sin cambios: `backend/`, reglas Firestore / Storage, lógica financiera, motor de regalos, composición LIVE 16:9.

## 4. Métricas antes

### Bundle inicial (`node scripts/measure-initial-bundle.mjs`)

| | Antes |
|---|---|
| Solicitudes JS/CSS iniciales | 129 |
| Peso inicial | 4 091.9 KB (1 088.9 KB gzip) |
| Chunk `index` | 972.0 KB (252.1 KB gzip) |
| `livekit` en ruta crítica | Sí, 575.8 KB (150.7 KB gzip) |
| JS total generado | 189 archivos, 7 781.6 KB (2 187.7 KB gzip) |

### Producción (con sesión, caché deshabilitada)

Ver tabla de línea base en `PERFORMANCE_AUDIT.md` (TTFB 128 ms, FCP 560 ms, LCP 4.96 s, CLS 0.045 en Wi-Fi; FCP ~5.1 s en Slow 4G).

## 5. Métricas después

### Bundle inicial

| | Antes | Después | Diferencia |
|---|---|---|---|
| Solicitudes JS/CSS iniciales | 129 | **65** | −64 (−49.6 %) |
| Peso inicial (raw) | 4 091.9 KB | **2 320.8 KB** | −43.3 % |
| Peso inicial (gzip) | 1 088.9 KB | **604.9 KB** | −484 KB (−44.4 %) |
| Chunk `index` (gzip) | 252.1 KB | **108.8 KB** | −56.8 % |
| `livekit` en ruta crítica | Sí | **No** | −150.7 KB gzip |
| JS total generado (gzip) | 2 187.7 KB | 2 182.3 KB | sin cambio relevante (se reparte, no se elimina) |

### Runtime A/B local (mismo equipo, mismo servidor `vite preview`, caché deshabilitada, `/explorar` sin sesión, builds anterior y nuevo alternados)

No se repitieron mediciones en producción: la navegación automatizada a producción no fue autorizada. Ambos builds se sirvieron localmente en idénticas condiciones; los datos son comparables entre sí, no con la tabla de producción.

**Wi-Fi (sin limitación), 2 muestras por build**

| Métrica | Antes | Después | Diferencia |
|---|---|---|---|
| FCP | 600 / 636 ms | 312 / 336 ms | **−48 %** |
| LCP | 600 / 636 ms | 312 / 336 ms | **−48 %** |
| DOMContentLoaded | 637 / 538 ms | 230 / 237 ms | **−60 %** |
| Load | 1 069 / 624 ms | 231 / 394 ms | **−63 %** |
| CLS | 0.244 / 0.25 | 0.25 / 0.25 | igual |
| Heap JS | 17 / 23 MB | 24 / 24 MB | sin diferencia significativa |

**Slow 4G (150 ms, 1.6 Mbps / 750 kbps), 2 muestras por build**

| Métrica | Antes | Después | Diferencia |
|---|---|---|---|
| FCP | 8 464 / 8 416 ms | 4 400 / 4 376 ms | **−48 %** (−4.05 s) |
| LCP | 8 548 / 8 564 ms | 5 316 / 5 192 ms | **−39 %** (−3.3 s) |
| DOMContentLoaded | 8 325 / 8 267 ms | 5 009 / 5 005 ms | **−40 %** (−3.3 s) |
| Load | 16 869 / 18 061 ms | 13 577 / 15 421 ms | −17 % |
| Último JS descargado | 14 058 / 14 048 ms | 11 415 / 11 778 ms | −17 % |
| CLS | 0.25 / 0.25 | 0.25 / 0.25 | igual |
| Heap JS (load + 4 s) | 60 / 54 MB | 23 / 23 MB | −60 % |

TTFB: 23–169 ms en ambos casos (servidor local; no aplica comparación). INP: no medible de forma automatizada sin interacción real; no se declara mejora.

### Imágenes de UI

| Archivo | Antes | Después |
|---|---|---|
| `brand/explore-icon-cut.png` | 721×978, 814 KB | 192×260, 70 KB |
| `reactions/like-on.png` | 131 KB | 128 px, 32 KB |
| `reactions/like-off.png` | 113 KB | 128 px, 27 KB |
| `reactions/dislike-on.png` | 126 KB | 128 px, 34 KB |
| `reactions/dislike-off.png` | 111 KB | 128 px, 26 KB |
| **Total** | **1 295 KB** | **189 KB (−85 %)** |

Verificadas visualmente (re-codificación PNG sin paleta, sin pérdida de color).

## 6. Reducción de bundle

- Ruta crítica: **−484 KB gzip (−44.4 %)**, **−1 771 KB raw**.
- LiveKit, chat interno, `FloatingGift`, `RepostPostCard`, `StickerPickerSheet`, `EmojiPicker` y DeepAR salen de la carga inicial y se descargan bajo demanda (o por la precarga en reposo ya existente).

## 7. Reducción de solicitudes

- Solicitudes JS/CSS bloqueantes de la carga inicial: **129 → 65 (−49.6 %)**.
- Total de solicitudes a los ~3 s: 177–182 en ambos builds (la precarga en reposo de rutas, ya existente, descarga el resto de chunks después del primer render). La mejora está en el orden y la ruta crítica, no en el total.
- Firestore: se eliminan 2 listeners permanentes por usuario (`NotificationBell`) y las escrituras repetidas de inbox entregado. Socket.IO: un único socket por sesión en lugar de uno por llamada. Estos tres puntos requieren sesión iniciada y no se cuantificaron en el A/B sin sesión.
- Visitas repetidas: `/assets/**` con caché inmutable de 1 año (sin revalidación).

## 8. Memoria

- Slow 4G, heap a load + 4 s: 54–60 MB → 23 MB.
- Wi-Fi, heap estable: ~23–24 MB en ambos (sin diferencia significativa).
- `<video>` de warmup: antes sin límite, ahora máximo 3 retenidos (memoria acotada en scroll largo; corrección por código, no cuantificada en A/B).

## 9. Compatibilidad probada

Build nuevo, `Emulation.setDeviceMetricsOverride`, verificación de `scrollWidth` = ancho de viewport y ningún elemento fuera de pantalla (excluyendo carruseles), más capturas.

| Resolución | Orientación | Página | Resultado |
|---|---|---|---|
| 320×568 | vertical | `/explorar` | OK, sin scroll horizontal |
| 360×640 | vertical | `/explorar` | OK |
| 390×844 | vertical | `/login` | OK |
| 568×320 | horizontal | `/login` | OK |
| 768×1024 | vertical | `/login` | OK |
| 1024×768 | horizontal | `/explorar` | OK |
| 1440×900 | horizontal | `/explorar` | OK (sidebar visible) |
| 1920×1080 | horizontal | `/explorar` | OK |
| 3840×2160 | horizontal | `/explorar` | OK |

Comparación visual antes/después en 1024×691: idéntica.

Tests:
- `npm run build -w apps/web` (incluye `tsc --noEmit`, que es el lint del proyecto): OK.
- Backend `npm test --prefix backend`: **139/139 OK** (billetera, decimales, conversión de pagos, compra BLAST, Excel de retiros, regalos alpha / ingest, superadmin, auditoría admin, ajustes de billetera, etc.).
- Frontend (`tsx`): `giftMedia`, `giftLayout`, `superAdmin`, `admin/api`, `creatorRanking`, `searchMatch`, `screenShareSession`: **7/7 OK**.

## 10. Problemas no corregidos y motivo

Detalle en la tabla final de `PERFORMANCE_AUDIT.md`. Resumen:

- **Modelo de datos Firestore** (historias ~170 listeners, reacciones / comentarios por tarjeta, amigos / seguidores sin `limit`, `postViews`): requieren contadores agregados y cambios de backend; tocan Publicaciones / Flash Boom / Perfil.
- **LIVE y regalos** (`listenLiveGifts`, `listenLiveViewers`, `processGiftAlphaQueue`): lógica LIVE / motor de regalos congelado.
- **Mensajes** (`listenConversations` ×9, escrituras de "escribiendo"): requiere store compartido (refactor de módulo).
- **Avatares de 1080 px**: requiere pipeline de miniaturas en backend + migración.
- **i18n completo en bundle y CSS único de 689 KB**: riesgo de parpadeo de idioma / orden de cascada.
- **CLS 0.25 en `/explorar` sin sesión**: igual antes y después; corregirlo implica cambio de layout.
- **Sondeos con pestaña oculta** en `NotificationBell` y presencia de llamadas: afectan alertas de LIVE y llamadas entrantes.
- **Métricas de producción después del deploy**: la navegación automatizada a producción no fue autorizada; las mediciones posteriores se hicieron en A/B local.
