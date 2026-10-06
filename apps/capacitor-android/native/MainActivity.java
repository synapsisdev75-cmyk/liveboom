package com.liveboom.app;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Copiado por scripts/apply-native.mjs en `npm run sync`. No editar la copia dentro de android/.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemInsetsPlugin.class);
        super.onCreate(savedInstanceState);

        // Android pinta un velo gris sobre la barra de botones en apps edge-to-edge;
        // sin él, la barra inferior de LiveBoom queda visible detrás de los botones.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

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
