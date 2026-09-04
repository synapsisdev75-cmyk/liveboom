# Liveboom — Google Play Console

Usa estos valores al crear y configurar la app. El **nombre del paquete no se puede cambiar** después de crear la ficha.

## 1. Pantalla «Crear aplicación»

Pega exactamente esto:

| Campo | Valor |
|-------|--------|
| **Nombre de la aplicación** | `Liveboom` |
| **Nombre del paquete** | `com.liveboom.app` |
| **Idioma predeterminado** | Español (Estados Unidos) – es-US (el que ya tienes está bien) |
| **Aplicación o juego** | **Aplicación** (no juego) |
| **Gratis o de pago** | **Gratis** |
| **Correo de contacto** | `legal@liveboom.app` (o el Gmail de la cuenta de desarrollador) |

Luego:

1. Pulsa **Comprobar disponibilidad** en el paquete. Debe estar libre.
2. En **Declaraciones**, marca las tres casillas:
   - Políticas del programa para desarrolladores
   - Leyes de exportación de EE. UU.
   - Condiciones de la firma de apps de Play
3. Pulsa **Crear aplicación**.

Ese paquete es el mismo `appId` de Capacitor (`apps/capacitor-android/capacitor.config.json`). Si Play dice que está ocupado, **no inventes otro** sin cambiar también el proyecto Android.

## 2. Ficha de Play Store

Ruta: **Presencia en Play Store → Ficha principal de Play Store**.

Textos listos para copiar: `apps/capacitor-android/store/listing-es.txt`.

| Campo | Valor |
|-------|--------|
| Nombre | Liveboom |
| Descripción breve | Lives, Boom Clips y comunidad. Transmite, regala y conecta en Liveboom. |
| Categoría | **Social** |
| Etiquetas | Transmisión en vivo, Video, Redes sociales |
| Sitio web | https://liveboomapp.com |
| Correo de asistencia | legal@liveboom.app |
| Política de privacidad | https://liveboomapp.com/legal/privacidad |
| Términos | https://liveboomapp.com/legal/terminos |

### Gráficos mínimos

| Recurso | Tamaño |
|---------|--------|
| Ícono de la ficha | 512 × 512 PNG (sin transparencia) |
| Gráfico de función | 1024 × 500 PNG |
| Capturas teléfono | al menos 2, entre 320 px y 3840 px en el lado corto |
| Capturas tablet (recomendado) | 7" y 10" |

Logo de marca en el repo: `apps/web/public/brand/logo.png`.

## 3. Contenido de la app (cuestionarios)

Ruta: **Política → Contenido de la app**.

| Pregunta | Respuesta Liveboom |
|----------|-------------------|
| Política de privacidad | https://liveboomapp.com/legal/privacidad |
| ¿Contiene anuncios? | **Sí** (promociones / publicidad dentro de la app) |
| ¿Compras in-app? | **Sí** (coins / Blast) |
| ¿Dirigida a niños? | **No**. Solo **18 años o más** |
| Noticias | No es una app de noticias |
| COVID-19 | No |
| App gubernamental | No |
| Acceso a datos restringidos | Cámara, micrófono y notificaciones **solo** cuando el usuario los autoriza (lives, clips, llamadas) |

### Clasificación de contenido (IARC)

Responde con honestidad. Liveboom es red social con UGC, chat y lives:

- Los usuarios **pueden comunicarse** entre sí
- Los usuarios **pueden generar contenido** (fotos, videos, lives, chat)
- Hay **compras digitales** (coins)
- **No** está pensada para menores de 18 (los términos ya lo dicen)
- No es el propósito principal: violencia, sexo o drogas; el UGC se modera

El resultado típico es **PEGI 16 / ESRB Mature** o similar. Está alineado con “solo +18”.

### Seguridad de los datos

Declara que **sí recopilas** y que **se comparte con encargados** (no se vende):

| Tipo | Recopila | Comparte | Finalidad |
|------|----------|----------|-----------|
| Nombre | Sí | Sí (Firebase) | Cuenta |
| Correo | Sí | Sí (Firebase) | Cuenta |
| ID de usuario | Sí | Sí | Cuenta |
| Fotos y videos | Sí | Sí (Storage / CDN) | Publicaciones, clips, flash, lives |
| Audio | Sí | Sí (LiveKit) | Lives y llamadas |
| Mensajes | Sí | Sí | Chat |
| Historial de compras | Sí | Sí (Wompi / pagos) | Billetera — **no** números de tarjeta |
| Actividad en la app | Sí | No (salvo infra) | Feed y seguridad |
| ID del dispositivo | Sí | Sí (Firebase) | Auth y notificaciones |

- Cifrado en tránsito: **Sí** (HTTPS)
- Los usuarios pueden solicitar la eliminación: **Sí** (`privacidad@liveboom.app`)
- Compromiso de eliminación de cuenta: **Sí** (Play lo exige para cuentas de usuario)

Proveedores: Google Firebase, LiveKit, Wompi.

## 4. Firebase (obligatorio para el login en Android)

1. [Firebase Console](https://console.firebase.google.com/) → proyecto **liveboom-app**
2. Añadir app **Android**
3. Nombre del paquete: `com.liveboom.app`
4. Descargar `google-services.json` y colocarlo en  
   `apps/capacitor-android/android/app/google-services.json`
5. Cuando tengas el keystore de subida, registra las huellas **SHA-1** y **SHA-256** (Google Sign-In no funciona sin ellas)

## 5. Firma y primer AAB

En tu PC con Android Studio:

```bash
npm install
npm run build -w apps/web
cd apps/capacitor-android
npx cap sync android
npx cap open android
```

En Android Studio: **Build → Generate Signed App Bundle**.

- Crea un keystore **upload** y guárdalo fuera del repo (nunca en git).
- Acepta **Play App Signing** (Google guarda la clave de distribución).
- Sube el `.aab` a un segmento de **prueba interna** primero (no a producción).

Cuentas personales nuevas de Play suelen exigir un periodo de pruebas con testers antes de publicar en producción.

## 6. Pagos dentro de la app Android (importante)

En **web** (liveboomapp.com) las recargas van por **Wompi**.  
En **Google Play**, las compras de bienes digitales (coins / Blast) deben usar **Google Play Billing**. Si el WebView cobra con Wompi, Play puede rechazar la app.

Plan:

- Web / iOS / otros: Wompi como ahora
- App de Play: Play Billing para coins (tarea aparte, no forma parte de crear la ficha)

Puedes crear la aplicación y la ficha **ahora**. El Billing hay que tenerlo listo **antes** de enviar a revisión de producción.

## 7. Países y ficha

- País principal: **Colombia**
- Moneda de referencia: COP
- Idioma de ficha: español
- Distribución: elige países cuando completes **Países/regiones** en el lanzamiento
