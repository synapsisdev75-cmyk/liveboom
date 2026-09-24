# Nota Play Console — LiveBoom 1.0.56 (Alpha)

**Versión:** 56 (1.0.56) · **Fecha:** 24 sep 2026 · **rama:** `main`

## Notas de la versión (copiar en Play Console)

```
LiveBoom 1.0.56

• Recarga BLAST: pago Wompi en pestaña segura (Nequi/PSE/tarjeta) sin perder sesión
• Al volver a la app, el saldo se acredita solo (webhook + verificación)
• Menos fallos intermitentes de recarga en móvil
• Incluye edge-to-edge Android 15 (1.0.55)
```

## Compilar

```bash
npm install
npm run android:sync
npx cap open android
```

Luego: Build → Generate Signed Bundle → subir a **Prueba cerrada — Alpha**.

## AAB generado (24 sep 2026)

- `apps/capacitor-android/android/app/build/outputs/bundle/release/app-release.aab`
- Copia lista para subir: `C:\Users\empre\Desktop\liveboom-aab\LiveBoom-1.0.56-56.aab`
