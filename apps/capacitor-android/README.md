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

## Ícono de play gigante al cargar videos (solo APK/AAB)

El WebView de Android dibuja un **ícono de play gigante** como poster por defecto sobre
cualquier `<video>` que aún no renderizó su primer frame (en Explorar se ve un instante
al cambiar de video). En navegador no pasa; es comportamiento nativo del WebView
(`WebChromeClient.getDefaultVideoPoster()`), y Capacitor no lo sobreescribe.

La app web ya mitiga esto poniendo siempre un `poster` en sus videos, pero para
eliminarlo de raíz en **todos** los videos de la app, tras `npx cap add android`
reemplaza `android/app/src/main/java/com/liveboom/app/MainActivity.java` por:

```java
package com.liveboom.app;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // El WebView usa un ícono de play gigante como poster por defecto de <video>.
        // Devolver un bitmap transparente evita ese flash en APK/AAB.
        this.getBridge()
            .getWebView()
            .setWebChromeClient(
                new BridgeWebChromeClient(this.getBridge()) {
                    @Override
                    public Bitmap getDefaultVideoPoster() {
                        Bitmap pixel = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                        pixel.eraseColor(Color.TRANSPARENT);
                        return pixel;
                    }
                }
            );
    }
}
```

Luego recompila el APK/AAB normalmente (`npm run sync` + Android Studio).

## Notas

- `webDir` apunta a `../web/dist` (ver `capacitor.config.json`).
- App ID: `com.liveboom.app`
- El menú móvil de LiveBoom (bottom nav) es el que se usa en el WebView; no hace falta otro menú nativo.
- Para apuntar a producción en vivo (sin rebuild local), puedes añadir temporalmente en `capacitor.config.json`:

```json
"server": { "url": "https://liveboomapp.com", "cleartext": false }
```

(Quitar `url` para volver al bundle embebido.)
