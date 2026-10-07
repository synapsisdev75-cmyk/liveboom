package com.liveboom.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Copiado por scripts/apply-native.mjs en `npm run sync`. No editar la copia dentro de android/.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemInsetsPlugin.class);
        registerPlugin(AppPermissionsPlugin.class);
        registerPlugin(LiveMediaPlugin.class);
        registerPlugin(ShareIncomingPlugin.class);
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

                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        // Si LiveMedia ya obtuvo cámara y micrófono, conceder al WebView
                        // sin un segundo diálogo: si no, getUserMedia falla en el APK.
                        boolean waitingForRuntime = false;
                        for (String resource : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                    != PackageManager.PERMISSION_GRANTED) {
                                waitingForRuntime = true;
                            }
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                    != PackageManager.PERMISSION_GRANTED) {
                                waitingForRuntime = true;
                            }
                        }
                        if (!waitingForRuntime) {
                            request.grant(request.getResources());
                            return;
                        }
                        super.onPermissionRequest(request);
                    }
                }
            );
    }
}
