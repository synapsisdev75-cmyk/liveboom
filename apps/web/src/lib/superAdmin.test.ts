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
  listedGrantCaps,
  normalizeCapabilities,
  normalizeGrantsMap,
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
assert(hasSuperAdminCapability('ana@x.com', 'gifts', grants, ['ana@x.com']), 'listed has gifts');
assert(hasSuperAdminCapability('ana@x.com', 'ads', grants, ['ana@x.com']), 'ads on');

assert(
  hasSuperAdminCapability('legacy@x.com', 'verification', {}, ['legacy@x.com']),
  'legacy full',
);
assert(
  hasSuperAdminCapability('limitado@x.com', 'gifts', { 'limitado@x.com': [] }, ['limitado@x.com']),
  'listed keeps gifts even if grants empty',
);

const all = allSuperAdminCapabilities();
assert(all.length === 9, 'nine capabilities');
const asCaps: SuperAdminCapability[] = all;
assert(asCaps.includes('withdrawals'), 'retiro');

assert(
  hasSuperAdminCapability('Ana@X.com', 'gifts', { 'ana@x.com': ['gifts', 'blast'] }, ['ana@x.com']),
  'mixed-case login vs lowercase grants',
);
assert(
  hasSuperAdminCapability('ana@x.com', 'blast', { 'Ana@X.com': ['gifts', 'blast'] }, ['ANA@X.COM']),
  'mixed-case grant keys',
);
assert(
  hasSuperAdminCapability('ana@x.com', 'ads', { 'Ana@X.com': ['gifts', 'blast'] }, ['ana@x.com']),
  'listed has all caps',
);

const mapped = normalizeGrantsMap({ 'Ana@X.com': ['gifts', 'nope'] }, ['ana@x.com']);
assert(mapped['ana@x.com']?.join(',') === 'gifts', 'normalize grants keys');
assert(listedGrantCaps('ANA@x.com', mapped)?.join(',') === 'gifts', 'listedGrantCaps');
assert(listedGrantCaps('otro@x.com', mapped) == null, 'missing key is legacy');

console.log('superAdmin capability tests ok');
