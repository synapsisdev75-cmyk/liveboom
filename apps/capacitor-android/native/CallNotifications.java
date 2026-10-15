package com.liveboom.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Shader;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Llamada entrante a pantalla completa (también con el teléfono bloqueado) con la foto de quien llama,
 * y aviso de llamada perdida. Copiado por scripts/apply-native.mjs.
 */
public final class CallNotifications {

    static final String CHANNEL_RING = "liveboom_calls_ring";
    static final String CHANNEL_MISSED = "liveboom_calls_missed";
    static final String EXTRA_CALL = "lb_call";
    static final String EXTRA_ACTION = "lb_call_action";
    static final String EXTRA_CALL_ID = "lb_call_id";
    static final String EXTRA_CHAT_ID = "lb_call_chat_id";
    static final String EXTRA_HREF = "lb_call_href";
    static final String ACTION_DECLINE = "com.liveboom.app.CALL_DECLINE";
    private static final long RING_TIMEOUT_MS = 45_000L;
    private static final int AVATAR_PX = 256;

    private CallNotifications() {}

    static int ringId(String callId) {
        return 0x4C420000 | (callId.hashCode() & 0xFFFF);
    }

    static int missedId(String callId) {
        return 0x4C430000 | (callId.hashCode() & 0xFFFF);
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (manager.getNotificationChannel(CHANNEL_RING) == null) {
            NotificationChannel ring = new NotificationChannel(
                CHANNEL_RING,
                "Llamadas entrantes",
                NotificationManager.IMPORTANCE_HIGH
            );
            ring.setDescription("Pantalla de llamada con la foto de quien te llama");
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ring.setSound(
                sound,
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            ring.enableVibration(true);
            ring.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
            ring.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            ring.setBypassDnd(false);
            manager.createNotificationChannel(ring);
        }
        if (manager.getNotificationChannel(CHANNEL_MISSED) == null) {
            NotificationChannel missed = new NotificationChannel(
                CHANNEL_MISSED,
                "Llamadas perdidas",
                NotificationManager.IMPORTANCE_HIGH
            );
            missed.setDescription("Llamadas que no contestaste");
            missed.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(missed);
        }
    }

    private static String value(Map<String, String> data, String key) {
        String v = data.get(key);
        return v == null ? "" : v.trim();
    }

    private static String callerName(Map<String, String> data) {
        String name = value(data, "fromName");
        if (!name.isEmpty()) return name;
        String handle = value(data, "fromHandle");
        return handle.isEmpty() ? "LiveBoom" : "@" + handle;
    }

    /** Descarga la foto y la recorta en círculo; null si no hay foto o falla la red. */
    static Bitmap loadAvatar(String url) {
        if (url == null || !url.startsWith("https://")) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setInstanceFollowRedirects(true);
            try (InputStream input = connection.getInputStream()) {
                Bitmap raw = BitmapFactory.decodeStream(input);
                return raw == null ? null : circle(raw);
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static Bitmap circle(Bitmap source) {
        int side = Math.min(source.getWidth(), source.getHeight());
        int x = (source.getWidth() - side) / 2;
        int y = (source.getHeight() - side) / 2;
        Bitmap square = Bitmap.createBitmap(source, x, y, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, AVATAR_PX, AVATAR_PX, true);
        Bitmap output = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float r = AVATAR_PX / 2f;
        new Canvas(output).drawCircle(r, r, r, paint);
        return output;
    }

    private static Intent openAppIntent(Context context, Map<String, String> data, String action) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(EXTRA_CALL, true);
        intent.putExtra(EXTRA_ACTION, action);
        intent.putExtra(EXTRA_CALL_ID, value(data, "callId"));
        intent.putExtra(EXTRA_CHAT_ID, value(data, "chatId"));
        intent.putExtra(EXTRA_HREF, value(data, "href"));
        return intent;
    }

    private static int immutable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    static void showIncoming(Context context, Map<String, String> data) {
        String callId = value(data, "callId");
        if (callId.isEmpty()) return;
        ensureChannels(context);
        boolean video = "1".equals(value(data, "video"));
        String name = callerName(data);
        Bitmap avatar = loadAvatar(value(data, "avatarUrl"));
        int id = ringId(callId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | immutable();

        PendingIntent screen = PendingIntent.getActivity(context, id, openAppIntent(context, data, "show"), flags);
        PendingIntent answer = PendingIntent.getActivity(context, id + 1, openAppIntent(context, data, "answer"), flags);
        Intent declineIntent = new Intent(context, CallActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE);
        declineIntent.putExtra(EXTRA_CALL_ID, callId);
        declineIntent.putExtra(EXTRA_CHAT_ID, value(data, "chatId"));
        declineIntent.putExtra("lb_call_uid", value(data, "toUid"));
        declineIntent.putExtra("lb_call_key", value(data, "declineKey"));
        declineIntent.putExtra("lb_call_api", value(data, "declineUrl"));
        PendingIntent decline = PendingIntent.getBroadcast(context, id + 2, declineIntent, flags);

        Person.Builder caller = new Person.Builder().setName(name).setImportant(true);
        if (avatar != null) caller.setIcon(IconCompat.createWithBitmap(avatar));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_RING)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(name)
            .setContentText(video ? "Videollamada de LiveBoom" : "Llamada de LiveBoom")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setTimeoutAfter(RING_TIMEOUT_MS)
            .setContentIntent(screen)
            .setFullScreenIntent(screen, true)
            .setColor(0xFFE879F9)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller.build(), decline, answer));
        if (avatar != null) builder.setLargeIcon(avatar);

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // Sin permiso de notificaciones: la llamada sigue llegando dentro de la app.
        }
    }

    static void cancelIncoming(Context context, String callId) {
        if (callId == null || callId.isEmpty()) return;
        NotificationManagerCompat.from(context).cancel(ringId(callId));
    }

    static void showMissed(Context context, Map<String, String> data) {
        String callId = value(data, "callId");
        if (callId.isEmpty()) return;
        ensureChannels(context);
        boolean video = "1".equals(value(data, "video"));
        String name = callerName(data);
        Bitmap avatar = loadAvatar(value(data, "avatarUrl"));
        int id = missedId(callId);
        PendingIntent open = PendingIntent.getActivity(
            context,
            id,
            openAppIntent(context, data, "open"),
            PendingIntent.FLAG_UPDATE_CURRENT | immutable()
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MISSED)
            .setSmallIcon(android.R.drawable.sym_call_missed)
            .setContentTitle(name)
            .setContentText(video ? "Videollamada perdida" : "Llamada perdida")
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setColor(0xFFE879F9);
        if (avatar != null) builder.setLargeIcon(avatar);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // Sin permiso de notificaciones.
        }
    }
}
