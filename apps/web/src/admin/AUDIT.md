# Super Admin / LiveBun — auditoría inicial (antes de modificar)

Fecha: 2026-09-21. Stack: React 19 + Vite (`apps/web`) · Express en Cloud Functions (`backend`) · Firestore + Storage. Comandos: `npm run lint -w apps/web`, `npm run build -w apps/web`, `npm test --prefix backend`, `npx tsx apps/web/src/lib/superAdmin.test.ts`.

Rutas reales: `/super-admin`, `/super-admin/verificaciones-retiro`, `/superadmin/withdrawal-verifications`. Acceso: `SuperAdminRoute` (allowlist `config/superAdmins` + owner) → `SuperAdminVaultGate` (reauth Google + `adminSessions`).

## Matriz

| Función | Ubicación | Esperado | Encontrado | Datos | Permiso | Clasificación | Gravedad | Corrección prevista |
|---|---|---|---|---|---|---|---|---|
| Acceso panel | SuperAdminRoute, VaultGate | JWT + allowlist + bóveda | Flujo presente; APIs admin no exigían sesión de bóveda | Firestore `adminSessions` | email allowlist (cliente + API) | parcialmente funcional | alta | Exigir bóveda en `requireSuperAdmin` |
| Delegar | AdminDelegatePanel, superAdminsFirestore | Owner guarda emails+grants | Persistencia Firestore con sesión; sin auditoría servidor | `config/superAdmins` | owner + vault (rules) | funcional verificada (código) | media | Conservar; log cliente tras guardar |
| Usuarios lista | AdminUsersPanel, adminUsersFirestore | Lista real, búsqueda, totales | Límite 250; N+1 presence; totales = página; sin “cargar más” | `users` cliente | owner UI; rules read public | defectuosa | alta | API paginada + count + búsqueda |
| XP | AdminUsersPanel → profileFirestore | Fijar/ajustar/liberar | Escritura cliente; rules owner+vault+campos XP | `levelXp*` | owner | parcialmente funcional | media | API Admin SDK + auditoría |
| Blast usuarios | setFirestoreCoins / addFirestoreCoins | Distinguir comprados/ganados; persistir | Escribe solo `coinsBalance`; rules `walletBalancesUnchanged` bloquean; mezcla buckets | wallets oficiales | owner UI, write denegado | desconectada / defectuosa | crítica | `walletService.adminAdjustBlast` por bucket |
| Mensajes | AdminMessagesPanel | Lectura chats privados | Límite 200/300; sin paginar; sin estados de red finos | `chats` cliente + capability messages | `hasCapability('messages')` | parcialmente funcional | media | API paginada |
| Regalos catálogo | AdminCatalogPanel gifts + GiftCatalogPreview | Upload/preview/publicar | Presente; motor congelado | `config/giftsCatalog` + convert-alpha | gifts + vault | no verificable ejecución (freeze) | — | No tocar motor regalos |
| Blast paquetes | AdminCatalogPanel coins | Editar packs y persistir | UI guarda Firestore; aviso de alinear pagos | `config/coinPackages` | blast + vault | revisado en código | media | No cambiar precios; no editar archivo congelado mixto |
| Publicidad campañas | AdminAdsPanel → /api/ads/admin/* | Aprobar/rechazar real | API existe; UI sin loading/error; reject reason fijo | promoCampaigns | ads | parcialmente funcional | media | Estados + motivo + audit |
| Proyección ads | AdminAdsPanel projection | Guardar params sin cambiar precios venta | PUT funciona; pestaña en blanco si falla carga | config proyección | ads | parcialmente funcional | baja | Empty/error |
| Niveles/marcos | SuperAdminView levels | Upload + publicar | Firestore `config/levels` + storage admin/levels | levels + vault | levels | revisado en código | media | Conservar; log tras publicar |
| Comunidad header | CommunityHeaderEditor | Publicar temas | Firestore `config/communityHeader` | community + vault | community | revisado en código | media | Conservar; log |
| Solicitudes cambio | AdminChangeRequestsPanel | Crear/filtrar/aprobar/descargar | Listener Firestore; owner review | `adminChangeRequests` | requests create; owner update | funcional verificada (código) | baja | Conservar |
| Retiros | AdminWithdrawalsPanel → wallet admin | Aprobar ≠ pagar; Excel salida | API oficial + confirm/reject; Excel sin tope 500 (tests) | `wallet_withdrawals` + report | withdrawals | funcional verificada (código+unit) | alta | Audit en ruta; no marcar pagado al aprobar (ya OK) |
| Excel retiros | download report | Copia de corte, no autoriza pagos | Endpoint + Storage privado | current.xlsx | withdrawals | funcional verificada (unit) | alta | No cambiar tasas |
| Verificaciones | AdminVerificationPanel | Identidad ≠ cuenta ≠ retiro | API decide; UI no exige motivo ni confirma | verification cases | verification | parcialmente funcional | alta | Motivo + confirm + link tab retiros |
| Seguridad bóveda | AdminVaultSecurityPanel | Info + cerrar | Sin visor de auditoría; PIN setup muerto en lib | adminSessions | owner tab | parcialmente funcional | media | Listar audit logs |
| Auditoría | superAdminSecurity.writeAudit | Actor, fecha, acción, recurso | Solo vault unlock/fail; email lower vs rules exact; cliente spoofable | `adminAuditLogs` | create super; read owner | defectuosa | alta | Admin SDK + viewer owner |
| APIs admin | wallet/ads/verification/gifts | Auth servidor | JWT + email; sin bóveda | — | requireCapability | parcialmente funcional | alta | Vault en middleware |

## Recorridos rotos (causa)

1. INTERFAZ Blast → `setFirestoreCoins` → update `coinsBalance` → rules niegan → no persistencia. Causa: no usa wallet oficial ni buckets.
2. Lista usuarios → getDocs limit 250 → contadores de esa página. Causa: sin API/paginación/count.
3. Acciones admin API → JWT allowlist → éxito sin bóveda. Causa: `requireSuperAdmin` no lee `adminSessions`.
4. Audit → addDoc cliente → rules email case-sensitive / silent catch. Causa: no hay writer Admin SDK.

## Fuera de alcance (no inventado)

No hay pestaña de reportes de contenido, sanciones nuevas, ni editor de tasas. No se toca reproducción de regalos ni billetera de usuario.

## Segunda auditoría (tras implementación)

| Función | Antes | Después | Evidencia |
|---|---|---|---|
| Acceso API sin JWT | no cubierto en servidor para bóveda | 401 sin token (esperado) | curl producción (tras deploy) / código |
| Bóveda en API | ausente | `requireSuperAdmin` exige `adminSessions` vigente | revisado en código + tests capabilities |
| Usuarios lista/paginación | límite 250 cliente | GET `/api/super-admin/users` count + cursor | tests map/search; UI conectada |
| Blast admin | client coinsBalance bloqueado | `wallet.adminAdjustBlast` por bucket + idempotencia | tests engine + memory service |
| XP admin | cliente Firestore | POST `/api/super-admin/users/:uid/xp` Admin SDK | revisado en código |
| Mensajes | 200 chats cliente | GET chats/messages paginado | revisado en código |
| Retiros | ya OK aprobar≠pagar | + audit en status | tests excel 500; código |
| Verificaciones | API OK, UI sin motivo | confirm + motivo + link `?tab=withdrawals` | revisado en código |
| Ads | sin loading/error | estados + motivo rechazo + audit | revisado en código |
| Auditoría | solo vault cliente | Admin SDK + visor owner | tests sanitize |
| Niveles/comunidad/delegar | persistencia Firestore | + logAdminAction | revisado en código |
| Regalos motor | freeze | no modificado | diff |

Clasificación post-fix (código + tests automáticos). Verificación en ejecución con sesión Super Admin: NO EJECUTADA (sin credenciales de bóveda en este entorno; no se operó dinero/usuarios reales).

