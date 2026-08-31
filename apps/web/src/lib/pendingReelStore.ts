const DB_NAME = 'liveboom-reels';
const STORE = 'pending';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB'));
  });
}

export type PendingReel = {
  id: string;
  title: string;
  blob: Blob;
  createdAt: string;
  roomUsername: string;
};

/** Guarda reel temporal en el dispositivo (IndexedDB) para publicar después. */
export async function savePendingReel(input: {
  title: string;
  blob: Blob;
  roomUsername: string;
}): Promise<string> {
  const id = `reel_${Date.now()}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      id,
      title: input.title,
      blob: input.blob,
      createdAt: new Date().toISOString(),
      roomUsername: input.roomUsername,
    } satisfies PendingReel);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el reel'));
  });
  db.close();
  return id;
}

/** Descarga el reel al almacenamiento del móvil / PC. */
export function downloadReelBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
