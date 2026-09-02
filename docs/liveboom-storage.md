# LiveBoom — Estructura de Firebase Storage

Cada tipo de contenido tiene su **carpeta separada** bajo el usuario. Así Publicación y Boom Clip no se mezclan en la consola de Firebase ni en permisos.

## Árbol por usuario

```
users/{uid}/
├── .keep
├── avatar/
│   └── profile.jpg
├── publicaciones/          ← Publicaciones (foto, video largo, carrusel)
│   └── .keep
│   └── {timestamp}_{nombre}.jpg|mp4
├── boom-clips/             ← Boom Clip (video ≤ 90 s, postFormat = post)
│   └── .keep
│   └── {timestamp}_{nombre}.mp4
├── flash-boom/             ← Flash Boom (historias 24 h, postFormat = story)
│   └── .keep
│   └── {timestamp}_{nombre}.jpg|mp4
├── chat/
├── groups/
└── posts/                  ← Legacy (solo lectura de archivos antiguos)
```

## Mapeo módulo → carpeta

| Módulo | `contentType` | Carpeta Storage | `UserMediaStorageKind` |
|--------|---------------|-----------------|------------------------|
| Publicación | `post` | `publicaciones/` | `publication` |
| Boom Clip | `boom_clip` | `boom-clips/` | `boom_clip` |
| Flash Boom | `flashboom` | `flash-boom/` | `flash_boom` |

## Cuándo se crean las carpetas

Al registrar un usuario o al primer upload, `ensureUserStorageFolder()` sube un archivo `.keep` en cada carpeta. Eso hace visible la estructura en la consola de Firebase Storage.

## Código

| Archivo | Rol |
|---------|-----|
| `apps/web/src/lib/storage.ts` | Rutas, `uploadUserMedia(kind)`, `.keep` |
| `apps/web/src/lib/socialFirestore.ts` | `createPost()` elige carpeta según `postFormat` |
| `storage.rules` | Permisos por carpeta (+ legacy `posts/`) |

## Metadata en cada archivo

```json
{
  "visibility": "public | friends | private | circle",
  "contentKind": "publication | boom_clip | flash_boom"
}
```

## Legacy

Los archivos ya subidos en `users/{uid}/posts/` **siguen funcionando**. Las reglas de `posts/` se mantienen solo lectura/escritura para compatibilidad. Los uploads nuevos van a las carpetas dedicadas.

## Deploy de reglas

Tras cambiar `storage.rules`:

```bash
npx firebase deploy --only storage --project liveboom-app
```
