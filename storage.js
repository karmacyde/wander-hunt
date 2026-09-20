/*
 * storage.js — everything that persists, all of it on the device.
 *
 *   App state (player, progress, notes, settings) → localStorage, one JSON blob.
 *   Photos                                        → IndexedDB, keyed
 *                                                   "<adventureId>::<itemId>".
 *
 * Every operation is guarded. If storage is unavailable — private browsing, an
 * exhausted quota, an old browser — the app keeps working from memory for the
 * session and the caller can say so gently.
 *
 * Version 2 of the state introduced settings and adventures. Version 1 had a
 * single "day" and "night" hunt, and `migrateV1` lifts that old shape into the
 * new one without losing a single photograph.
 */

const STATE_KEY = "wander.v2";
const LEGACY_STATE_KEY = "wander.v1";
const DRAFT_KEY = "wander.draft";
const DB_NAME = "wander-photos";
const DB_VERSION = 1;
const STORE = "photos";

/* The two adventures a v1 save becomes. */
export const V1_DAY_ADVENTURE = "out-and-about-1";
export const V1_NIGHT_ADVENTURE = "torchlight-1";

/* ---------------------------------------------------------------- dates */

/** Today as a local YYYY-MM-DD string. Local, so "tomorrow" means their tomorrow. */
export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ---------------------------------------------------------------- state */

function defaultState() {
  return {
    version: 2,
    player: null, // { name: "Olive" }
    settings: { sound: false },
    lastSetting: null,
    highestDateSeen: null, // guards against the clock being wound backwards
    progress: {}, // { [settingId]: { adventures: { [adventureId]: adventureState } } }
    custom: {}, // { [huntId]: hunt } — hunts that arrived in a link
    noticedStorageIssue: false
  };
}

export function defaultAdventureState() {
  return {
    found: {}, // { [itemId]: { at: ISO, note?: string } }
    current: null, // itemId being shown
    startedAt: null,
    completedAt: null,
    completedOn: null, // local YYYY-MM-DD — what the daily unlock reads
    safetyShown: false
  };
}

let memoryState = null; // used when localStorage cannot be written
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

function readKey(key) {
  if (!probeLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // missing or corrupt — treat as absent rather than crash
  }
}

/**
 * Turn a v1 save into a v2 one. Pure, so it can be checked directly and is
 * safe to run more than once. Exported so the migration can be exercised on
 * its own, away from a browser.
 */
export function migrateV1(old) {
  const next = defaultState();
  if (!old || typeof old !== "object") return next;

  if (old.player && typeof old.player.name === "string") next.player = { name: old.player.name };
  if (old.settings && typeof old.settings.sound === "boolean") next.settings.sound = old.settings.sound;

  const lift = (slice, settingId, adventureId) => {
    if (!slice || typeof slice !== "object") return;
    const found = slice.found && typeof slice.found === "object" ? slice.found : {};
    if (!Object.keys(found).length && !slice.startedAt) return; // nothing worth keeping
    const state = { ...defaultAdventureState(), ...slice };
    state.found = found;
    // v1 had no completedOn, so derive one for the unlock rule to read.
    state.completedOn = slice.completedAt ? localDate(new Date(slice.completedAt)) : null;
    next.progress[settingId] = { adventures: { [adventureId]: state } };
  };

  lift(old.day, "out-and-about", V1_DAY_ADVENTURE);
  lift(old.night, "torchlight", V1_NIGHT_ADVENTURE);

  if (old.activeHunt === "day") next.lastSetting = "out-and-about";
  else if (old.activeHunt === "night") next.lastSetting = "torchlight";

  return next;
}

/**
 * Load state, migrating a v1 save if that is all there is. Returns
 * { state, migratedFromV1 } so the caller knows to re-key the photos too.
 */
export function loadState() {
  if (memoryState) return { state: memoryState, migratedFromV1: false };

  const current = readKey(STATE_KEY);
  if (current && typeof current === "object") {
    const base = defaultState();
    const state = {
      ...base,
      ...current,
      settings: { ...base.settings, ...(current.settings || {}) },
      progress: current.progress && typeof current.progress === "object" ? current.progress : {},
      custom: current.custom && typeof current.custom === "object" ? current.custom : {}
    };
    memoryState = state;
    return { state, migratedFromV1: false };
  }

  const legacy = readKey(LEGACY_STATE_KEY);
  if (legacy) {
    const state = migrateV1(legacy);
    memoryState = state;
    // The v1 key stays put until the photos are safely re-keyed, so a failure
    // here cannot cost anybody their pictures.
    return { state, migratedFromV1: true };
  }

  memoryState = defaultState();
  return { state: memoryState, migratedFromV1: false };
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

/* The builder's draft, so a half-written hunt survives the phone locking. */

export function loadDraft() {
  return readKey(DRAFT_KEY);
}

export function saveDraft(draft) {
  if (!probeLocalStorage()) return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* a lost draft is a small thing; never break the builder over it */
  }
}

export function clearDraft() {
  if (!probeLocalStorage()) return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Called once the v1 photos have been re-keyed successfully. */
export function dropLegacyState() {
  if (!probeLocalStorage()) return;
  try {
    window.localStorage.removeItem(LEGACY_STATE_KEY);
  } catch {
    /* harmless — it is simply ignored next time */
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
  // A failed open is not cached; a later attempt may well succeed.
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

/** key is "<adventureId>::<itemId>"; record is { blob, width, height, at }. */
export function putPhoto(key, record) {
  return withStore("readwrite", (store) => store.put(record, key));
}

export function deletePhoto(key) {
  return withStore("readwrite", (store) => store.delete(key));
}

/** Every stored photo as a Map of key → record. */
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

/**
 * Delete only the photos of one adventure. Resetting a hunt must never touch
 * the shelf, so there is deliberately no "clear everything" operation.
 */
export function deleteAdventurePhotos(adventureId) {
  const prefix = `${adventureId}::`;
  return withStore("readwrite", (store) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
  });
}

/**
 * Re-key v1 photos, which were stored under a bare item id, into the new
 * "<adventureId>::<itemId>" form. Each is written to its new key before the old
 * one is removed, so an interruption can only ever duplicate, never lose.
 * Resolves with the number of photos moved.
 */
export function migratePhotoKeys(adventureFor) {
  return getAllPhotos().then((all) => {
    const stale = [...all.keys()].filter((key) => typeof key === "string" && !key.includes("::"));
    if (!stale.length) return 0;
    return withStore("readwrite", (store) => {
      for (const itemId of stale) store.put(all.get(itemId), `${adventureFor(itemId)}::${itemId}`);
    })
      .then(() => withStore("readwrite", (store) => {
        for (const itemId of stale) store.delete(itemId);
      }))
      .then(() => stale.length);
  });
}

/** Ask the browser not to evict our data when tidying up. Best effort. */
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
