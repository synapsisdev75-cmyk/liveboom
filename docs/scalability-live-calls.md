# Escalabilidad LiveBoom — LIVE, viewers y llamadas 1:1

Guía operativa (22 sep 2026). Objetivo: soportar alto flujo sin reescribir todo el producto.

## Principios

1. **Separar planos**: señalización (Firestore/API) ≠ media (LiveKit/Agora).
2. **Evitar documentos calientes**: un doc no debe recibir cientos de writes/s.
3. **Presencia shardada**: 1 doc por viewer (`liveRooms/{room}/viewers/{uid}`), no reescribir el padre en cada heartbeat.
4. **Agregar, no escanear** cuando el volumen crezca (counters / RTDB / agregación periódica).
5. **Medir con stress-sim** antes y después (`tools/stress-sim`).

## Ya aplicado (fase 1)

| Cambio | Efecto |
|--------|--------|
| Heartbeat viewer 12s → **20s** | ~40% menos writes de presencia |
| Host: un solo timer **18s** (eliminado pulso duplicado 10s) | ~50% menos writes de heartbeat de sala |
| Debounce host heartbeat 8s | Evita ráfagas al remontar UI |
| `syncLiveViewerCount` solo actualiza feed si el número **cambió** | Menos writes a `liveRooms/{room}` |
| `ensureCallRoom` en background | Menos latencia al mint JWT |
| Function `api`: `minInstances: 1`, `concurrency: 80` | Menos cold start |
| Cache TTL permisos de llamada (20s allow / 5s deny) | Menos lecturas Firestore en `/api/calls/start` |

## Capacidad orientativa tras fase 1

| Escenario | Antes (estimado) | Después (estimado) |
|-----------|------------------|--------------------|
| Viewers en 1 LIVE | 100–400 cómodo | **250–700** cómodo (menos write pressure) |
| Hosts LIVE concurrentes | 20–80 | Similar; API más estable con minInstances |
| Llamadas 1:1 señalización | 50–200 | Mejor p95 por cache + JWT sin await createRoom |

Sigue sin ser un SLA: validar con `npm run stress:tokens`, `stress:calls`, `stress:presence`.

## Fase 2 (siguiente, mayor impacto)

1. **Contador de viewers con `increment`/`decrement`** en join/leave + reconcile raro (cada N minutos), en lugar de `getDocs` completo en el host.
2. **Ledger de regalos** en `liveRooms/{room}/giftEvents/{id}` y agregar `coinsEarned` / top en Cloud Function o cada 1–2s — sacar el map `gifters` del doc padre.
3. **LiveKit**: región cercana a LatAm + tope blando de viewers en token si el plan lo exige.
4. **RTDB o Firestore + `onDisconnect`** para presencia (cleanup automático en caídas de red).
5. **Cola de regalos** por sala (worker) si hay tormentas >20 gifts/s.

## Fase 3 (plataforma)

- CDN / cache HTTP para catálogos y assets.
- Rate limits por UID en `/api/stream/token` y `/api/calls/start`.
- Observabilidad: p95 tokens, error rate gifts, LiveKit join failures (Cloud Monitoring + dashboards).
- Multi-región solo cuando LatAm + otro continente lo justifiquen (coste alto).

## Cómo probar

```powershell
npm run stress:health -- --vus 20 --duration 20
npm run stress:tokens -- --room mihost --vus 30 --duration 30
npm run stress:calls -- --call-target UID_AMIGO --vus 1 --duration 30
# Opcional (escribe Firestore):
npm run stress:presence -- --room mihost --vus 50 --duration 60 --allow-firestore
```

## Reglas de oro al tocar este código

- No cachear `claimUsersBusy` (rompe exclusión mutua de llamadas).
- No subir el intervalo de viewer por encima de `LIVE_VIEWER_HEARTBEAT_TTL_MS` (45s) sin margen.
- No meter lógica de Publicaciones/Boom Clip dentro de `liveGiftsFirestore` sin props/modo explícito.
- Tras cambios de presencia: probar host + 2 viewers móvil/PC y que el contador del feed no se quede pegado.
