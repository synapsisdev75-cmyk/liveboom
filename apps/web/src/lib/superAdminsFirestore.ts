import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { SUPER_ADMIN_OWNER_EMAIL, normalizeEmail } from './superAdmin';

const DOC_PATH = 'config/superAdmins';

export type SuperAdminsDoc = {
  ownerEmail: string;
  emails: string[];
};

export function listenSuperAdmins(
  onChange: (doc: SuperAdminsDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH),
    (snap) => {
      if (!snap.exists()) {
        onChange({
          ownerEmail: SUPER_ADMIN_OWNER_EMAIL,
          emails: [SUPER_ADMIN_OWNER_EMAIL],
        });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const raw = Array.isArray(data.emails) ? data.emails : [];
      const emails = [
        ...new Set(
          [
            SUPER_ADMIN_OWNER_EMAIL,
            ...raw.filter((e): e is string => typeof e === 'string').map(normalizeEmail),
          ].filter(Boolean),
        ),
      ];
      onChange({
        ownerEmail: normalizeEmail(String(data.ownerEmail || SUPER_ADMIN_OWNER_EMAIL)) || SUPER_ADMIN_OWNER_EMAIL,
        emails,
      });
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export async function fetchSuperAdmins(): Promise<SuperAdminsDoc> {
  const snap = await getDoc(doc(db, DOC_PATH));
  if (!snap.exists()) {
    return { ownerEmail: SUPER_ADMIN_OWNER_EMAIL, emails: [SUPER_ADMIN_OWNER_EMAIL] };
  }
  const data = snap.data() as Record<string, unknown>;
  const raw = Array.isArray(data.emails) ? data.emails : [];
  const emails = [
    ...new Set(
      [
        SUPER_ADMIN_OWNER_EMAIL,
        ...raw.filter((e): e is string => typeof e === 'string').map(normalizeEmail),
      ].filter(Boolean),
    ),
  ];
  return {
    ownerEmail: normalizeEmail(String(data.ownerEmail || SUPER_ADMIN_OWNER_EMAIL)) || SUPER_ADMIN_OWNER_EMAIL,
    emails,
  };
}

export async function saveSuperAdminEmails(emails: string[], updatedBy: string): Promise<void> {
  const cleaned = [
    ...new Set(
      [SUPER_ADMIN_OWNER_EMAIL, ...emails.map(normalizeEmail)].filter(Boolean),
    ),
  ];
  await setDoc(
    doc(db, DOC_PATH),
    {
      ownerEmail: SUPER_ADMIN_OWNER_EMAIL,
      emails: cleaned,
      updatedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
