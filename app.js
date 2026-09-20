/*
 * app.js — Wander
 *
 * A single-page app with no framework. Screens are <section> elements in
 * index.html; this file decides which is visible, renders it from state, and
 * wires up the controls.
 *
 * The shape of the game lives in adventures.js: SETTINGS (where you are) each
 * hold a series of ADVENTURES (one expedition of sixteen). A setting is always
 * free to choose. Inside a setting, the next adventure opens the day after you
 * finish the one before — see `adventureStatus`.
 *
 * Contents:
 *   1. State, progress and the daily unlock
 *   2. Router and theme
 *   3. Player, home and the setting list
 *   4. Photo hunts
 *   5. Tick hunts
 *   6. The shelf
 *   7. Dialogs, toasts, service worker, boot
 */

import {
  SETTINGS, KIND_LABELS, settingOrder, registerCustom, unregisterCustom, isCustom,
  getSetting, findAdventure, allItems, isBonus, findItem, photoKey
} from "./adventures.js";
import * as store from "./storage.js";
import {
  processImageFile, urlForPhoto, releasePhotoURL,
  shareImage, buildContactSheet
} from "./photos.js";
import { startNightSky, stopNightSky, playTick, playChime } from "./effects.js";
import {
  EMOJI_CHOICES, LIMITS, decodeHunt, huntLink, settingFromHunt,
  newHuntId, takeHuntFragment, validate as validateHunt
} from "./hunts.js";

const $ = (sel) => document.querySelector(sel);
const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (values[i] ?? ""), "");
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ================================================================
   1. State, progress and the daily unlock
   ================================================================ */

const loaded = store.loadState();
const state = loaded.state;
const photos = new Map(); // photoKey → { blob, width, height, at }
let photosAvailable = true;
let storageWarned = false;

/** Where we are in the app: which setting and which adventure are open. */
let openSettingId = null;
let openAdventureId = null;

function save() {
  if (!store.saveState(state)) warnStorage();
}

function warnStorage() {
  if (storageWarned) return;
  storageWarned = true;
  toast("This browser can't remember your hunt, so progress may be lost when you close it.", 4200);
}

const playerName = () => (state.player && state.player.name) || "Explorer";
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/**
 * Today, never earlier than the latest date we have already seen. Winding the
 * clock back therefore unlocks nothing. Winding it forward is not policed —
 * that is a child who wants to play, not a problem to solve.
 */
function today() {
  const now = store.localDate();
  if (state.highestDateSeen && now < state.highestDateSeen) return state.highestDateSeen;
  if (state.highestDateSeen !== now) {
    state.highestDateSeen = now;
    save();
  }
  return now;
}

/** The stored progress for one adventure, created on demand. */
function progressFor(settingId, adventureId) {
  if (!state.progress[settingId]) state.progress[settingId] = { adventures: {} };
  const bucket = state.progress[settingId];
  if (!bucket.adventures) bucket.adventures = {};
  if (!bucket.adventures[adventureId]) bucket.adventures[adventureId] = store.defaultAdventureState();
  return bucket.adventures[adventureId];
}

/** Read-only peek that does not create anything. */
function peek(settingId, adventureId) {
  const bucket = state.progress[settingId];
  return (bucket && bucket.adventures && bucket.adventures[adventureId]) || null;
}

const foundCount = (adventure, p) => (p ? adventure.items.filter((i) => p.found[i.id]).length : 0);
const isComplete = (adventure, p) => foundCount(adventure, p) === adventure.items.length;
const bonusFound = (adventure, p) => Boolean(p && adventure.bonus && p.found[adventure.bonus.id]);

/**
 * Whether an adventure can be played, and why not if it cannot.
 * Returns "done" | "open" | "tomorrow" | "after-previous".
 *
 * The first adventure is always open. A later one needs the one before it
 * finished, and then needs the calendar to have turned over.
 */
function adventureStatus(setting, index) {
  const adventure = setting.adventures[index];
  const p = peek(setting.id, adventure.id);
  if (p && isComplete(adventure, p)) return "done";
  if (index === 0) return "open";

  const previous = setting.adventures[index - 1];
  const prevProgress = peek(setting.id, previous.id);
  if (!prevProgress || !isComplete(previous, prevProgress)) return "after-previous";
  if (!prevProgress.completedOn) return "open"; // finished before we tracked dates
  return today() > prevProgress.completedOn ? "open" : "tomorrow";
}

/** The adventure a child should be pointed at in a setting, if any is playable. */
function nextPlayable(setting) {
  for (let i = 0; i < setting.adventures.length; i += 1) {
    const status = adventureStatus(setting, i);
    if (status === "open") return { adventure: setting.adventures[i], index: i, status };
    if (status === "tomorrow" || status === "after-previous") return { adventure: null, index: i, status };
  }
  return { adventure: null, index: setting.adventures.length, status: "all-done" };
}

/** Totals across every setting, for the shelf and the home screen. */
function lifetimeStats() {
  let found = 0;
  let finished = 0;
  for (const settingId of settingOrder()) {
    for (const adventure of getSetting(settingId).adventures) {
      const p = peek(settingId, adventure.id);
      if (!p) continue;
      found += Object.keys(p.found).length;
      if (isComplete(adventure, p)) finished += 1;
    }
  }
  return { found, finished };
}

/** Every finished adventure, newest first. */
function shelfEntries() {
  const rows = [];
  for (const settingId of settingOrder()) {
    const setting = getSetting(settingId);
    for (const adventure of setting.adventures) {
      const p = peek(settingId, adventure.id);
      if (p && isComplete(adventure, p)) rows.push({ setting, adventure, progress: p });
    }
  }
  rows.sort((a, b) => String(b.progress.completedAt || "").localeCompare(String(a.progress.completedAt || "")));
  return rows;
}

/* ------------------------------------------------- the open adventure */

function openContext() {
  const setting = getSetting(openSettingId);
  if (!setting) return null;
  const index = setting.adventures.findIndex((a) => a.id === openAdventureId);
  if (index === -1) return null;
  const adventure = setting.adventures[index];
  return { setting, adventure, index, p: progressFor(setting.id, adventure.id) };
}

function currentItem(adventure, p) {
  const items = allItems(adventure);
  const match = items.find((item) => item.id === p.current);
  if (match) return match;
  p.current = items[0].id;
  return items[0];
}

/** The next item after `fromId` in display order, wrapping, that isn't found. */
function nextIncomplete(adventure, p, fromId) {
  const items = allItems(adventure);
  const start = Math.max(0, items.findIndex((item) => item.id === fromId));
  for (let step = 1; step <= items.length; step += 1) {
    const candidate = items[(start + step) % items.length];
    if (!p.found[candidate.id]) return candidate;
  }
  return null;
}

function neighbour(adventure, fromId, direction) {
  const items = allItems(adventure);
  const index = Math.max(0, items.findIndex((item) => item.id === fromId));
  return items[(index + direction + items.length) % items.length];
}

/** Mark an item found. Returns true if that completed the adventure. */
function markFound(adventure, p, itemId) {
  const existing = p.found[itemId];
  p.found[itemId] = { at: new Date().toISOString(), ...(existing && existing.note ? { note: existing.note } : {}) };
  if (!p.startedAt) p.startedAt = new Date().toISOString();
  const justCompleted = isComplete(adventure, p) && !p.completedAt;
  if (justCompleted) {
    p.completedAt = new Date().toISOString();
    p.completedOn = today();
  }
  save();
  return justCompleted;
}

function unmarkFound(adventure, p, itemId) {
  delete p.found[itemId];
  if (!isComplete(adventure, p)) {
    p.completedAt = null;
    p.completedOn = null;
  }
  save();
}

function progressLabel(adventure, p) {
  return `${foundCount(adventure, p)} of ${adventure.items.length}${bonusFound(adventure, p) ? " ★" : ""}`;
}

function setRing(el, adventure, p) {
  const fraction = foundCount(adventure, p) / adventure.items.length;
  el.style.strokeDashoffset = String(94.25 * (1 - fraction));
}

