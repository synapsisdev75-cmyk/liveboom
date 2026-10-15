package com.liveboom.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Botón «Rechazar» de la notificación de llamada: cierra la notificación y avisa al servidor sin abrir la app.
 * Copiado por scripts/apply-native.mjs.
 */
public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!CallNotifications.ACTION_DECLINE.equals(intent.getAction())) return;
        final String callId = intent.getStringExtra(CallNotifications.EXTRA_CALL_ID);
        final String chatId = intent.getStringExtra(CallNotifications.EXTRA_CHAT_ID);
        final String uid = intent.getStringExtra("lb_call_uid");
        final String key = intent.getStringExtra("lb_call_key");
        final String api = intent.getStringExtra("lb_call_api");
        CallNotifications.cancelIncoming(context, callId);
        if (callId == null || chatId == null || uid == null || key == null || api == null || !api.startsWith("https://")) {
            return;
        }
        final PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                JSONObject body = new JSONObject();
                body.put("callId", callId);
                body.put("chatId", chatId);
                body.put("uid", uid);
                body.put("key", key);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection = (HttpURLConnection) new URL(api).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
                connection.getResponseCode();
            } catch (Exception ignored) {
                // Sin red: la llamada termina sola al vencer el tiempo de timbre.
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        }).start();
    }
}
