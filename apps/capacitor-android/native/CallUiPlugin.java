package com.liveboom.app;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente de la llamada nativa con la web: qué tocó el usuario en la notificación (contestar / abrir)
 * y cierre de la pantalla de llamada sobre el bloqueo. Copiado por scripts/apply-native.mjs.
 */
@CapacitorPlugin(name = "LiveBoomCalls")
public class CallUiPlugin extends Plugin {

    private static CallUiPlugin instance;
    private static JSObject pending;

    @Override
    public void load() {
        instance = this;
    }

    static void deliver(String callId, String chatId, String action, String href) {
        JSObject event = new JSObject();
        event.put("callId", callId == null ? "" : callId);
        event.put("chatId", chatId == null ? "" : chatId);
        event.put("action", action == null ? "show" : action);
        event.put("href", href == null ? "" : href);
        pending = event;
        CallUiPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("callAction", event);
    }

    @PluginMethod
    public void consumeAction(PluginCall call) {
        JSObject result = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            fullScreen = manager == null || manager.canUseFullScreenIntent();
        }
        result.put("available", true);
        result.put("fullScreen", fullScreen);
        result.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        Intent intent;
        Uri pkg = Uri.parse("package:" + getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= 34) {
            intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception error) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /**
     * La llamada se contestó o terminó en la app: quita el timbre. Con `release` (llamada terminada)
     * la app deja de mostrarse sobre el bloqueo.
     */
    @PluginMethod
    public void endIncoming(PluginCall call) {
        CallNotifications.cancelIncoming(getContext(), call.getString("callId", ""));
        if (Boolean.TRUE.equals(call.getBoolean("release", false)) && getActivity() instanceof MainActivity) {
            final MainActivity activity = (MainActivity) getActivity();
            activity.runOnUiThread(() -> activity.showOverLockScreen(false));
        }
        call.resolve();
    }
}
