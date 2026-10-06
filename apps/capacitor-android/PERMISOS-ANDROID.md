# Permisos Android — LiveBoom

`npm run sync` (o `npm run apply:native`) deja el `AndroidManifest.xml` con este mínimo: agrega los
permisos usados y marca con `tools:node="remove"` los heredados de SDKs que LiveBoom no necesita.

Ningún permiso se pide al abrir la app: al inicio solo se consulta el estado.

| PERMISO | FUNCIÓN | MOMENTO EN QUE SE SOLICITA | OBLIGATORIO / OPCIONAL | JUSTIFICACIÓN | DECLARACIÓN PLAY STORE |
|---|---|---|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Toda la app (Firebase, LIVE, chat) | Instalación (normal, sin diálogo) | Obligatorio | Contenido y tiempo real en la nube | No requiere |
| `CAMERA` | LIVE, Flash Boom / cámara del composer, videollamadas | Al tocar Transmitir, abrir la cámara o iniciar videollamada | Opcional (solo esas funciones) | Captura de video del usuario | Seguridad de datos: "Fotos y videos" (recolectados, no compartidos con terceros) |
| `RECORD_AUDIO` | LIVE, llamadas, notas de voz | Al transmitir, llamar o grabar una nota de voz | Opcional | Audio del usuario en tiempo real | Seguridad de datos: "Audio · grabaciones de voz" |
| `MODIFY_AUDIO_SETTINGS` | Llamadas / LIVE (altavoz, auricular) | Instalación (normal) | Opcional | Enrutar audio de WebRTC | No requiere |
| `BLUETOOTH_CONNECT` (Android 12+) | Audífonos Bluetooth en LIVE y llamadas | Al iniciar LIVE o llamada por primera vez en la sesión | Opcional | Usar el audífono conectado | No requiere |
| `POST_NOTIFICATIONS` (Android 13+) | Mensajes, llamadas entrantes, amigos en LIVE | Tras iniciar sesión (registro push) | Opcional | Avisos con la app cerrada | No requiere |
| `ACCESS_COARSE_LOCATION` | Mapa de zona, compartir ubicación | Al tocar "Ver en tiempo real", "Usar mi ubicación" o "Ubicación en tiempo real" | Opcional | Mostrar/compartir la zona del usuario | Seguridad de datos: "Ubicación aproximada" |
| `ACCESS_FINE_LOCATION` | Compartir ubicación exacta / navegación | Mismo diálogo (el usuario elige Aproximada o Precisa) | Opcional | Punto exacto solo si el usuario lo elige | Seguridad de datos: "Ubicación precisa". Solo en primer plano |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` (la declara el plugin LiveMedia) | Compartir pantalla en LIVE | Al tocar "Compartir pantalla" (diálogo del sistema) | Opcional | Captura de pantalla mientras transmite | Declaración de servicio en primer plano: "Proyección de contenido multimedia" + video demostrativo |

## Eliminados (`tools:node="remove"`)

| PERMISO | MOTIVO |
|---|---|
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE` | Heredados; fotos y videos se eligen con el selector del sistema (acceso por archivo) |
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED` | El selector de fotos moderno no requiere acceso amplio a la galería (política de Play sobre fotos y videos) |
| `ACCESS_BACKGROUND_LOCATION` | La ubicación en tiempo real solo funciona con la app abierta |
| `ACCESS_MEDIA_LOCATION`, `READ_CONTACTS`, `READ_PHONE_STATE` | No se usan |

Hardware opcional (`android:required="false"`): cámara, micrófono, GPS y Bluetooth, para que la app se
instale en equipos que no los tengan.

## Play Console

- **Permisos de fotos y videos:** no aplica (sin `READ_MEDIA_*`).
- **Ubicación en segundo plano:** no aplica.
- **Servicio en primer plano (proyección multimedia):** mantener la declaración existente de compartir pantalla.
- **Seguridad de los datos:** fotos/videos, audio, ubicación aproximada y precisa (opcional, en primer plano), mensajes; cifrados en tránsito; el usuario puede pedir su eliminación.
