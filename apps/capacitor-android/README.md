# LiveBoom Android (Capacitor)

Proyecto nativo Android que empaqueta la app web (`apps/web`) con Capacitor.

## Requisitos

- Node 20+
- Android Studio (SDK 35 / JDK 21 recomendados)
- Emulador o dispositivo USB con depuración

## Primera vez

```bash
# Desde la raíz del monorepo
npm install
npm run build -w @liveboom/web

cd apps/capacitor-android
npm install
npx cap add android
npx cap sync android
npx cap open android
```

En Android Studio: Run ▶ en un emulador o dispositivo.

## Actualizar la UI web dentro de la app

```bash
cd apps/capacitor-android
npm run sync
# o: npm run open
```

`sync` hace build de `apps/web`, copia `dist` al proyecto Android y aplica el override nativo del play gigante de WebView (`getDefaultVideoPoster`).

## Play nativo gigante (solo APK/AAB)

Android WebView dibuja un triángulo de play enorme en `<video>` mientras carga. **No se quita con CSS ni con un deploy de hosting.** Hay que regenerar el APK/AAB:

1. `cd apps/capacitor-android && npm run sync`
2. En Android Studio: Generate Signed Bundle / APK

`sync` parchea `MainActivity` para devolver un bitmap transparente en `getDefaultVideoPoster`. El bundle web también pone un `poster` 1×1 y oculta controles HTML5.

## Notas

- `webDir` apunta a `../web/dist` (ver `capacitor.config.json`).
- App ID: `com.liveboom.app`
- El menú móvil de LiveBoom (bottom nav) es el que se usa en el WebView; no hace falta otro menú nativo.
- Para apuntar a producción en vivo (sin rebuild local), puedes añadir temporalmente en `capacitor.config.json`:

```json
"server": { "url": "https://liveboomapp.com", "cleartext": false }
```

(Quitar `url` para volver al bundle embebido.)
