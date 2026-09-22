# Nota Play Console — LiveBoom 1.0.50 (Alpha)

**Versión:** 50 (1.0.50) · **Fecha:** 22 sep 2026 · **main:** `c344e35`

## Notas de la versión (copiar en Play Console)

```
LiveBoom 1.0.50

• LIVE: más espectadores por sala (contador vía LiveKit, menos carga en el móvil)
• LIVE: regalos más estables en picos (ledger por donador, sin congelar la sala)
• Llamadas voz/video: conexión más rápida y límites anti-abuso
• Mensajes: carga turbo de fotos, notas de audio y video (solo al verlas)
• PC: panel derecho con despliegue tipo hoja; chat con animaciones suaves
• Rendimiento general alineado con liveboomapp.com (escalabilidad fase 1–3b)
```

## Compilar

```bash
npm install
npm run android:sync
npx cap open android
```

Luego: Build → Generate Signed Bundle → subir a **Prueba cerrada — Alpha**.

## AAB generado (22 sep 2026)

- `apps/capacitor-android/android/app/build/outputs/bundle/release/app-release.aab`
- Copia lista para subir: `C:\Users\empre\Desktop\liveboom-aab\LiveBoom-1.0.50-50.aab`
