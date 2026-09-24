# Nota Play Console — LiveBoom 1.0.55 (Alpha)

**Versión:** 55 (1.0.55) · **Fecha:** 23 sep 2026 · **rama:** `main`

## Notas de la versión (copiar en Play Console)

```
LiveBoom 1.0.55

• Android 15: pantalla de borde a borde (edge-to-edge) con API moderna
• Barras de estado/navegación transparentes; notch y safe-area sin huecos negros
• Teclado del chat: resize nativo + layout web (sin doble margen)
• Cumple aviso Play Console sobre APIs obsoletas de system UI
```

## Compilar

```bash
npm install
npm run android:sync
npx cap open android
```

Luego: Build → Generate Signed Bundle → subir a **Prueba cerrada — Alpha**.

## AAB generado (23 sep 2026)

- `apps/capacitor-android/android/app/build/outputs/bundle/release/app-release.aab`
- Copia lista para subir: `C:\Users\empre\Desktop\liveboom-aab\LiveBoom-1.0.55-55.aab`
