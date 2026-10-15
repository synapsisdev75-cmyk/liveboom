package com.liveboom.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Permisos de cámara/micrófono/notificaciones/Bluetooth y notificaciones locales para LIVE y llamadas.
 * La presentación de pantalla nativa no está incluida en esta versión: esos métodos responden
 * "no disponible" y la web usa su camino normal. Copiado por scripts/apply-native.mjs.
 */
@CapacitorPlugin(
    name = "LiveMedia",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
        @Permission(alias = "bluetooth", strings = { "android.permission.BLUETOOTH_CONNECT" })
    }
)
public class LiveMediaPlugin extends Plugin {

    private static final String UNAVAILABLE = "Presentar pantalla no está disponible en esta versión de la app.";

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean notificationsGranted() {
        if (Build.VERSION.SDK_INT >= 33 && !granted("android.permission.POST_NOTIFICATIONS")) return false;
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean bluetoothGranted() {
        return Build.VERSION.SDK_INT < 31 || granted("android.permission.BLUETOOTH_CONNECT");
    }

    private boolean overlayGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
    }

    private JSObject avResult() {
        JSObject result = new JSObject();
        result.put("camera", granted(Manifest.permission.CAMERA));
        result.put("microphone", granted(Manifest.permission.RECORD_AUDIO));
        return result;
    }

    private JSObject essentialResult() {
        JSObject result = avResult();
        result.put("notifications", notificationsGranted());
        result.put("media", true);
        result.put("bluetooth", bluetoothGranted());
        result.put("overlay", overlayGranted());
        return result;
    }

    private JSObject micResult() {
        JSObject result = new JSObject();
        result.put("microphone", granted(Manifest.permission.RECORD_AUDIO));
        return result;
    }

    @PluginMethod
    public void prepareWebView(PluginCall call) {
        getActivity()
            .runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                if (webView != null) {
                    WebSettings settings = webView.getSettings();
                    settings.setMediaPlaybackRequiresUserGesture(false);
                }
                call.resolve();
            });
    }

    @PluginMethod
    public void checkAvPermissions(PluginCall call) {
        call.resolve(avResult());
    }

    @PluginMethod
    public void requestAvPermissions(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED && getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve(avResult());
            return;
        }
        requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "avPermissionsDone");
    }

    @PermissionCallback
    private void avPermissionsDone(PluginCall call) {
        call.resolve(avResult());
    }

    @PluginMethod
    public void checkMicrophonePermission(PluginCall call) {
        call.resolve(micResult());
    }

    @PluginMethod
    public void requestMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve(micResult());
            return;
        }
        requestPermissionForAlias("microphone", call, "micPermissionDone");
    }

    @PermissionCallback
    private void micPermissionDone(PluginCall call) {
        call.resolve(micResult());
    }

    @PluginMethod
    public void checkEssentialPermissions(PluginCall call) {
        call.resolve(essentialResult());
    }

    @PluginMethod
    public void requestEssentialPermissions(PluginCall call) {
        java.util.List<String> aliases = new java.util.ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && !granted("android.permission.POST_NOTIFICATIONS")) aliases.add("notifications");
        if (!bluetoothGranted()) aliases.add("bluetooth");
        if (aliases.isEmpty()) {
            call.resolve(essentialResult());
            return;
        }
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "essentialPermissionsDone");
    }

    @PermissionCallback
    private void essentialPermissionsDone(PluginCall call) {
        call.resolve(essentialResult());
    }

    @PluginMethod
    public void prepareScreenShare(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", overlayGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean ok = overlayGranted();
        result.put("granted", ok);
        if (!ok && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                result.put("openedSettings", true);
            } catch (Exception ignored) {
                result.put("openedSettings", false);
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestScreenCapture(PluginCall call) {
        call.unavailable(UNAVAILABLE);
    }

    @PluginMethod
    public void startNativeScreenCapture(PluginCall call) {
        call.unavailable(UNAVAILABLE);
    }

    @PluginMethod
    public void startNativeLiveKitScreenShare(PluginCall call) {
        call.unavailable(UNAVAILABLE);
    }

    @PluginMethod
    public void stopNativeLiveKitScreenShare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", false);
        result.put("active", false);
        call.resolve(result);
    }

    @PluginMethod
    public void stopNativeScreenCapture(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", false);
        result.put("active", false);
        call.resolve(result);
    }

    @PluginMethod
    public void showScreenShareOverlay(PluginCall call) {
        JSObject result = new JSObject();
        result.put("shown", false);
        result.put("permission", overlayGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void hideScreenShareOverlay(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setPresentationOverlaysVisible(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void updateScreenShareChatHud(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void updatePresentationHudState(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setNativeLiveKitDeviceAudioEnabled(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setNativeLiveKitGameAudioGain(PluginCall call) {
        call.resolve();
    }

    private static String channelId(String channel) {
        if ("calls".equals(channel)) return "liveboom_calls";
        if ("messages".equals(channel)) return "liveboom_messages";
        if ("friends".equals(channel)) return "liveboom_social";
        return "liveboom_general";
    }

    private static String channelName(String id) {
        if ("liveboom_calls".equals(id)) return "Llamadas";
        if ("liveboom_messages".equals(id)) return "Mensajes";
        if ("liveboom_social".equals(id)) return "Amigos y actividad";
        return "General";
    }

    private void ensureChannel(String id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(id) != null) return;
        manager.createNotificationChannel(new NotificationChannel(id, channelName(id), NotificationManager.IMPORTANCE_HIGH));
    }

    @PluginMethod
    public void showNotification(final PluginCall call) {
        final String title = call.getString("title", "LiveBoom");
        final String body = call.getString("body", "");
        final String channel = channelId(call.getString("channel", "general"));
        final int id = call.getInt("id", (int) (System.currentTimeMillis() & 0x7FFFFFFF));
        final String imageUrl = call.getString("imageUrl", "");
        new Thread(() -> {
            Context context = getContext();
            ensureChannel(channel);
            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(context, id, open, flags));
            Bitmap image = CallNotifications.loadAvatar(imageUrl);
            if (image != null) builder.setLargeIcon(image);
            try {
                NotificationManagerCompat.from(context).notify(id, builder.build());
            } catch (SecurityException ignored) {
                // Sin permiso de notificaciones.
            }
            JSObject result = new JSObject();
            result.put("id", id);
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void cancelNotification(PluginCall call) {
        Integer id = call.getInt("id");
        if (id != null) NotificationManagerCompat.from(getContext()).cancel(id);
        call.resolve();
    }
}
