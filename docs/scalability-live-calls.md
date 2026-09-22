# Escalabilidad LiveBoom — fase 3 (5k viewers/sala)

## Qué cambió (arquitectura tipo Twitch/LiveKit)

| Antes | Ahora (fase 3) |
|-------|----------------|
| Contador = escanear subcolección Firestore | Contador = **participantes LiveKit** (SFU) |
| Cada viewer escribe heartbeat frecuente | Presencia Firestore solo panel/kick; HB **50s** |
| Feed `viewers` reescrito por sync | Host publica agregado (`publishLiveViewerAggregate`) |
| Todos escuchan N docs viewers | Todos escuchan **1 campo** en `liveRooms/{room}` |

Así se acerca al modelo de los grandes: **media/presencia en el SFU**, DB solo agregados.

## Zona cómoda orientativa

| Actividad | Fase 2 | Fase 3 |
|-----------|--------|--------|
| Viewers / 1 LIVE | 400–1.5k | **1k–5k*** |
| Feed global | 3k–8k | 3k–8k |
| Llamadas 1:1 | 100–400 | + rate limit 30/min/uid |

\*5k depende del **plan LiveKit** y de la red; Firestore ya no es el cuello del contador.

## Rate limits (API)

- `GET /api/stream/token/:room` → 90/min/uid  
- `POST /api/calls/start` → 30/min/uid  

## Pendiente (fase 3b)

- Ledger de regalos fuera del doc padre (tormenta de gifts).  
- RTDB/`onDisconnect` si se quiere presencia lista sin LiveKit.  
- Panel host 100% desde LiveKit remotes (hoy sigue usando docs presencia + kick).

## Regresión

No tocar Publicaciones / Boom Clip / Flash Boom / editor de regalos.