/**
 * What to call the collection an adventure belongs to. A custom hunt is one
 * adventure in a setting of the same name, so naming both would repeat it.
 */
function collectionName(setting, adventure) {
  return setting.custom && setting.title === adventure.title ? "hunt" : setting.title;
}

/** Pick the singular or plural word for a count. */
function plural(n, one, many) {
  return n === 1 ? one : many;
}

/** Join label parts with a middot, dropping any that are empty. */
function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

function niceDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/* ================================================================
   2. Router and theme
   ================================================================ */

const PALETTE_COLORS = { home: "#ece6d8", day: "#f4efe4", night: "#0b1220" };
const PARENT = {
  player: "home", setting: "home", shelf: "home", builder: "home",
  photo: "setting", "photo-all": "photo",
  tick: "setting", "tick-all": "tick",
  share: "builder"
};
const navStack = [];
let currentScreen = null;

function paletteFor(screen) {
  if (screen === "home" || screen === "player" || screen === "shelf"
      || screen === "builder" || screen === "share" || screen === "received") {
    return "home";
  }
  const setting = getSetting(openSettingId);
  if (!setting) return "home";
  if (screen === "setting") return setting.palette === "night" ? "night" : "home";
  return setting.palette;
}

function show(screen) {
  currentScreen = screen;
  const palette = paletteFor(screen);
  document.documentElement.dataset.theme = palette;
  $("#theme-color").setAttribute("content", PALETTE_COLORS[palette]);
  document.querySelectorAll(".screen").forEach((el) => { el.hidden = el.id !== `screen-${screen}`; });
  window.scrollTo(0, 0);
  render(screen);
}

function render(screen) {
  switch (screen) {
    case "player": renderPlayer(); break;
    case "home": renderHome(); break;
    case "setting": renderSetting(); break;
    case "shelf": renderShelf(); break;
    case "photo": renderPhotoHunt(); break;
    case "photo-all": renderPhotoAll(); break;
    case "tick": renderTickHunt(); break;
    case "tick-all": renderTickAll(); break;
    case "builder": renderBuilder(); break;
    case "share": renderShare(); break;
    case "received":
      if (receivedHunt) showReceived();
      else goBack("home"); // nothing waiting — it was already opened
      break;
    default: break;
  }
}

function navigate(screen) {
  navStack.push(screen);
  history.pushState({ screen, depth: navStack.length }, "");
  show(screen);
}

/** Go back to `target`, using real history where we can so iOS gestures agree. */
function goBack(target) {
  const index = navStack.lastIndexOf(target);
  if (index >= 0 && index < navStack.length - 1) {
    history.go(index - (navStack.length - 1)); // popstate finishes the job
    return;
  }
  navStack.length = 0;
  navStack.push(target);
  history.replaceState({ screen: target, depth: 1 }, "");
  show(target);
}

window.addEventListener("popstate", (event) => {
  const depth = event.state && event.state.depth;
  if (depth && depth <= navStack.length) {
    navStack.length = depth;
  } else {
    navStack.length = 1;
    navStack[0] = "home";
  }
  let screen = navStack[navStack.length - 1];
  if (!state.player && screen !== "player") screen = "player";
  if ((screen === "setting" || screen.startsWith("photo") || screen.startsWith("tick")) && !getSetting(openSettingId)) {
    screen = "home";
  }
  if (screen === "share" && !madeHunt) screen = "builder";
  show(screen);
});

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.nav;
    if (PARENT[currentScreen] === target) goBack(target);
    else navigate(target);
  });
});

/* The hunt screen a setting uses. */
const huntScreen = (setting) => (setting.interaction === "photo" ? "photo" : "tick");
const overviewScreen = (setting) => (setting.interaction === "photo" ? "photo-all" : "tick-all");

/* ================================================================
   3. Player, home and the setting list
   ================================================================ */

const nameForm = $("#name-form");
const nameInput = $("#name-input");

function renderPlayer() {
  nameForm.hidden = true;
  nameInput.value = "";
  $("#player-choices").hidden = false;
}

function setPlayer(name) {
  state.player = { name };
  save();
  goBack("home");
  // If they arrived on a hunt link, the welcome was held back until they said
  // who they were. Show it now.
  if (receivedHunt) {
    showReceived();
    navigate("received");
  }
}

$("#player-choices").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-player]");
  if (!btn) return;
  if (btn.dataset.player) {
    setPlayer(btn.dataset.player);
  } else {
    $("#player-choices").hidden = true;
    nameForm.hidden = false;
    nameInput.focus();
  }
});

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  // Children type their names in all sorts of ways; tidy it up for them.
  const name = nameInput.value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20)
    .replace(/(^|[\s'-])(\p{L})/gu, (match, sep, letter) => sep + letter.toLocaleUpperCase());
  if (!name) {
    nameInput.focus();
    return;
  }
  setPlayer(name);
});

$("#player-chip").addEventListener("click", () => navigate("player"));

function renderHome() {
  $("#player-chip-name").textContent = playerName();
  const stats = lifetimeStats();
  $("#home-greeting").textContent = stats.found
    ? `${stats.found} ${plural(stats.found, "discovery", "discoveries")} so far, ${playerName()}.`
    : `Ready to explore, ${playerName()}?`;

  $("#setting-list").innerHTML = settingOrder().map((settingId) => {
    const setting = getSetting(settingId);
    const next = nextPlayable(setting);
    const done = setting.adventures.filter((a) => {
      const p = peek(settingId, a.id);
      return p && isComplete(a, p);
    }).length;

    let status;
    let tone = "";
    if (next.status === "all-done") {
      status = `All ${setting.adventures.length} finished`;
      tone = " done";
    } else if (next.status === "tomorrow") {
      status = "Opens tomorrow";
      tone = " waiting";
    } else {
      const p = peek(settingId, next.adventure.id);
      const count = foundCount(next.adventure, p);
      status = count > 0
        ? `Continue · ${count} of ${next.adventure.items.length}`
        : (done ? `Adventure ${next.index + 1} of ${setting.adventures.length}` : "Start");
    }

    const active = state.lastSetting === settingId ? " is-active" : "";
    return html`
      <button class="setting-card ${setting.palette}${active}${tone}" type="button" data-setting="${setting.id}">
        <span class="setting-art" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="100%" height="100%"><use href="#art-${setting.id}"/></svg>
        </span>
        <span class="setting-text">
          <span class="setting-emoji" aria-hidden="true">${setting.emoji}</span>
          <span class="setting-title">${esc(setting.title)}</span>
          <span class="setting-place">${esc(setting.place)}</span>
          <span class="setting-status">${esc(status)}</span>
        </span>
      </button>`;
  }).join("");

  const shelfBtn = $("#home-shelf");
  shelfBtn.hidden = stats.finished === 0;
  $("#home-shelf-count").textContent =
    `${stats.finished} finished ${plural(stats.finished, "adventure", "adventures")}`;
}

$("#setting-list").addEventListener("click", (event) => {
  const card = event.target.closest("[data-setting]");
  if (!card) return;
  openSettingId = card.dataset.setting;
  state.lastSetting = openSettingId;
  save();
  navigate("setting");
});

$("#home-shelf").addEventListener("click", () => navigate("shelf"));
$("#home-settings").addEventListener("click", () => openSettings(null));
document.querySelectorAll("[data-settings-sheet]").forEach((btn) => {
  btn.addEventListener("click", () => openSettings(openAdventureId));
});

/* ------------------------------------------------- the setting screen */

function renderSetting() {
  const setting = getSetting(openSettingId);
  if (!setting) {
    goBack("home");
    return;
  }
  $("#setting-heading").textContent = setting.title;
  $("#setting-place").textContent = setting.place;
  $("#setting-note").textContent = setting.note;
  $("#setting-emoji").textContent = setting.emoji;

  $("#adventure-list").innerHTML = setting.adventures.map((adventure, index) => {
    const status = adventureStatus(setting, index);
    const p = peek(setting.id, adventure.id);
    const count = foundCount(adventure, p);
    const total = adventure.items.length;

    let badge;
    let detail;
    if (status === "done") {
      badge = html`<span class="adv-mark done" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-tick"/></svg></span>`;
      detail = `${count} found · ${niceDate(p.completedAt)}`;
    } else if (status === "open") {
      badge = html`<span class="adv-mark open" aria-hidden="true">${index + 1}</span>`;
      detail = count > 0 ? `${count} of ${total} found` : `${total} to find`;
    } else if (status === "tomorrow") {
      badge = html`<span class="adv-mark locked" aria-hidden="true">🌙</span>`;
      detail = "Opens tomorrow";
    } else {
      badge = html`<span class="adv-mark locked" aria-hidden="true">🔒</span>`;
      detail = "Opens after the one before";
    }

    const playable = status === "done" || status === "open";
    return html`
      <li>
        <button class="adv-row ${status}" type="button" data-adventure="${adventure.id}" ${playable ? "" : "disabled"}>
          ${badge}
          <span class="adv-text">
            <span class="adv-title">${index + 1}. ${esc(adventure.title)}</span>
            <span class="adv-detail">${esc(detail)}</span>
          </span>
          ${status === "open" && count > 0 ? html`<span class="adv-chase">Continue</span>` : ""}
          ${status === "done" ? html`<span class="adv-chase">Journal</span>` : ""}
        </button>
      </li>`;
  }).join("");
}

$("#adventure-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-adventure]");
  if (!row || row.disabled) return;
  openAdventure(row.dataset.adventure);
});

