import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, deleteField, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import {
  SUPER_ADMIN_OWNER_EMAIL,
  allSuperAdminCapabilities,
  isOwnerEmail,
  normalizeCapabilities,
  normalizeEmail,
  type SuperAdminCapability,
  type SuperAdminGrants,
} from './superAdmin';

const DOC_PATH = 'config/superAdmins';

export type SuperAdminsDoc = {
  ownerEmail: string;
  emails: string[];
  grants: SuperAdminGrants;
};

function uniqueEmails(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return [
    ...new Set(
      [
        SUPER_ADMIN_OWNER_EMAIL,
        ...list.filter((e): e is string => typeof e === 'string').map(normalizeEmail),
      ].filter(Boolean),
    ),
  ];
}

function parseGrants(raw: unknown, emails: string[]): SuperAdminGrants {
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const grants: SuperAdminGrants = {};
  for (const email of emails) {
    if (isOwnerEmail(email)) continue;
    if (Object.prototype.hasOwnProperty.call(map, email)) {
      grants[email] = normalizeCapabilities(map[email]);
    }
  }
  return grants;
}

function fromSnap(data: Record<string, unknown> | undefined): SuperAdminsDoc {
  const emails = uniqueEmails(data?.emails);
  return {
    ownerEmail: SUPER_ADMIN_OWNER_EMAIL,
    emails,
    grants: parseGrants(data?.grants, emails),
  };
}

export function listenSuperAdmins(
  onChange: (doc: SuperAdminsDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    (snap) => {
      onChange(fromSnap(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined));
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export async function fetchSuperAdmins(): Promise<SuperAdminsDoc> {
  const snap = await getDoc(doc(db, DOC_PATH));
  return fromSnap(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function saveSuperAdminDelegation(
  emails: string[],
  grants: SuperAdminGrants,
  updatedBy: string,
): Promise<void> {
  const cleaned = uniqueEmails(emails);
  const current = await fetchSuperAdmins();
  const nextGrants: SuperAdminGrants = {};
  for (const email of cleaned) {
    if (isOwnerEmail(email)) continue;
    nextGrants[email] = Object.prototype.hasOwnProperty.call(grants, email)
      ? normalizeCapabilities(grants[email])
      : current.grants[email] ?? allSuperAdminCapabilities();
  }
  const grantsPayload: Record<string, SuperAdminCapability[] | ReturnType<typeof deleteField>> = {
    ...nextGrants,
  };
  for (const email of Object.keys(current.grants)) {
    if (!Object.prototype.hasOwnProperty.call(nextGrants, email)) {
      grantsPayload[email] = deleteField();
    }
  }
  await setDoc(
    doc(db, DOC_PATH),
    {
      ownerEmail: SUPER_ADMIN_OWNER_EMAIL,
      emails: cleaned,
      grants: grantsPayload,
      updatedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Compat: añade o quita emails. Los nuevos reciben todas las funciones. */
export async function saveSuperAdminEmails(emails: string[], updatedBy: string): Promise<void> {
  const current = await fetchSuperAdmins();
  const nextEmails = uniqueEmails(emails);
  const nextSet = new Set(nextEmails);
  const grants: SuperAdminGrants = { ...current.grants };
  for (const email of Object.keys(grants)) {
    if (!nextSet.has(email) || isOwnerEmail(email)) delete grants[email];
  }
  for (const email of nextEmails) {
    if (isOwnerEmail(email)) continue;
    if (!Object.prototype.hasOwnProperty.call(grants, email)) {
      grants[email] = allSuperAdminCapabilities();
    }
  }
  await saveSuperAdminDelegation(nextEmails, grants, updatedBy);
}
