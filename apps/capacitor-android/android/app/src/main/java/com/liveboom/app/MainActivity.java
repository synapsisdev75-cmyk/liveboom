package com.liveboom.app;

import android.graphics.Bitmap;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupTransparentVideoPoster();
    }

    /**
     * Reemplaza el póster de video por defecto del WebView de Android con un bitmap
     * transparente 1x1. Esto elimina el botón de play nativo (óvalo negro gigante)
     * que parpadea durante un microsegundo antes de que comience la reproducción
     * en el APK / AAB.
     */
    private void setupTransparentVideoPoster() {
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                    @Override
                    public Bitmap getDefaultVideoPoster() {
                        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
                    }
                });
            }
        } catch (Throwable ignored) {
        }
    }
}