function openAdventure(adventureId) {
  const setting = getSetting(openSettingId);
  if (!setting) return;
  const index = setting.adventures.findIndex((a) => a.id === adventureId);
  if (index === -1) return;
  const adventure = setting.adventures[index];
  const status = adventureStatus(setting, index);
  if (status !== "open" && status !== "done") return;

  openAdventureId = adventureId;
  const p = progressFor(setting.id, adventureId);
  if (!p.startedAt) p.startedAt = new Date().toISOString();
  if (!p.current) p.current = adventure.items[0].id;
  // Resume on something still to find.
  if (p.found[p.current]) {
    const next = nextIncomplete(adventure, p, p.current);
    if (next) p.current = next.id;
  }
  save();

  if (status === "done") {
    navigate(huntScreen(setting));
    navigate(overviewScreen(setting));
    return;
  }
  navigate(huntScreen(setting));
  if (!p.safetyShown) showSafety(setting);
}

/* ================================================================
   4. Photo hunts
   ================================================================ */

const photoStage = $("#photo-stage");
const photoActions = $("#photo-actions");
const cameraInput = $("#camera-input");
let photoBusy = false;
let pendingItemId = null;

function renderPhotoHunt() {
  const ctx = openContext();
  if (!ctx) {
    goBack("home");
    return;
  }
  const { setting, adventure, p } = ctx;
  const item = currentItem(adventure, p);
  const index = adventure.items.findIndex((i) => i.id === item.id);
  const bonus = isBonus(adventure, item.id);
  const key = photoKey(adventure.id, item.id);

  $("#photo-adventure").textContent = `${setting.emoji} ${adventure.title}`;
  $("#photo-eyebrow").textContent = bonus
    ? "⭐ Bonus discovery"
    : `Discovery ${index + 1} of ${adventure.items.length}`;
  $("#photo-title").textContent = item.title;
  $("#photo-hint").textContent = item.hint || "";
  $("#progress-photo").textContent = progressLabel(adventure, p);
  setRing($("#ring-photo"), adventure, p);

  if (photoBusy) {
    photoStage.className = "photo-stage";
    photoStage.innerHTML = html`<div class="busy"><span class="spinner" aria-hidden="true"></span>Saving your photo…</div>`;
    photoActions.innerHTML = "";
    return;
  }

  const photo = photos.get(key);
  if (photo && p.found[item.id]) {
    const note = (p.found[item.id] && p.found[item.id].note) || "";
    photoStage.className = "photo-stage has-photo";
    photoStage.innerHTML = html`
      <figure class="polaroid" style="margin:0">
        <img id="photo-shot" alt="${esc(item.title)}" src="${urlForPhoto(key, photo.blob)}">
        <figcaption class="polaroid-caption">
          <span>${esc(item.title.replace(/^(Find|Spot|Get) /, ""))}</span>
          <span class="found-badge"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><use href="#i-tick"/></svg>Found</span>
        </figcaption>
      </figure>
      <label class="note-field">
        <span class="note-label">Add a note</span>
        <input id="photo-note" type="text" maxlength="80" enterkeyhint="done"
               placeholder="What was it? Where did you find it?" value="${esc(note)}">
      </label>`;
    const hasNext = Boolean(nextIncomplete(adventure, p, item.id));
    photoActions.innerHTML = html`
      <button class="btn primary big" type="button" id="photo-next">${hasNext ? "Next discovery" : "See your journal"}</button>
      <div class="btn-row">
        <button class="btn" type="button" id="photo-retake"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-camera"/></svg>Retake</button>
        <button class="btn" type="button" id="photo-share"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-share"/></svg>Save / Share</button>
      </div>
      <button class="btn quiet" type="button" id="photo-remove">Remove photo</button>`;

    const noteInput = $("#photo-note");
    const saveNote = () => {
      const entry = p.found[item.id];
      if (!entry) return;
      const text = noteInput.value.trim().slice(0, 80);
      if (text) entry.note = text;
      else delete entry.note;
      save();
    };
    noteInput.addEventListener("change", saveNote);
    noteInput.addEventListener("blur", saveNote);
    noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") noteInput.blur(); });

    $("#photo-next").addEventListener("click", () => { saveNote(); photoNext(); });
    $("#photo-retake").addEventListener("click", openCamera);
    $("#photo-share").addEventListener("click", () => sharePhoto(adventure, item));
    $("#photo-remove").addEventListener("click", () => removePhoto(adventure, p, item.id));
    return;
  }

  photoStage.className = "photo-stage";
  photoStage.innerHTML = html`
    <div class="camera-prompt">
      <div class="camera-frame" aria-hidden="true">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <button class="camera-btn" type="button" id="camera-btn" aria-label="Take a photo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-camera"/></svg>
        </button>
      </div>
      <span class="camera-label">Tap to photograph it</span>
    </div>`;
  photoActions.innerHTML = html`<button class="btn quiet" type="button" id="photo-skip">Skip this one for now</button>`;
  $("#camera-btn").addEventListener("click", openCamera);
  $("#photo-skip").addEventListener("click", photoNext);
}

function openCamera() {
  const ctx = openContext();
  if (!ctx) return;
  // The camera can take a while; remember what it was opened for so the photo
  // lands on the right discovery even if the screen has moved on.
  pendingItemId = currentItem(ctx.adventure, ctx.p).id;
  cameraInput.value = "";
  try {
    cameraInput.click();
  } catch {
    pendingItemId = null;
    toast("Couldn't open the camera on this device.");
  }
}

cameraInput.addEventListener("change", async () => {
  const file = cameraInput.files && cameraInput.files[0];
  if (!file) return; // cancelled
  const ctx = openContext();
  if (!ctx) return;
  const { adventure, p } = ctx;
  const item = findItem(adventure, pendingItemId) || currentItem(adventure, p);
  pendingItemId = null;
  p.current = item.id;
  const key = photoKey(adventure.id, item.id);

  photoBusy = true;
  renderPhotoHunt();
  try {
    const { blob, width, height } = await processImageFile(file);
    const record = { blob, width, height, at: new Date().toISOString() };
    photos.set(key, record);
    releasePhotoURL(key);
    try {
      await store.putPhoto(key, record);
    } catch {
      photosAvailable = false;
      toast("Photos can't be saved on this device right now, so this one may not survive a restart.", 4200);
    }
    const completed = markFound(adventure, p, item.id);
    photoBusy = false;
    renderPhotoHunt();
    if (state.settings.sound) playTick();
    if (completed) {
      toast(`All ${adventure.items.length} found! Opening your journal…`, 2200);
      window.setTimeout(() => { if (currentScreen === "photo") navigate("photo-all"); }, 1600);
    }
  } catch (err) {
    photoBusy = false;
    renderPhotoHunt();
    toast("Couldn't use that photo — try again.");
    console.warn("Photo failed", err);
  } finally {
    cameraInput.value = "";
  }
});

