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

## Poster por defecto del WebView (play gris gigante)

En APK/AAB el WebView de Android pinta **su propio poster** (un botón de play gris
estirado) sobre cualquier `<video>` que no tenga atributo `poster`, mientras no hay
primer frame. En el navegador no pasa, por eso solo se ve en la app compilada.

La web ya envía un poster transparente en el reproductor de Publicaciones/Boom Clip/
Flash Boom/Explorar y en las capas ambient (`BLANK_VIDEO_POSTER` en
`apps/web/src/lib/videoPoster.ts`), así que basta con `npm run sync` para que
desaparezca ahí.

Si aparece en alguna pantalla nueva (LIVE, chat, anuncios…), se puede desactivar de
raíz en el nativo, una sola vez, en `android/app/src/main/java/com/liveboom/app/MainActivity.java`:

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
    // Sin esto, el WebView usa su poster gris con botón de play en cada <video>.
    getBridge()
        .getWebView()
        .setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
              @Override
              public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
              }
            });
  }
}
```

`android/` se genera con `npx cap add android`; si se regenera, hay que volver a
aplicar este override.
