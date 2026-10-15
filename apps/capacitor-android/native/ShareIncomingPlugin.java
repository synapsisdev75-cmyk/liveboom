package com.liveboom.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Menú «Compartir → LiveBoom»: copia los archivos recibidos al cache y se los entrega a la web.
 * Copiado por scripts/apply-native.mjs.
 */
@CapacitorPlugin(name = "ShareIncoming")
public class ShareIncomingPlugin extends Plugin {

    private static final int MAX_FILES = 10;
    private static ShareIncomingPlugin instance;
    private static JSObject pending;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        JSObject result = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(result);
    }

    static void handleIntent(final Activity activity, Intent intent) {
        if (intent == null) return;
        final String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        final Intent shared = new Intent(intent);
        intent.setAction(Intent.ACTION_MAIN);
        new Thread(() -> {
            JSObject payload = readShare(activity, shared);
            pending = payload;
            ShareIncomingPlugin plugin = instance;
            if (plugin != null) plugin.notifyListeners("shareReceived", payload);
        }).start();
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> list = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            Uri uri = Build.VERSION.SDK_INT >= 33
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        return uris;
    }

    private static JSObject readShare(Activity activity, Intent intent) {
        JSObject payload = new JSObject();
        String mime = intent.getType();
        payload.put("mimeType", mime == null ? "" : mime);
        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        payload.put("subject", subject == null ? "" : subject.toString());
        payload.put("text", text == null ? "" : text.toString());

        JSArray files = new JSArray();
        File dir = new File(activity.getCacheDir(), "shared");
        if (!dir.exists()) dir.mkdirs();
        ContentResolver resolver = activity.getContentResolver();
        int index = 0;
        for (Uri uri : streams(intent)) {
            if (index >= MAX_FILES) break;
            try {
                String name = displayName(resolver, uri);
                String type = resolver.getType(uri);
                if (type == null) type = mime == null ? "application/octet-stream" : mime;
                File out = new File(dir, System.currentTimeMillis() + "_" + index + "_" + safeName(name));
                long size = 0;
                try (InputStream in = resolver.openInputStream(uri); OutputStream os = new FileOutputStream(out)) {
                    if (in == null) continue;
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        os.write(buffer, 0, read);
                        size += read;
                    }
                }
                JSObject file = new JSObject();
                file.put("name", name);
                file.put("mimeType", type);
                file.put("size", size);
                file.put("path", out.getAbsolutePath());
                files.put(file);
                index++;
            } catch (Exception ignored) {
                // Archivo ilegible: se omite.
            }
        }
        payload.put("files", files);
        payload.put("fileCount", index);
        return payload;
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            // Sin nombre: se usa el último segmento.
        }
        String last = uri.getLastPathSegment();
        return last == null || last.isEmpty() ? "archivo" : last;
    }

    private static String safeName(String name) {
        return name.replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
