package com.liveboom.app;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Entrega a la web el alto real de las barras del sistema (en px CSS) y permite pintar la
 * barra de navegación de Android con el color de la barra inferior de LiveBoom.
 * Copiado por scripts/apply-native.mjs en `npm run sync`.
 */
@CapacitorPlugin(name = "LiveBoomSystemInsets")
public class SystemInsetsPlugin extends Plugin {

    private JSObject last = emptyInsets();

    private static JSObject emptyInsets() {
        JSObject data = new JSObject();
        data.put("top", 0);
        data.put("bottom", 0);
        data.put("left", 0);
        data.put("right", 0);
        data.put("ready", false);
        return data;
    }

    @Override
    public void load() {
        final View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = v.getResources().getDisplayMetrics().density;
            JSObject data = new JSObject();
            data.put("top", bars.top / density);
            data.put("bottom", bars.bottom / density);
            data.put("left", bars.left / density);
            data.put("right", bars.right / density);
            data.put("ready", true);
            last = data;
            notifyListeners("change", data);
            // El WebView también necesita los insets para su propio env(safe-area-inset-*).
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
        webView.post(() -> ViewCompat.requestApplyInsets(webView));
    }

    @PluginMethod
    public void get(PluginCall call) {
        call.resolve(last);
    }

    /** { light: boolean, color?: "#rrggbb" } — color solo aplica en Android 14 o menor. */
    @PluginMethod
    public void setNavigationBarStyle(PluginCall call) {
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        final String color = call.getString("color", null);
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightNavigationBars(light);
            if (color != null && Build.VERSION.SDK_INT < 35) {
                try {
                    window.setNavigationBarColor(Color.parseColor(color));
                } catch (IllegalArgumentException ignored) {
                    // color inválido: se deja el actual
                }
            }
            call.resolve();
        });
    }
}
