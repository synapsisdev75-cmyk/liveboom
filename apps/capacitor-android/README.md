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

## Poster por defecto del WebView (círculo negro + play)

Android WebView pinta un poster del sistema (fondo gris + círculo con ▶) en cualquier
`<video>` sin atributo `poster` hasta que decodifica el primer frame. En el navegador no
ocurre; en APK/AAB se ve un flash en Explorar / visores.

La app web ya lo evita (`apps/web/src/hooks/useWebViewBlankPoster.ts`: poster transparente
solo en nativo hasta `loadeddata`). Como refuerzo, el proyecto nativo puede devolver un
bitmap transparente desde `getDefaultVideoPoster()`; así ningún `<video>` de la app puede
mostrar el icono. Editar `android/app/src/main/java/com/liveboom/app/MainActivity.java`:

```java
package com.liveboom.app;

import android.graphics.Bitmap;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
      @Override
      public Bitmap getDefaultVideoPoster() {
        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
      }
    });
  }
}
```

(`android/` no está versionado; aplicar tras `npx cap add android`. `npx cap sync` no lo pisa.)

## Notas

- `webDir` apunta a `../web/dist` (ver `capacitor.config.json`).
- App ID: `com.liveboom.app`
- El menú móvil de LiveBoom (bottom nav) es el que se usa en el WebView; no hace falta otro menú nativo.
- Para apuntar a producción en vivo (sin rebuild local), puedes añadir temporalmente en `capacitor.config.json`:

```json
"server": { "url": "https://liveboomapp.com", "cleartext": false }
```

(Quitar `url` para volver al bundle embebido.)
