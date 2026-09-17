/*
 * storage.js — everything that persists.
 *
 * Two stores, both on the device only:
 *   • App state (player, progress, settings) → localStorage as one small JSON blob.
 *   • Day-hunt photos → IndexedDB, keyed by discovery id, stored as resized JPEG blobs.
 *
 * Every operation is guarded. If storage is unavailable (private browsing,
 * quota exhausted, old browser) the app keeps working in memory and the
 * caller can tell the child gently that nothing will be remembered.
 */

const STATE_KEY = "wander.v1";
const DB_NAME = "wander-photos";
const DB_VERSION = 1;
const STORE = "photos";

/* ---------------------------------------------------------------- state */

export function defaultState() {
  return {
    version: 1,
    player: null, // { name: "Olive" }
    activeHunt: null, // "day" | "night" | null
    day: defaultHuntState(),
    night: defaultHuntState(),
    settings: { sound: false },
    noticedStorageIssue: false
  };
}

export function defaultHuntState() {
  return {
    found: {}, // { [itemId]: { at: ISO string } }
    current: null, // itemId currently shown
    startedAt: null,
    completedAt: null,
    safetyShown: false
  };
}

let memoryState = null; // fallback when localStorage is unusable
let localStorageOk = null;

function probeLocalStorage() {
  if (localStorageOk !== null) return localStorageOk;
  try {
    const probe = "__wander_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    localStorageOk = true;
  } catch {
    localStorageOk = false;
  }
  return localStorageOk;
}

export function stateStorageAvailable() {
  return probeLocalStorage();
}

/** Load saved state, merging over defaults so new fields always exist. */
export function loadState() {
  if (memoryState) return memoryState;
  let raw = null;
  if (probeLocalStorage()) {
    try {
      raw = window.localStorage.getItem(STATE_KEY);
    } catch {
      raw = null;
    }
  }
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null; // corrupt — start fresh rather than crash
    }
  }
  const base = defaultState();
  const state = parsed && typeof parsed === "object" ? {
    ...base,
    ...parsed,
    day: { ...base.day, ...(parsed.day || {}) },
    night: { ...base.night, ...(parsed.night || {}) },
    settings: { ...base.settings, ...(parsed.settings || {}) }
  } : base;
  memoryState = state;
  return state;
}

/** Persist state. Returns false if it could not be written. */
export function saveState(state) {
  memoryState = state;
  if (!probeLocalStorage()) return false;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- photos */

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    let request;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  // A failed open should not be cached — a later attempt may succeed.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function withStore(mode, run) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      reject(err);
      return;
    }
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = run(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result && "result" in result ? result.result : result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  }));
}

/** record: { blob: Blob, width, height, at: ISO } */
export function putPhoto(itemId, record) {
  return withStore("readwrite", (store) => store.put(record, itemId));
}

export function deletePhoto(itemId) {
  return withStore("readwrite", (store) => store.delete(itemId));
}

/** Returns a Map of itemId → record for every stored photo. */
export function getAllPhotos() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const map = new Map();
    let tx;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch (err) {
      reject(err);
      return;
    }
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        map.set(cursor.key, cursor.value);
        cursor.continue();
      } else {
        resolve(map);
      }
    };
    request.onerror = () => reject(request.error);
  }));
}

export function clearPhotos() {
  return withStore("readwrite", (store) => store.clear());
}

/** Ask the browser not to evict our data when it tidies up. Best effort. */
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
