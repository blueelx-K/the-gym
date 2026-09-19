// IndexedDB 래퍼 — 앱 전체에서 사용하는 공통 CRUD 함수
// 스토어: exercises, plans, sessions, settings (데이터 모델은 plan.md 3장 참고)

const DB_NAME = 'the-gym-db';
const DB_VERSION = 1;

const STORES = {
  exercises: 'id',
  plans: 'id',
  sessions: 'id',
  settings: 'key',
};

export const STORE_NAMES = Object.keys(STORES);

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const [storeName, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath });
        }
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(storeName, mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        Promise.resolve(run(store))
          .then((r) => {
            result = r;
          })
          .catch(reject);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 새 항목 추가 (id가 없으면 자동 생성). 같은 id가 이미 있으면 실패한다. */
export async function dbAdd(storeName, item) {
  const record = item.id ? item : { ...item, id: generateId() };
  await withStore(storeName, 'readwrite', (store) => store.add(record));
  return record;
}

/** 항목 추가 또는 갱신 (id 기준으로 덮어쓰기) */
export async function dbPut(storeName, item) {
  await withStore(storeName, 'readwrite', (store) => store.put(item));
  return item;
}

export async function dbGet(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).get(key));
}

export async function dbGetAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAll());
}

export async function dbDelete(storeName, key) {
  return withStore(storeName, 'readwrite', (store) => store.delete(key));
}

export async function dbClear(storeName) {
  return withStore(storeName, 'readwrite', (store) => store.clear());
}