function photoNext() {
  const ctx = openContext();
  if (!ctx) return;
  const next = nextIncomplete(ctx.adventure, ctx.p, ctx.p.current);
  if (!next) {
    navigate("photo-all");
    return;
  }
  ctx.p.current = next.id;
  save();
  renderPhotoHunt();
}

async function removePhoto(adventure, p, itemId) {
  const key = photoKey(adventure.id, itemId);
  photos.delete(key);
  releasePhotoURL(key);
  unmarkFound(adventure, p, itemId);
  try {
    await store.deletePhoto(key);
  } catch {
    /* nothing stored, nothing to remove */
  }
  renderPhotoHunt();
}

async function sharePhoto(adventure, item) {
  const photo = photos.get(photoKey(adventure.id, item.id));
  if (!photo) return;
  const result = await shareImage(photo.blob, item.title, `${possessive(playerName())} discovery: ${item.title}`);
  if (result === "unsupported") {
    openLightbox(urlForPhoto(photoKey(adventure.id, item.id), photo.blob), item.title);
  }
}

/* --------------------------------------------------- the photo journal */

function renderPhotoAll() {
  const ctx = openContext();
  if (!ctx) {
    goBack("home");
    return;
  }
  const { setting, adventure, index, p } = ctx;
  const complete = isComplete(adventure, p);
  const count = foundCount(adventure, p);
  const total = adventure.items.length;

  $("#photo-all-heading").textContent = complete ? "Journal" : "All discoveries";
  $("#progress-photo").textContent = progressLabel(adventure, p);

  const head = $("#photo-journal-head");
  const nextLine = complete ? nextAdventureLine(setting, index) : "";
  head.innerHTML = complete
    ? html`
      <div class="done-banner">
        <svg class="sun" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-sun"/></svg>
        <span>Every discovery found. What an adventure!</span>
      </div>
      <h1 class="journal-title">${esc(adventure.title)}</h1>
      <p class="journal-sub">${esc(joinParts([`${possessive(playerName())} ${collectionName(setting, adventure)}`, `${count} ${plural(count, "discovery", "discoveries")}`, niceDate(p.completedAt)]))}${bonusFound(adventure, p) ? " · plus the bonus ⭐" : ""}</p>
      ${nextLine}`
    : html`
      <h1 class="journal-title">${esc(adventure.title)}</h1>
      <p class="journal-sub">${count} of ${total} found so far · tap one to go there</p>`;

  $("#photo-grid").innerHTML = allItems(adventure).map((item, i) => {
    const found = Boolean(p.found[item.id]);
    const key = photoKey(adventure.id, item.id);
    const photo = photos.get(key);
    const bonus = isBonus(adventure, item.id);
    const note = (p.found[item.id] && p.found[item.id].note) || "";
    const current = p.current === item.id ? " is-current" : "";
    const media = found && photo
      ? html`<img class="journal-thumb" alt="" src="${urlForPhoto(key, photo.blob)}">`
      : html`<span class="journal-empty" aria-hidden="true">${bonus ? "★" : i + 1}</span>`;
    return html`
      <button class="journal-card${found ? "" : " todo"}${bonus ? " is-bonus" : ""}${current}" type="button" data-item="${item.id}">
        ${media}
        ${found ? html`<span class="journal-tick" aria-label="Found"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-tick"/></svg></span>` : ""}
        <span class="journal-caption">${bonus ? "⭐ " : ""}${esc(item.title)}</span>
        ${note ? html`<span class="journal-note-line">${esc(note)}</span>` : ""}
      </button>`;
  }).join("");

  const anyPhotos = allItems(adventure).some((item) => p.found[item.id] && photos.has(photoKey(adventure.id, item.id)));
  $("#photo-all-actions").innerHTML = anyPhotos
    ? html`
      <button class="btn primary" type="button" id="share-journal"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-share"/></svg>Share journal</button>
      <button class="btn" type="button" id="print-journal">Print or save as PDF</button>`
    : "";
  if (anyPhotos) {
    $("#share-journal").addEventListener("click", shareJournal);
    $("#print-journal").addEventListener("click", printJournal);
  }
}

/** The line that explains when the next adventure in this setting opens. */
function nextAdventureLine(setting, index) {
  const nextIndex = index + 1;
  if (nextIndex >= setting.adventures.length) {
    return setting.custom
      ? html`<p class="journal-note">That's the whole hunt. Nicely done!</p>`
      : html`<p class="journal-note">That's every adventure in ${esc(setting.title)}. Try somewhere else!</p>`;
  }
  const status = adventureStatus(setting, nextIndex);
  if (status === "open") {
    return html`<p class="journal-note">“${esc(setting.adventures[nextIndex].title)}” is ready when you are.</p>`;
  }
  return html`<p class="journal-note">🌙 The next adventure, “${esc(setting.adventures[nextIndex].title)}”, opens tomorrow morning. See you then.</p>`;
}

$("#photo-grid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-item]");
  if (!card) return;
  const ctx = openContext();
  if (!ctx) return;
  ctx.p.current = card.dataset.item;
  save();
  goBack("photo");
});

async function shareJournal() {
  const ctx = openContext();
  if (!ctx) return;
  const { setting, adventure, p } = ctx;
  const btn = $("#share-journal");
  const entries = allItems(adventure)
    .filter((item) => p.found[item.id] && photos.has(photoKey(adventure.id, item.id)))
    .map((item) => ({
      title: (p.found[item.id].note || item.title),
      blob: photos.get(photoKey(adventure.id, item.id)).blob
    }));
  if (!entries.length) return;
  btn.disabled = true;
  btn.textContent = "Making your journal…";
  try {
    const blob = await buildContactSheet(entries, {
      heading: adventure.title,
      subheading: joinParts([
        `${possessive(playerName())} ${collectionName(setting, adventure)}`,
        `${entries.length} ${plural(entries.length, "discovery", "discoveries")}`,
        niceDate(p.completedAt || p.startedAt)
      ])
    });
    const result = await shareImage(blob, `${playerName()}-${adventure.id}`, `${possessive(playerName())} ${adventure.title}`);
    if (result === "unsupported") openLightbox(URL.createObjectURL(blob), adventure.title);
  } catch (err) {
    toast("Couldn't make the journal image this time.");
    console.warn("Journal failed", err);
  } finally {
    renderPhotoAll();
  }
}

/**
 * Build a clean printable page and hand it to the system print sheet, which on
 * an iPhone is also how you save a PDF. Print styles live in styles.css.
 */
