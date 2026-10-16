// Screenshot images in the IndexedDB of the add-on (never of the page).

const DB_NAME = 'annotatetofix';
const STORE = 'shots';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function putShot(noteId: string, image: Blob): Promise<void> {
  return run('readwrite', (store) => store.put(image, noteId));
}

export function getShot(noteId: string): Promise<Blob | undefined> {
  return run('readonly', (store) => store.get(noteId));
}

export function deleteShot(noteId: string): Promise<void> {
  return run('readwrite', (store) => store.delete(noteId));
}
