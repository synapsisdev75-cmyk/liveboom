import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * APK/AAB: Android WebView pinta un play nativo gigante en <video> sin poster.
 * CSS no lo quita. Hay que devolver un bitmap transparente en getDefaultVideoPoster.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const androidRoot = path.resolve(here, '../android');
const srcRoot = path.join(androidRoot, 'app/src/main');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/MainActivity\.(java|kt)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function readPackage(source) {
  const match = source.match(/package\s+([A-Za-z0-9_.]+)/);
  return match?.[1] || 'com.liveboom.app';
}

function javaSource(pkg) {
  return `package ${pkg};

import android.graphics.Bitmap;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

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
`;
}

function kotlinSource(pkg) {
  return `package ${pkg}

import android.graphics.Bitmap
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient

class MainActivity : BridgeActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    hideDefaultVideoPoster()
  }

  /** LIVEBOOM: hide Android WebView default video play overlay */
  private fun hideDefaultVideoPoster() {
    val webView = bridge?.webView ?: return
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.webChromeClient = object : BridgeWebChromeClient(bridge) {
      override fun getDefaultVideoPoster(): Bitmap {
        return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
      }
    }
  }
}
`;
}

const files = [...walk(path.join(srcRoot, 'java')), ...walk(path.join(srcRoot, 'kotlin'))];
if (files.length === 0) {
  console.warn(
    '[android-overrides] No hay MainActivity. Ejecuta `npx cap add android` y vuelve a sync.',
  );
  process.exit(0);
}

for (const file of files) {
  const current = fs.readFileSync(file, 'utf8');
  if (current.includes('getDefaultVideoPoster') && current.includes('LIVEBOOM: hide Android WebView')) {
    console.log('[android-overrides] Ya aplicado:', file);
    continue;
  }
  const pkg = readPackage(current);
  const next = file.endsWith('.kt') ? kotlinSource(pkg) : javaSource(pkg);
  fs.writeFileSync(file, next);
  console.log('[android-overrides] MainActivity actualizada:', file);
}