function printJournal() {
  const ctx = openContext();
  if (!ctx) return;
  const { setting, adventure, p } = ctx;
  const rows = allItems(adventure)
    .filter((item) => p.found[item.id])
    .map((item) => {
      const photo = photos.get(photoKey(adventure.id, item.id));
      const note = p.found[item.id].note || "";
      return html`
        <figure class="print-cell">
          ${photo ? html`<img src="${urlForPhoto(photoKey(adventure.id, item.id), photo.blob)}" alt="">` : html`<span class="print-blank"></span>`}
          <figcaption>
            <strong>${esc(item.title)}</strong>
            ${note ? html`<em>${esc(note)}</em>` : ""}
          </figcaption>
        </figure>`;
    }).join("");

  $("#print-sheet").innerHTML = html`
    <header class="print-head">
      <h1>${esc(adventure.title)}</h1>
      <p>${esc(joinParts([`${possessive(playerName())} ${collectionName(setting, adventure)}`, niceDate(p.completedAt || p.startedAt)]))}</p>
    </header>
    <div class="print-grid">${rows}</div>
    <footer class="print-foot">Wander · ${esc(setting.place)}</footer>`;

  document.body.classList.add("printing");
  const cleanup = () => {
    document.body.classList.remove("printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Give the browser a frame to lay the sheet out before it snapshots it.
  window.setTimeout(() => {
    try {
      window.print();
    } catch {
      toast("Printing isn't available on this device.");
    }
    window.setTimeout(cleanup, 1000);
  }, 60);
}

/* ================================================================
   5. Tick hunts
   ================================================================ */

const missionCard = $("#mission-card");
const foundBtn = $("#found-btn");
let advanceTimer = null;

function renderTickHunt(direction = 0) {
  const ctx = openContext();
  if (!ctx) {
    goBack("home");
    return;
  }
  const { setting, adventure, p } = ctx;
  const item = currentItem(adventure, p);
  const index = adventure.items.findIndex((i) => i.id === item.id);
  const bonus = isBonus(adventure, item.id);
  const found = Boolean(p.found[item.id]);

  $("#tick-adventure").textContent = `${setting.emoji} ${adventure.title}`;
  $("#tick-eyebrow").textContent = bonus
    ? "⭐ Bonus mission"
    : `Mission ${index + 1} of ${adventure.items.length}`;
  $("#tick-kind").textContent = KIND_LABELS[item.kind] || "Look";
  $("#tick-title").textContent = item.title;
  $("#progress-tick").textContent = progressLabel(adventure, p);
  setRing($("#ring-tick"), adventure, p);

  missionCard.classList.toggle("is-found", found);
  let stamp = missionCard.querySelector(".found-stamp");
  if (found && !stamp) {
    stamp = document.createElement("span");
    stamp.className = "found-stamp";
    stamp.setAttribute("aria-label", "Found");
    stamp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-tick"/></svg>';
    missionCard.appendChild(stamp);
  } else if (!found && stamp) {
    stamp.remove();
  }

  foundBtn.classList.toggle("is-found", found);
  foundBtn.querySelector(".found-label").textContent = found ? "Found — tap to undo" : "Found it";
  $("#tick-skip").textContent = found ? "Next mission" : "Skip for now";
  $("#swipe-hint").hidden = foundCount(adventure, p) > 1;

  if (direction !== 0) {
    missionCard.classList.add(direction > 0 ? "slide-right" : "slide-left");
    void missionCard.offsetWidth; // restart the transition
    missionCard.classList.remove("slide-right", "slide-left");
  }
}

function tickGo(item, direction) {
  const ctx = openContext();
  if (!ctx) return;
  window.clearTimeout(advanceTimer);
  ctx.p.current = item.id;
  save();
  renderTickHunt(direction);
}

function tickAdvance() {
  const ctx = openContext();
  if (!ctx) return;
  const next = nextIncomplete(ctx.adventure, ctx.p, ctx.p.current);
  if (!next) {
    navigate("tick-all");
    return;
  }
  tickGo(next, 1);
}

foundBtn.addEventListener("click", () => {
  const ctx = openContext();
  if (!ctx) return;
  const { adventure, p } = ctx;
  const item = currentItem(adventure, p);
  if (p.found[item.id]) {
    window.clearTimeout(advanceTimer);
    unmarkFound(adventure, p, item.id);
    renderTickHunt();
    return;
  }
  const completed = markFound(adventure, p, item.id);
  if (state.settings.sound) playTick();
  renderTickHunt();
  foundBtn.classList.remove("pulse");
  void foundBtn.offsetWidth;
  foundBtn.classList.add("pulse");
  window.clearTimeout(advanceTimer);
  advanceTimer = window.setTimeout(() => {
    foundBtn.classList.remove("pulse");
    if (currentScreen !== "tick") return;
    if (completed) navigate("tick-all");
    else tickAdvance();
  }, completed ? 900 : 650);
});

$("#tick-skip").addEventListener("click", () => {
  const ctx = openContext();
  if (!ctx) return;
  if (ctx.p.found[ctx.p.current]) tickGo(neighbour(ctx.adventure, ctx.p.current, 1), 1);
  else tickAdvance();
});
$("#tick-prev").addEventListener("click", () => {
  const ctx = openContext();
  if (ctx) tickGo(neighbour(ctx.adventure, ctx.p.current, -1), -1);
});
$("#tick-next").addEventListener("click", () => {
  const ctx = openContext();
  if (ctx) tickGo(neighbour(ctx.adventure, ctx.p.current, 1), 1);
});

// Swipe between missions. Vertical scrolling is left alone.
let swipeStart = null;
missionCard.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
missionCard.addEventListener("pointerup", (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dy) < 60) {
    const ctx = openContext();
    if (ctx) tickGo(neighbour(ctx.adventure, ctx.p.current, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }
});
missionCard.addEventListener("pointercancel", () => { swipeStart = null; });

/* ------------------------------------------------ the tick checklist */

let chimedFor = null;

function renderTickAll() {
  const ctx = openContext();
  if (!ctx) {
    goBack("home");
    return;
  }
  const { setting, adventure, index, p } = ctx;
  const complete = isComplete(adventure, p);
  const count = foundCount(adventure, p);
  const night = setting.palette === "night";

  $("#tick-all-heading").textContent = complete ? "Summary" : "All missions";
  $("#progress-tick").textContent = progressLabel(adventure, p);

  const head = $("#tick-journal-head");
  if (complete) {
    head.innerHTML = html`
      ${night ? html`<svg class="moon" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-moon"/></svg>` : html`<svg class="sun" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-sun"/></svg>`}
      <h1 class="journal-title">${esc(adventure.title)}</h1>
      <p class="journal-sub">${esc(possessive(playerName()))} ${esc(collectionName(setting, adventure))} · ${count} found${bonusFound(adventure, p) ? " · plus the bonus ⭐" : ""}</p>
      ${nextAdventureLine(setting, index)}`;
    if (night) startNightSky($("#tick-sky"));
    if (state.settings.sound && chimedFor !== p.completedAt) {
      chimedFor = p.completedAt;
      playChime();
    }
  } else {
    head.innerHTML = html`
      <h1 class="journal-title">${esc(adventure.title)}</h1>
      <p class="journal-sub">${count} of ${adventure.items.length} found · tap to tick one off</p>`;
    stopNightSky($("#tick-sky"));
  }

  $("#tick-list").innerHTML = allItems(adventure).map((item) => {
    const found = Boolean(p.found[item.id]);
    const bonus = isBonus(adventure, item.id);
    const current = p.current === item.id ? " is-current" : "";
    return html`
      <li>
        <button class="check-row${found ? " is-found" : ""}${bonus ? " is-bonus" : ""}${current}" type="button" data-item="${item.id}" aria-pressed="${found}">
          <span class="check-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-tick"/></svg></span>
          <span><span class="row-kind">${bonus ? "⭐ Bonus" : esc(KIND_LABELS[item.kind] || "Look")}</span>${esc(item.title)}</span>
        </button>
      </li>`;
  }).join("");

  $("#tick-all-actions").innerHTML = complete
    ? html`<button class="btn primary" type="button" id="tick-done">Back to ${esc(setting.title)}</button>`
    : "";
  if (complete) $("#tick-done").addEventListener("click", () => goBack("setting"));
}

$("#tick-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-item]");
  if (!row) return;
  const ctx = openContext();
  if (!ctx) return;
  const { adventure, p } = ctx;
  const itemId = row.dataset.item;
  const wasComplete = isComplete(adventure, p);
  if (p.found[itemId]) {
    unmarkFound(adventure, p, itemId);
  } else {
    markFound(adventure, p, itemId);
    if (state.settings.sound) playTick();
  }
  // Keep the hunt screen pointing at something still to find.
  if (p.found[p.current]) {
    const next = nextIncomplete(adventure, p, p.current);
    if (next) p.current = next.id;
    save();
  }
  if (wasComplete !== isComplete(adventure, p)) {
    renderTickAll();
  } else {
    const found = Boolean(p.found[itemId]);
    row.classList.toggle("is-found", found);
    row.setAttribute("aria-pressed", String(found));
    $("#progress-tick").textContent = progressLabel(adventure, p);
    const sub = $("#tick-journal-head .journal-sub");
    if (sub && !isComplete(adventure, p)) {
      sub.textContent = `${foundCount(adventure, p)} of ${adventure.items.length} found · tap to tick one off`;
    }
  }
});

/* ================================================================
   6. The shelf
   ================================================================ */

