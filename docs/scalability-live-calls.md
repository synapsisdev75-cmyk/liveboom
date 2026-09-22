# Escalabilidad LiveBoom — fase 2 (hacia 5k)

## Comparativa: cómo lo resuelven los grandes

| Sistema | Señalización | Media A/V | Presencia viewers | Mensajes media |
|---------|--------------|-----------|-------------------|----------------|
| **WhatsApp / Telegram** | Servidores propios + colas | Opus/WebRTC o custom | No usan Firestore; presencia ephemeral en edge | CDN + lazy download al abrir |
| **Twitch** | IRC / PubSub | CDN HLS + baja latencia | Contadores agregados, no 1 write/viewer | N/A chat texto ligero |
| **LiveKit / mediasoup (OSS)** | HTTP tokens + data channel | SFU WebRTC | Participants en SFU; app no escribe DB por frame | — |
| **LiveBoom (Firebase)** | Cloud Functions + Firestore | LiveKit (LIVE/calls) + Agora (battles) | Subcolección `viewers/{uid}` + campo feed | Storage + carga bajo demanda |

**Lección clave:** nadie pone un heartbeat Firestore por viewer a 5k en *un* doc. La media va al SFU/CDN; la DB solo guarda estado agregado o presencia shardada con pocos writes.

## Meta “5k” — realismo por actividad

| Actividad | Antes (tabla) | Tras fase 1+2 (zona cómoda) | 5k ¿dónde? |
|-----------|---------------|-----------------------------|------------|
| Navegar feed | 1k–5k | **3k–8k** | Sí (global, lectura) |
| DM abiertos | 200–800 | **400–1.2k** | 5k = muchos clientes + lazy media |
| Llamadas 1:1 | 50–200 | **100–400** | 5k llamadas = plan LiveKit enterprise + busy sharded |
| Hosts LIVE | 20–80 | **30–100** | OK |
| Viewers **1** LIVE | 100–400 | **400–1.5k** (fase 2) | **5k en 1 sala** exige presencia fuera de Firestore (RTDB/`onDisconnect` o solo LiveKit) |
| Regalos/s | 5–20 | 5–20 (sin cambiar ledger aún) | Fase 3: ledger subcolección |

## Fase 2 aplicada

1. **Viewers:** `increment`/`−1` en join/leave (sin recount en cada entrada); reconcile host cada **36s**; heartbeat **25s**, TTL **60s**.
2. **Llamadas:** cache permisos + short-circuit amigos (4 lecturas, no 6).
3. **Turbo media chat:** audio/video `preload=none` + IntersectionObserver; fotos `loading=lazy` + `decoding=async`.
4. **API:** `minInstances: 1` (fase 1).

## Fase 3 (siguiente, para 5k viewers/sala)

1. Presencia en **RTDB** o solo métricas LiveKit participant count → feed.
2. Ledger de regalos `giftEvents/{id}` + agregador.
3. Busy de llamadas en docs por uid (ya) + rate limit tokens.
4. Observabilidad p95 join LiveKit / gift storm.

## Regresión

Publicaciones / Boom Clip / Flash Boom / editor de regalos: **no tocados**.
