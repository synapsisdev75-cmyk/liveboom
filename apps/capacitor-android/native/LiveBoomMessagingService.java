package com.liveboom.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Recibe los push de FCM. Las llamadas llegan como mensajes de datos (con la app cerrada o el teléfono
 * bloqueado también) y se muestran con CallNotifications; el resto sigue al plugin de push de Capacitor.
 * Copiado por scripts/apply-native.mjs.
 */
public class LiveBoomMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if ("call_incoming".equals(type)) {
            // Con LiveBoom abierta y a la vista, la llamada ya suena dentro de la app.
            if (!MainActivity.isInForeground()) {
                CallNotifications.showIncoming(getApplicationContext(), data);
            }
            return;
        }
        if ("call_ended".equals(type)) {
            CallNotifications.cancelIncoming(getApplicationContext(), data.get("callId"));
            if ("missed".equals(data.get("outcome"))) {
                CallNotifications.showMissed(getApplicationContext(), data);
            }
            return;
        }
        super.onMessageReceived(remoteMessage);
    }
}