function renderShelf() {
  const rows = shelfEntries();
  const stats = lifetimeStats();
  $("#shelf-sub").textContent =
    `${stats.found} ${plural(stats.found, "discovery", "discoveries")} collected so far`;

  $("#shelf-list").innerHTML = rows.length
    ? rows.map(({ setting, adventure, progress }) => {
        const cover = allItems(adventure)
          .map((item) => photos.get(photoKey(adventure.id, item.id)))
          .find(Boolean);
        const media = cover
          ? html`<img class="shelf-cover" alt="" src="${urlForPhoto(`cover:${adventure.id}`, cover.blob)}">`
          : html`<span class="shelf-cover blank ${setting.palette}" aria-hidden="true">${setting.emoji}</span>`;
        return html`
          <button class="shelf-row" type="button" data-setting="${setting.id}" data-adventure="${adventure.id}">
            ${media}
            <span class="shelf-text">
              <span class="shelf-title">${esc(adventure.title)}</span>
              <span class="shelf-meta">${esc(joinParts([
                setting.custom && setting.title === adventure.title ? setting.emoji : `${setting.emoji} ${setting.title}`,
                niceDate(progress.completedAt)
              ]))}</span>
              <span class="shelf-count">${Object.keys(progress.found).length} found</span>
            </span>
          </button>`;
      }).join("")
    : html`<p class="empty-note">Finish an adventure and it will be kept here.</p>`;
}

$("#shelf-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-adventure]");
  if (!row) return;
  openSettingId = row.dataset.setting;
  openAdventureId = row.dataset.adventure;
  const setting = getSetting(openSettingId);
  if (!setting) return;
  navigate(overviewScreen(setting));
});

/* ================================================================
   8. Making a hunt of your own
   ================================================================ */

/*
 * A hunt written here is encoded into a link and nothing else: there is no
 * upload and no server. See hunts.js for the wire format. The draft is kept
 * in localStorage as it is typed so a locked phone does not lose the work.
 */

let draft = null;
let madeHunt = null; // the finished hunt, while the share screen is up

function blankDraft() {
  return {
    title: "",
    place: "",
    note: "",
    emoji: EMOJI_CHOICES[0],
    mode: "photo",
    night: false,
    items: ["", "", "", ""]
  };
}

function openBuilder() {
  draft = store.loadDraft() || blankDraft();
  if (!Array.isArray(draft.items) || draft.items.length < LIMITS.minItems) {
    draft.items = [...(draft.items || []), "", "", "", ""].slice(0, LIMITS.minItems);
  }
  navigate("builder");
}

function renderBuilder() {
  if (!draft) draft = store.loadDraft() || blankDraft();

  $("#b-title").value = draft.title;
  $("#b-place").value = draft.place;
  $("#b-note").value = draft.note;

  $("#b-emoji").innerHTML = EMOJI_CHOICES.map((emoji) => html`
    <button class="emoji-btn${emoji === draft.emoji ? " is-chosen" : ""}" type="button"
            data-emoji="${esc(emoji)}" aria-pressed="${emoji === draft.emoji}"
            aria-label="Icon ${esc(emoji)}">${esc(emoji)}</button>`).join("");

  document.querySelectorAll('input[name="b-mode"]').forEach((radio) => {
    radio.checked = radio.value === draft.mode;
  });
  $("#b-night-line").hidden = draft.mode !== "tick";
  $("#b-night").checked = Boolean(draft.night);

  renderChallengeRows();
  $("#b-error").hidden = true;
}

function renderChallengeRows() {
  const atMax = draft.items.length >= LIMITS.maxItems;
  $("#b-count").textContent = `${draft.items.filter((t) => t.trim()).length} of ${LIMITS.maxItems}`;
  $("#b-items").innerHTML = draft.items.map((text, index) => html`
    <li class="challenge-row">
      <span class="challenge-number" aria-hidden="true">${index + 1}</span>
      <input type="text" maxlength="${LIMITS.item}" data-index="${index}"
             enterkeyhint="next" autocapitalize="sentences"
             aria-label="Thing to find ${index + 1}"
             placeholder="${index === 0 ? "Find something yellow" : "Something to find"}"
             value="${esc(text)}">
      <button class="challenge-remove" type="button" data-remove="${index}"
              aria-label="Remove item ${index + 1}"
              ${draft.items.length <= LIMITS.minItems ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-cross"/></svg>
      </button>
    </li>`).join("");
  $("#b-add").disabled = atMax;
  $("#b-add").textContent = atMax ? `That's the most (${LIMITS.maxItems})` : "+ Add another";
}

function saveDraftSoon() {
  store.saveDraft(draft);
}

/* Field wiring. Values are read back on input so nothing is lost on a reload. */
$("#b-title").addEventListener("input", (e) => { draft.title = e.target.value; saveDraftSoon(); });
$("#b-place").addEventListener("input", (e) => { draft.place = e.target.value; saveDraftSoon(); });
$("#b-note").addEventListener("input", (e) => { draft.note = e.target.value; saveDraftSoon(); });

$("#b-emoji").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-emoji]");
  if (!btn) return;
  draft.emoji = btn.dataset.emoji;
  saveDraftSoon();
  renderBuilder();
});

document.querySelectorAll('input[name="b-mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    draft.mode = radio.value;
    // A photo hunt is never dark — that is the thing the app set out to avoid.
    if (draft.mode === "photo") draft.night = false;
    saveDraftSoon();
    $("#b-night-line").hidden = draft.mode !== "tick";
    $("#b-night").checked = Boolean(draft.night);
  });
});

$("#b-night").addEventListener("change", (e) => { draft.night = e.target.checked; saveDraftSoon(); });

$("#b-items").addEventListener("input", (event) => {
  const input = event.target.closest("[data-index]");
  if (!input) return;
  draft.items[Number(input.dataset.index)] = input.value;
  $("#b-count").textContent = `${draft.items.filter((t) => t.trim()).length} of ${LIMITS.maxItems}`;
  saveDraftSoon();
});

$("#b-items").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-remove]");
  if (!btn || btn.disabled) return;
  draft.items.splice(Number(btn.dataset.remove), 1);
  saveDraftSoon();
  renderChallengeRows();
});

// Enter moves to the next box, and adds one when at the end.
$("#b-items").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const input = event.target.closest("[data-index]");
  if (!input) return;
  event.preventDefault();
  const index = Number(input.dataset.index);
  if (index === draft.items.length - 1 && draft.items.length < LIMITS.maxItems) {
    addChallengeRow();
  } else {
    const next = $("#b-items").querySelector(`[data-index="${index + 1}"]`);
    if (next) next.focus();
  }
});

function addChallengeRow() {
  if (draft.items.length >= LIMITS.maxItems) return;
  draft.items.push("");
  saveDraftSoon();
  renderChallengeRows();
  const last = $("#b-items").querySelector(`[data-index="${draft.items.length - 1}"]`);
  if (last) last.focus();
}

$("#b-add").addEventListener("click", addChallengeRow);
$("#builder-form").addEventListener("submit", (event) => event.preventDefault());

