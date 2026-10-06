package com.liveboom.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Estado real de permisos de ejecución y acceso a los ajustes de la app.
 * La solicitud sigue siendo contextual (getUserMedia / geolocalización del WebView);
 * aquí solo se distingue "denegado" de "bloqueado" (no volver a preguntar) y se abren los ajustes.
 * Copiado por scripts/apply-native.mjs en `npm run sync`.
 */
@CapacitorPlugin(name = "LiveBoomPermissions")
public class AppPermissionsPlugin extends Plugin {

    private static final String PREFS = "liveboom_permissions";

    private static String androidPermission(String name) {
        if ("camera".equals(name)) return Manifest.permission.CAMERA;
        if ("microphone".equals(name)) return Manifest.permission.RECORD_AUDIO;
        if ("location".equals(name)) return Manifest.permission.ACCESS_COARSE_LOCATION;
        if ("preciseLocation".equals(name)) return Manifest.permission.ACCESS_FINE_LOCATION;
        return null;
    }

    /** { permission: camera|microphone|location|preciseLocation } → { state: granted|prompt|denied|blocked } */
    @PluginMethod
    public void check(PluginCall call) {
        String permission = androidPermission(call.getString("permission", ""));
        if (permission == null) {
            call.reject("Permiso no soportado");
            return;
        }
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        if (ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
            result.put("state", "granted");
        } else if (!prefs.getBoolean(permission, false)) {
            result.put("state", "prompt");
        } else if (ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission)) {
            result.put("state", "denied");
        } else {
            result.put("state", "blocked");
        }
        call.resolve(result);
    }

    /** La web avisa que ya se mostró la solicitud del sistema (para detectar "no volver a preguntar"). */
    @PluginMethod
    public void markRequested(PluginCall call) {
        String permission = androidPermission(call.getString("permission", ""));
        if (permission != null) {
            getContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(permission, true)
                .apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().startActivity(intent);
        call.resolve();
    }
}
