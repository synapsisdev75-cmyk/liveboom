# Stress simulator — LiveBoom

Simulador de carga en **Node 20+** (sin instalar k6). Mide latencia p50/p95/p99, RPS y tasa de error por fase.

## Setup rápido

```powershell
cd c:\Users\empre\Desktop\liveboom
copy tools\stress-sim\.env.example tools\stress-sim\.env
```

Edita `.env` y pega un **Firebase ID token** de una cuenta de prueba:

1. Abre https://liveboomapp.com e inicia sesión.
2. DevTools → Application / Network → cualquier `/api/...` → header `Authorization: Bearer …`
3. Copia el token a `STRESS_TOKEN=...`
4. Pon `STRESS_ROOM=` al username de un host LIVE de prueba (para tokens).

## Comandos (desde la raíz del monorepo)

```powershell
# Seguro: solo health (sin auth)
npm run stress:health

# Tokens LiveKit (necesita STRESS_TOKEN + STRESS_ROOM)
npm run stress:tokens -- --room mihost --vus 30 --duration 30

# Mixto: health + profile + tokens
npm run stress:mixed -- --room mihost --vus 40 --duration 45

# Llamadas (señalización): start + release. Requiere amigo en STRESS_CALL_TARGET_UID
npm run stress:calls -- --call-target UID_DEL_AMIGO --call-type audio --vus 1 --duration 30

# Suite segura (health → profile → tokens → mixed)
npm run stress:all -- --room mihost --vus 20 --duration 20
```

### Fases destructivas (opt-in)

```powershell
# Gasta coins reales — solo en cuentas/rooms de prueba
npm run stress:gifts -- --room mihost --gift boom_saludo --allow-gifts

# Escribe heartbeats en Firestore (Admin SDK + credenciales)
# Requiere GOOGLE_APPLICATION_CREDENTIALS y STRESS_ALLOW_FIRESTORE=1
npm run stress:presence -- --room mihost --vus 50 --duration 60 --allow-firestore
```

## Criterios de pase (por defecto)

| Fase | p95 | error rate |
|------|-----|------------|
| health | ≤ 500 ms | ≤ 2% |
| tokens | ≤ 800 ms | ≤ 1% |
| profile / mixed | ≤ 700–800 ms | ≤ 2% |
| calls (start+release) | ≤ 1200 ms | ≤ 5% |
| gifts | ≤ 2000 ms | ≤ 5% |

## Qué cubre / qué no

| Cubierto | No cubierto (aún) |
|----------|-------------------|
| Function `api` (health, profile, mint token LIVE) | WebRTC real de LiveKit SFU |
| Señalización llamadas (`/api/calls/start` + release) | Calidad audio/video (RTT, freeze) |
| Fan-out HTTP concurrente | UI / listeners `onSnapshot` del cliente |
| Heartbeats Firestore (fase presence) | Chat DM typing storm |
| Regalos API (opt-in) | Batallas Agora |

**Nota calls:** con 1 token solo 1 VU (lock “ya en llamada”). Para N llamadas concurrentes hace falta N tokens (`STRESS_TOKENS`) de cuentas distintas.

## Seguridad

- Nunca subas `tools/stress-sim/.env` ni tokens.
- No corras `gifts` / `presence` contra producción con usuarios reales.
- Empieza con `--vus 10 --duration 15` y sube.