function builderError(message) {
  const el = $("#b-error");
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

$("#b-make").addEventListener("click", async () => {
  const items = draft.items.map((t) => t.trim()).filter(Boolean);
  if (!draft.title.trim()) return builderError("Give the hunt a name first.");
  if (!draft.place.trim()) return builderError("Say where the hunt happens.");
  if (items.length < LIMITS.minItems) {
    return builderError(`Write at least ${LIMITS.minItems} things to find. There ${items.length === 1 ? "is" : "are"} ${items.length} so far.`);
  }

  // Run it through the same validator a received hunt faces, so what the
  // writer sees is exactly what the other phone will get.
  const hunt = validateHunt({
    i: newHuntId(),
    t: draft.title,
    p: draft.place,
    n: draft.note,
    e: draft.emoji,
    m: draft.mode,
    d: draft.night ? "night" : "day",
    x: items
  });
  if (!hunt) return builderError("Something in that hunt didn't look right. Have another check.");

  madeHunt = hunt;
  // Keep it for the person who wrote it, too.
  state.custom[hunt.id] = hunt;
  registerCustom(settingFromHunt(hunt));
  save();
  store.clearDraft();
  draft = blankDraft();
  navigate("share");
});

/* ------------------------------------------------------ the share screen */

async function renderShare() {
  if (!madeHunt) {
    goBack("builder");
    return;
  }
  $("#share-emoji").textContent = madeHunt.emoji;
  $("#share-title").textContent = madeHunt.title;
  $("#share-place").textContent = madeHunt.place;
  $("#share-count").textContent =
    `${madeHunt.items.length} things to find · ${madeHunt.mode === "photo" ? "photograph them" : "tick them off"}`;

  const box = $("#share-link");
  box.value = "Making the link…";
  try {
    const link = await huntLink(madeHunt);
    box.value = link;
    $("#share-meta").textContent = `${link.length} characters — short enough to text.`;
  } catch (err) {
    box.value = "";
    $("#share-meta").textContent = "The link couldn't be made on this device.";
    console.warn("Link failed", err);
  }
}

$("#share-send").addEventListener("click", async () => {
  const link = $("#share-link").value;
  if (!link || !madeHunt) return;
  const data = { title: madeHunt.title, text: `${madeHunt.title} — a hunt for you`, url: link };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  copyLink();
});

async function copyLink() {
  const link = $("#share-link").value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied. Paste it into a message.");
  } catch {
    // Selecting it is the last resort, and works everywhere.
    const box = $("#share-link");
    box.focus();
    box.select();
    toast("Press and hold the link to copy it.");
  }
}

$("#share-copy").addEventListener("click", copyLink);

$("#share-play").addEventListener("click", () => {
  if (!madeHunt) return;
  openSettingId = `custom-${madeHunt.id}`;
  state.lastSetting = openSettingId;
  save();
  goBack("home");
  navigate("setting");
});

/* --------------------------------------------------- receiving in a link */

let receivedHunt = null;

/**
 * Read a `#hunt=…` fragment, if there is one. The fragment is always cleared
 * afterwards so a reload cannot re-add the hunt and the address bar stays
 * tidy. Returns true if a hunt is waiting to be shown.
 */
async function takeSharedHunt() {
  const fragment = takeHuntFragment();
  if (!fragment) return false;

  let hunt = null;
  try {
    hunt = await decodeHunt(fragment);
  } catch {
    hunt = null;
  }

  // Clear the fragment either way, so a bad link is not retried forever.
  try {
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  } catch {
    /* ignore */
  }

  if (!hunt) {
    toast("That hunt link didn't look right. Ask for a new one.", 4000);
    return false;
  }

  const known = Boolean(state.custom[hunt.id]);
  state.custom[hunt.id] = hunt;
  registerCustom(settingFromHunt(hunt));
  save();

  if (known) {
    // Already had it: go straight there rather than making a fuss.
    openSettingId = `custom-${hunt.id}`;
    state.lastSetting = openSettingId;
    save();
    return false;
  }

  receivedHunt = hunt;
  return true;
}

/**
 * A hunt link tapped while the app is already open changes only the fragment,
 * which is a same-document navigation: no reload, so boot() never runs again.
 * That happens whenever the installed app is in the background and a link
 * arrives in Messages, so it has to be handled live.
 */
window.addEventListener("hashchange", async () => {
  if (!takeHuntFragment()) return;
  let shared = false;
  try {
    shared = await takeSharedHunt();
  } catch (err) {
    console.warn("Shared hunt failed", err);
  }
  if (shared && state.player) {
    showReceived();
    navigate("received");
  } else if (shared) {
    navigate("player"); // ask who they are first; setPlayer picks it up
  } else if (openSettingId && getSetting(openSettingId)) {
    // Already had this one — go straight to it.
    navigate("setting");
  }
});

function showReceived() {
  const hunt = receivedHunt;
  if (!hunt) return;
  $("#received-emoji").textContent = hunt.emoji;
  $("#received-title").textContent = hunt.title;
  $("#received-place").textContent = hunt.place;
  $("#received-note").textContent = hunt.note || "";
  $("#received-note").hidden = !hunt.note;
  $("#received-count").textContent =
    `${hunt.items.length} things to find · ${hunt.mode === "photo" ? "photograph them" : "tick them off"}`;
}

$("#received-go").addEventListener("click", () => {
  if (!receivedHunt) return;
  openSettingId = `custom-${receivedHunt.id}`;
  state.lastSetting = openSettingId;
  save();
  receivedHunt = null;
  goBack("home");
  navigate("setting");
});

$("#received-later").addEventListener("click", () => {
  receivedHunt = null;
  goBack("home");
});

/* ------------------------------------------------------- removing one */

async function removeCustomHunt(settingId) {
  const setting = getSetting(settingId);
  if (!setting || !setting.custom) return;
  const huntId = settingId.replace(/^custom-/, "");

  for (const adventure of setting.adventures) {
    for (const item of allItems(adventure)) {
      const key = photoKey(adventure.id, item.id);
      photos.delete(key);
      releasePhotoURL(key);
    }
    try {
      await store.deleteAdventurePhotos(adventure.id);
    } catch {
      /* nothing stored */
    }
  }

  delete state.custom[huntId];
  delete state.progress[settingId];
  if (state.lastSetting === settingId) state.lastSetting = null;
  unregisterCustom(settingId);
  save();

  if (openSettingId === settingId) openSettingId = null;
  goBack("home");
  toast(`“${setting.title}” was removed from this device.`);
}

/* ================================================================
   7. Dialogs, toasts, service worker, boot
   ================================================================ */

function openDialog(dialog) {
  if (dialog.open) return true;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return true;
  }
  if (typeof dialog.show === "function") {
    dialog.show(); // no backdrop, but the content is still reachable
    return true;
  }
  return false;
}

// A tap on the dimmed backdrop closes any sheet.
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close("backdrop");
  });
});

/* The safety note, shown once per adventure */
function showSafety(setting) {
  const ctx = openContext();
  if (!ctx) return;
  const dialog = $("#dlg-safety");
  // The briefing: which expedition this is, then where they can go.
  $("#safety-emoji").textContent = setting.emoji;
  $("#safety-title").textContent = ctx.adventure.title;
  $("#safety-blurb").textContent = ctx.adventure.blurb || "";
  $("#safety-blurb").hidden = !ctx.adventure.blurb;
  $("#safety-text").textContent = setting.safety;
  $("#safety-privacy").hidden = setting.interaction !== "photo";
  const onClose = () => {
    dialog.removeEventListener("close", onClose);
    ctx.p.safetyShown = true;
    save();
  };
  dialog.addEventListener("close", onClose);
  if (!openDialog(dialog)) onClose();
}

/* Settings */
let settingsAdventureId = null;
let settingsCustomId = null;

function openSettings(adventureId) {
  settingsAdventureId = adventureId;
  const dialog = $("#dlg-settings");
  $("#settings-sound").checked = Boolean(state.settings.sound);
  const found = adventureId ? findAdventure(adventureId) : null;
  $("#settings-reset-row").hidden = !found;
  if (found) $("#settings-reset-label").textContent = `Start “${found.adventure.title}” again`;
  // Only a hunt that arrived in a link can be removed; built-ins always stay.
  const custom = found && found.setting.custom ? found.setting : null;
  settingsCustomId = custom ? custom.id : null;
  $("#settings-remove-row").hidden = !custom;
  if (custom) $("#settings-remove-label").textContent = `Remove “${custom.title}”`;
  $("#settings-install").hidden = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  openDialog(dialog);
}

$("#settings-sound").addEventListener("change", (event) => {
  state.settings.sound = event.target.checked;
  save();
  if (state.settings.sound) playTick();
});

$("#settings-player").addEventListener("click", () => {
  $("#dlg-settings").close();
  navigate("player");
});

$("#settings-make").addEventListener("click", () => {
  $("#dlg-settings").close();
  openBuilder();
});

