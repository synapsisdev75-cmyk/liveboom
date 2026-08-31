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

`sync` hace build de `apps/web` y copia `dist` al proyecto Android.

## Notas

- `webDir` apunta a `../web/dist` (ver `capacitor.config.json`).
- App ID: `com.liveboom.app`
- El menú móvil de LiveBoom (bottom nav) es el que se usa en el WebView; no hace falta otro menú nativo.
- Para apuntar a producción en vivo (sin rebuild local), puedes añadir temporalmente en `capacitor.config.json`:

```json
"server": { "url": "https://liveboomapp.com", "cleartext": false }
```

(Quitar `url` para volver al bundle embebido.)
