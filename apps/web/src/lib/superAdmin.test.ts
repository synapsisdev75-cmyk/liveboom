/**
 * Capacidades Super Admin.
 * Ejecutar: npx tsx apps/web/src/lib/superAdmin.test.ts
 */
import {
  SUPER_ADMIN_OWNER_EMAIL,
  allSuperAdminCapabilities,
  hasSuperAdminCapability,
  isOwnerEmail,
  isSuperAdminEmail,
  normalizeCapabilities,
  type SuperAdminCapability,
  type SuperAdminGrants,
} from './superAdmin';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isOwnerEmail(SUPER_ADMIN_OWNER_EMAIL), 'owner');
assert(!isOwnerEmail('otro@gmail.com'), 'not owner');
assert(isSuperAdminEmail('delegado@x.com', ['delegado@x.com']), 'listed');
assert(!isSuperAdminEmail('delegado@x.com', []), 'not listed');

const normalized = normalizeCapabilities(['gifts', 'nope', 'blast', 'gifts']);
assert(normalized.join(',') === 'gifts,blast', 'normalize order');

assert(hasSuperAdminCapability(SUPER_ADMIN_OWNER_EMAIL, 'messages', {}, []), 'owner all');
assert(
  hasSuperAdminCapability(SUPER_ADMIN_OWNER_EMAIL, 'gifts', { [SUPER_ADMIN_OWNER_EMAIL]: [] }, [
    SUPER_ADMIN_OWNER_EMAIL,
  ]),
  'owner ignores empty grants',
);

const grants: SuperAdminGrants = { 'ana@x.com': ['messages', 'ads'] };
assert(hasSuperAdminCapability('ana@x.com', 'messages', grants, ['ana@x.com']), 'subset on');
assert(!hasSuperAdminCapability('ana@x.com', 'gifts', grants, ['ana@x.com']), 'subset off');
assert(hasSuperAdminCapability('ana@x.com', 'ads', grants, ['ana@x.com']), 'ads on');

assert(
  hasSuperAdminCapability('legacy@x.com', 'verification', {}, ['legacy@x.com']),
  'legacy full',
);
assert(
  !hasSuperAdminCapability('limitado@x.com', 'gifts', { 'limitado@x.com': [] }, ['limitado@x.com']),
  'empty means none',
);

const all = allSuperAdminCapabilities();
assert(all.length === 9, 'nine capabilities');
const asCaps: SuperAdminCapability[] = all;
assert(asCaps.includes('withdrawals'), 'retiro');

console.log('superAdmin capability tests ok');