$("#settings-remove").addEventListener("click", () => {
  const settingId = settingsCustomId;
  $("#dlg-settings").close();
  const setting = settingId ? getSetting(settingId) : null;
  if (!setting) return;
  $("#reset-title").textContent = `Remove “${setting.title}”?`;
  $("#reset-text").textContent = setting.interaction === "photo"
    ? "This takes the hunt off this device along with its photos. If you still have the link, you can always open it again."
    : "This takes the hunt off this device. If you still have the link, you can always open it again.";
  $("#reset-hold").dataset.adventure = "";
  $("#reset-hold").dataset.custom = settingId;
  $("#reset-hold .hold-label").textContent = "Press and hold to remove";
  openDialog($("#dlg-reset"));
});

$("#settings-reset").addEventListener("click", () => {
  const adventureId = settingsAdventureId;
  $("#dlg-settings").close();
  const found = adventureId ? findAdventure(adventureId) : null;
  if (!found) return;
  const photoHunt = found.setting.interaction === "photo";
  $("#reset-title").textContent = `Start “${found.adventure.title}” again?`;
  $("#reset-text").textContent = photoHunt
    ? `This clears every discovery in this adventure and deletes its photos from this device. Your other adventures are not touched. It can't be undone.`
    : `This clears every ticked mission in this adventure so you can explore it again. Your other adventures are not touched.`;
  $("#reset-hold").dataset.adventure = adventureId;
  $("#reset-hold").dataset.custom = "";
  $("#reset-hold .hold-label").textContent = "Press and hold to start again";
  openDialog($("#dlg-reset"));
});

/* Press and hold to confirm a reset — this protects against accidental taps. */
const holdBtn = $("#reset-hold");
let holdTimer = null;

function beginHold(event) {
  event.preventDefault();
  // Capture the pointer for the whole press. Without this a small wobble of a
  // finger — or the sheet still settling into place underneath it — fires
  // pointerleave and cancels the hold with no explanation.
  if (event.pointerId !== undefined && holdBtn.setPointerCapture) {
    try {
      holdBtn.setPointerCapture(event.pointerId);
    } catch {
      /* not a real pointer (a keypress, or a synthetic event) */
    }
  }
  holdBtn.classList.add("holding");
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    endHold();
    if (holdBtn.dataset.custom) removeCustomHunt(holdBtn.dataset.custom);
    else performReset(holdBtn.dataset.adventure);
    $("#dlg-reset").close();
  }, 1200);
}
function endHold(event) {
  if (event && event.pointerId !== undefined && holdBtn.hasPointerCapture
      && holdBtn.hasPointerCapture(event.pointerId)) {
    holdBtn.releasePointerCapture(event.pointerId);
  }
  window.clearTimeout(holdTimer);
  holdBtn.classList.remove("holding");
}
holdBtn.addEventListener("pointerdown", beginHold);
holdBtn.addEventListener("pointerup", endHold);
holdBtn.addEventListener("pointercancel", endHold);
holdBtn.addEventListener("keydown", (event) => {
  if (event.repeat) return; // auto-repeat must not restart the timer
  if (event.key === "Enter" || event.key === " ") beginHold(event);
});
holdBtn.addEventListener("keyup", endHold);

async function performReset(adventureId) {
  const found = adventureId ? findAdventure(adventureId) : null;
  if (!found) return;
  const { setting, adventure } = found;

  const bucket = state.progress[setting.id];
  if (bucket && bucket.adventures) delete bucket.adventures[adventure.id];
  save();

  if (setting.interaction === "photo") {
    for (const item of allItems(adventure)) {
      const key = photoKey(adventure.id, item.id);
      photos.delete(key);
      releasePhotoURL(key);
    }
    try {
      await store.deleteAdventurePhotos(adventure.id);
    } catch {
      /* nothing stored */
    }
  }
  $("#dlg-reset").close();
  goBack("setting");
  toast(setting.interaction === "photo"
    ? "Adventure reset. Its photos were removed from this device."
    : "Adventure reset.");
}

/* Lightbox — the fallback when the share sheet isn't available */
function openLightbox(url, caption) {
  $("#lightbox-img").src = url;
  $("#lightbox-img").alt = caption;
  $("#lightbox-caption").textContent = caption;
  if (!openDialog($("#dlg-lightbox"))) window.open(url, "_blank");
}

/* Toast */
let toastTimer = null;
function toast(message, duration = 2600) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, duration);
}

/* Service worker — offline after the first successful load */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const start = async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            const pill = $("#update-pill");
            pill.hidden = false;
            pill.onclick = () => {
              pill.hidden = true;
              worker.postMessage({ type: "SKIP_WAITING" });
            };
          }
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("Service worker registration failed", err);
    }
  };
  // boot() is async, so the load event may already have fired by now.
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/* Boot */

/** Which adventure a bare v1 photo key belonged to. */
function legacyAdventureFor(itemId) {
  const nightIds = new Set(allItems(SETTINGS.torchlight.adventures[0]).map((i) => i.id));
  return nightIds.has(itemId) ? store.V1_NIGHT_ADVENTURE : store.V1_DAY_ADVENTURE;
}

/** Re-register every hunt that arrived in a link on some earlier visit. */
function registerSavedHunts() {
  for (const [id, saved] of Object.entries(state.custom || {})) {
    // Re-validate on the way in: a save can be hand-edited or half-written.
    const hunt = validateHunt({
      i: id, t: saved.title, p: saved.place, n: saved.note,
      e: saved.emoji, m: saved.mode, d: saved.palette,
      x: Array.isArray(saved.items) ? saved.items : []
    });
    if (hunt) registerCustom(settingFromHunt(hunt));
    else delete state.custom[id]; // unusable — drop it rather than crash
  }
}

async function boot() {
  store.requestPersistence();
  registerSavedHunts();

  // A v1 install keeps its photos under bare item ids. Re-key them before
  // anything reads the store, and only then let go of the old state key.
  if (loaded.migratedFromV1) {
    try {
      const moved = await store.migratePhotoKeys(legacyAdventureFor);
      save();
      store.dropLegacyState();
      if (moved) console.info(`[wander] migrated ${moved} photo(s) to v2 keys`);
    } catch (err) {
      console.warn("Photo migration failed; keeping the old save", err);
    }
  }

  try {
    const stored = await Promise.race([
      store.getAllPhotos(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 4000))
    ]);
    stored.forEach((record, key) => { if (record && record.blob) photos.set(key, record); });
  } catch (err) {
    photosAvailable = false;
    console.warn("Photo store unavailable", err);
  }

  // A photo hunt discovery marked found with no photo behind it is offered
  // again — but only when the store actually answered, so that "couldn't read"
  // is never mistaken for "there was nothing there".
  if (photosAvailable) {
    let changed = false;
    for (const settingId of settingOrder()) {
      const setting = getSetting(settingId);
      if (setting.interaction !== "photo") continue;
      for (const adventure of setting.adventures) {
        const p = peek(settingId, adventure.id);
        if (!p) continue;
        for (const item of allItems(adventure)) {
          if (p.found[item.id] && !photos.has(photoKey(adventure.id, item.id))) {
            delete p.found[item.id];
            changed = true;
          }
        }
        if (!isComplete(adventure, p)) {
          p.completedAt = null;
          p.completedOn = null;
        }
      }
    }
    if (changed) save();
  }

  // A hunt in the link is handled before anything renders, so the fragment is
  // gone by the time the first screen appears.
  let shared = false;
  try {
    shared = await takeSharedHunt();
  } catch (err) {
    console.warn("Shared hunt failed", err);
  }

  const startScreen = !state.player ? "player" : (shared ? "received" : "home");
  navStack.length = 0;
  navStack.push(startScreen === "received" ? "home" : startScreen);
  history.replaceState({ screen: navStack[0], depth: 1 }, "");
  if (startScreen === "received") {
    showReceived();
    navStack.push("received");
    history.pushState({ screen: "received", depth: 2 }, "");
  }
  show(startScreen);

  if (!store.stateStorageAvailable()) warnStorage();
  else if (!photosAvailable && !state.noticedStorageIssue) {
    state.noticedStorageIssue = true;
    save();
    toast("Photos can't be saved on this device right now.", 3600);
  }

  registerServiceWorker();
}

boot();
