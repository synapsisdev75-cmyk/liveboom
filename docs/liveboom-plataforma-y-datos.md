# LiveBoom — Funcionalidad de la plataforma y tratamiento de datos

**Última actualización:** 1 de septiembre de 2026  
**Sitio:** [liveboomapp.com](https://liveboomapp.com)  
**Contacto privacidad:** privacidad@liveboom.app  
**Contacto legal:** legal@liveboom.app

---

## 1. Qué es LiveBoom

LiveBoom es una plataforma social en español para crear comunidad alrededor del contenido en vivo y corto. Una sola aplicación web responsive funciona en PC, tablet, Android e iOS con la misma identidad y las mismas funciones; solo cambia la distribución según el tamaño de pantalla.

---

## 2. Funcionalidades principales

### 2.1 Inicio y descubrimiento

| Área | Descripción |
|------|-------------|
| **Inicio** | Feed con publicaciones, Boom Clips, Flash Boom, lives activos, grupos destacados y secciones horizontales de contenido popular. |
| **Explorar** | Feed vertical de videos (virales, recientes, para ti) con reproducción inmersiva y navegación por swipe o teclado. |
| **Tendencias** | Contenido y hashtags en auge. |
| **Buscar** | Usuarios, publicaciones y lives por nombre o categoría. |
| **Grupos** | Comunidades temáticas con chat, miembros y contenido compartido. |

### 2.2 Contenido social

| Módulo | Tipo | Descripción |
|--------|------|-------------|
| **Publicaciones** | `post` | Fotos, videos, carruseles y texto. Comentarios, regalos, Boom, compartir y ampliar. |
| **Boom Clip** | `boom_clip` | Videos cortos (≤ 90 s), agrupación por autor, viewer dedicado y acción **+ Clip**. |
| **Flash Boom** | `flashboom` | Historias de 24 h con viewer secuencial y acción **+ Flash**. |

Cada módulo tiene reglas propias; no se mezclan entre sí aunque compartan componentes de reproducción (reproductor, avatar, barra de acciones).

### 2.3 Transmisiones en vivo (LIVE)

| Función | Descripción |
|---------|-------------|
| **Configuración previa** | Título, categoría, meta de coins, opciones (regalos, chat, solo seguidores) y **formato de transmisión** (16:9 horizontal o 9:16 vertical) con vista previa. |
| **Sala LIVE** | Video en tiempo real (LiveKit), chat, contador de espectadores en sala, regalos, lista de deseos, meta de coins, invitados/cohost. |
| **Cámara** | Activar/desactivar micrófono, voltear cámara frontal/trasera, **modo espejo** (vista tipo selfie en cámara; en pantalla compartida aplica al PiP). |
| **Pantalla compartida** | Compartir ventana/pestaña/monitor con cámara en PiP arrastrable; composición enviada a espectadores sin deformar el formato elegido. |
| **Privado / bloqueo** | Live privado o sala con acceso por regalo (lock). |
| **Retiro** | Conversión de coins ganados en la sesión hacia retiro (sujeto a verificación). |

### 2.4 Economía y regalos

| Función | Descripción |
|---------|-------------|
| **Coins** | Moneda virtual para regalos y funciones premium. Compra vía proveedor de pagos (Wompi). |
| **Regalos** | Catálogo de regalos animados en publicaciones, clips, flash y lives. |
| **Billetera** | Saldo, historial, recarga y retiro. |
| **Niveles** | XP por actividad y regalos; insignias y marcos de nivel en perfil y chat. |

### 2.5 Perfil y social

| Función | Descripción |
|---------|-------------|
| **Perfil** | Avatar, biografía, seguidores, publicaciones, clips, lives guardados. |
| **Mensajes** | Chat directo y llamadas. |
| **Actividad** | Notificaciones (likes, comentarios, regalos, lives). |
| **Configuración** | Privacidad, cuenta, preferencias. |

### 2.6 Administración

Panel **Super Admin** (acceso restringido): usuarios, niveles, delegación, solicitudes de cambio, moderación y configuración de la plataforma.

### 2.7 Publicidad

Banners y promociones en sidebar y modales; paquetes de visibilidad para creadores.

---

## 3. Arquitectura técnica (resumen)

| Capa | Tecnología | Uso |
|------|------------|-----|
| Frontend | React + Vite | App web responsive |
| Autenticación | Firebase Auth | Login, sesión, identidad |
| Base de datos | Cloud Firestore | Perfiles, posts, lives, chat, regalos |
| Archivos | Firebase Storage | Fotos, videos, avatares (carpetas por tipo de contenido) |
| Streaming | LiveKit + API backend | Salas LIVE en tiempo real |
| Hosting | Firebase Hosting | liveboomapp.com |
| API | Vercel (Node) | Tokens LiveKit, coins, regalos, locks, lives |
| Pagos | Wompi | Compra de coins |

Documentación técnica adicional: `docs/liveboom-storage.md`, `docs/liveboom-video-viewer.md`.

---

## 4. Datos de usuario que recopilamos

### 4.1 Datos de cuenta y perfil

- Correo electrónico y/o proveedor de autenticación (Google, etc.)
- Nombre para mostrar, usuario (@handle), foto de perfil
- Biografía, categoría de creador, fecha de nacimiento (verificación +18 en lives)
- Configuración de privacidad y preferencias

### 4.2 Contenido generado por el usuario

- Publicaciones, Boom Clips, Flash Boom (texto, medios, metadatos)
- Transmisiones en vivo (video/audio en tiempo real, título, categoría, formato, chat)
- Comentarios, reacciones (Boom), mensajes directos y de grupos
- Regalos enviados y recibidos, historial de coins

### 4.3 Datos de actividad y técnicos

- Presencia en salas LIVE (para contador de espectadores)
- Interacciones (seguir, buscar, explorar)
- Dirección IP, tipo de dispositivo, navegador, cookies esenciales
- Logs de errores y rendimiento (sin contenido sensible innecesario)

### 4.4 Datos de pago

- Las compras de coins se procesan en **Wompi**. LiveBoom **no almacena** números completos de tarjeta.
- Conservamos referencias de transacción, monto y estado para soporte, fraude y retiros.

### 4.5 Permisos del dispositivo (solo cuando el usuario los autoriza)

- **Cámara y micrófono:** lives, llamadas, grabación de clips/flash
- **Pantalla compartida:** función “Pantalla” en LIVE
- **Notificaciones:** avisos de actividad (si el usuario las activa)

---

## 5. Para qué usamos los datos (finalidades)

| Finalidad | Ejemplos |
|-----------|----------|
| **Prestar el servicio** | Mostrar feed, reproducir videos, conectar a salas LIVE, enviar mensajes |
| **Cuenta y seguridad** | Autenticación, recuperación, prevención de fraude y abuso |
| **Economía virtual** | Saldo de coins, regalos, retiros, niveles y XP |
| **Personalización** | Orden del feed, sugerencias, categorías |
| **Comunicaciones** | Notificaciones de actividad; marketing solo con consentimiento |
| **Cumplimiento legal** | Respuesta a autoridades, conservación mínima exigida por ley |
| **Mejora del producto** | Métricas agregadas y anónimas de uso |

---

## 6. Base legal (Colombia)

Tratamos datos conforme a la **Ley 1581 de 2012** y normas complementarias:

- **Ejecución del contrato:** cuenta, contenido, lives, mensajes, billetera
- **Consentimiento:** cookies no esenciales, comunicaciones promocionales, permisos de cámara/micrófono
- **Interés legítimo:** seguridad, antifraude, mejora técnica
- **Obligación legal:** cuando la ley lo exija

Los textos legales completos están en la app: `/legal/terminos` y `/legal/privacidad`.

---

## 7. Con quién compartimos datos

Solo con **encargados del tratamiento** necesarios para operar LiveBoom, bajo contrato o términos equivalentes:

| Proveedor | Finalidad |
|-----------|-----------|
| **Google Firebase** | Auth, Firestore, Storage, Hosting |
| **LiveKit** | Infraestructura de video en vivo |
| **Vercel** | API backend |
| **Wompi** | Pagos y recargas |

**No vendemos** datos personales a terceros para publicidad externa.

---

## 8. Conservación y eliminación

- Los datos se conservan mientras la cuenta esté activa.
- El contenido publicado puede permanecer en copias de respaldo durante un periodo limitado tras eliminación.
- Flash Boom expira automáticamente a las 24 h.
- Puedes solicitar acceso, rectificación o eliminación escribiendo a **privacidad@liveboom.app**, salvo datos que debamos conservar por ley o disputas.

---

## 9. Derechos del titular

Como usuario en Colombia puedes:

1. Conocer, actualizar y rectificar tus datos (desde Perfil → Configuración)
2. Solicitar prueba de autorización del tratamiento
3. Ser informado sobre el uso de tus datos (este documento y el Aviso de Privacidad)
4. Presentar quejas ante la **Superintendencia de Industria y Comercio (SIC)** si consideras que no se respetan tus derechos

---

## 10. Menores de edad

LiveBoom está dirigido a personas **mayores de 18 años**. Para transmitir en vivo se exige confirmación de edad en el checklist previo. No recopilamos intencionalmente datos de menores; si detectamos una cuenta de menor, podemos suspenderla y eliminar la información.

---

## 11. Seguridad

- Comunicación cifrada (HTTPS / WSS)
- Reglas de seguridad en Firestore y Storage por usuario
- Tokens de acceso de corta duración para salas LIVE
- Acceso administrativo restringido y auditado

Ningún sistema es 100 % seguro; notificamos incidentes relevantes según la ley aplicable.

---

## 12. Cambios en este documento

Publicaremos la versión actualizada en el repositorio (`docs/`) y, cuando el cambio sea relevante para usuarios, lo comunicaremos en la app o por correo.

---

## 13. Resumen en una frase

**LiveBoom usa tus datos para darte una red social con video en vivo, contenido corto y economía de regalos; los alojamos en proveedores de confianza, no los vendemos, y tú puedes ejercer tus derechos de privacidad contactándonos.**
