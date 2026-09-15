package com.liveboom.app;

import android.graphics.Bitmap;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Referencia versionada del MainActivity de Capacitor.
 * `scripts/apply-android-overrides.mjs` lo aplica tras `cap sync` / `cap add`.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    hideDefaultVideoPoster();
  }

  /** LIVEBOOM: hide Android WebView default video play overlay */
  private void hideDefaultVideoPoster() {
    if (bridge == null || bridge.getWebView() == null) {
      return;
    }
    bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
      @Override
      public Bitmap getDefaultVideoPoster() {
        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
      }
    });
  }
}
