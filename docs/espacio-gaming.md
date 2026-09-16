# Espacio Gaming (LiveBoom)

## Decisión de arquitectura

LiveBoom es **una sola app Capacitor + web** (PC / tablet / Android). No se crea un monorepo React Native paralelo: rompe paridad, duplica LiveKit/Firebase y contradice las reglas del repo.

El **Espacio Gaming** se construye como módulo dentro de `apps/web` + plugins nativos Android existentes (`LiveMedia` / MediaProjection), reutilizando el SFU LiveKit y el backend actuales.

El documento de producto tipo OBS / RN 0.74 / Rust NAPI-RS queda como **roadmap de capacidades**, no como stack de reemplazo.

## Fase 1 (hecha)

- Quitar **Compartir pantalla** en Android nativo (sigue en PC/web).
- Botón **Espacio Gaming** en Crear (solo app Android).
- Ruta `/espacio-gaming` con wizard (pantalla completa / app + audio obligatorio).
- Handoff a `/transmitir` → LIVE con `gamingSpace: true`.

## Fase 2 (hecha)

- En LIVE con `gamingSpace`: CTA **Presentar juego** + tool **Presentar**.
- Wizard audio obligatorio → captura nativa → chat flotante + chip Presentación + PiP cámara circular.
- Dejar de presentar no finaliza el LIVE.
- Sesión gaming recordada en `sessionStorage` hasta Finalizar live.

## Fase 3 (hecha · base)

- Mixer UI (faders mic/juego) in-app al presentar en Espacio Gaming.
- HUD minimizado sobre el juego: **Mic / Audio / Salir**.
- Telemetría básica: bitrate + RTT en panel de estado.
- Diferido: sentiment chat, egress cloud.

## Entradas

| Superficie | Acción |
|------------|--------|
| Crear (Android) | Espacio Gaming |
| LIVE PC | Compartir pantalla (clásico) |
| LIVE Android | Sin Pantalla; usar Espacio Gaming |
