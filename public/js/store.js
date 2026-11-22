/** Armazenamento local (IndexedDB): arquivos de audio + configuracoes. */

const DB_NAME = 'palco-control';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Falha ao abrir o banco local'));
    req.onblocked = () => reject(new Error('Banco local bloqueado por outra aba. Feche as outras abas do painel.'));
  });
  return dbPromise;
}

async function tx(store, mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try {
      result = run(s);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error || new Error('Erro no banco local'));
    t.onabort = () => reject(t.error || new Error('Operacao cancelada no banco local'));
  });
}

export async function putFile(file) {
  await tx('files', 'readwrite', (s) => s.put(file));
  return file;
}

export async function getFile(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('files', 'readonly');
    const req = t.objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFile(id) {
  await tx('files', 'readwrite', (s) => s.delete(id));
}

export async function listFiles() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('files', 'readonly');
    const req = t.objectStore('files').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getKV(key, fallback = null) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readonly');
    const req = t.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => reject(req.error);
  });
}

export async function setKV(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    t.objectStore('kv').put({ key, value });
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  });
}

/** Quanto espaco o navegador informa (pode nao existir em todos). */
export async function storageInfo() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
