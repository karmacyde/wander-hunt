/*
 * app.js — Wander
 *
 * A small single-page app with no framework. Screens are <section> elements
 * in index.html; this file decides which one is visible, renders its
 * contents from state, and wires up the buttons.
 *
 * Structure:
 *   1. State & helpers            4. Day hunt (photos)
 *   2. Router / theme             5. Night hunt (torchlight checklist)
 *   3. Player & home              6. Dialogs, toasts, service worker, boot
 */

import { HUNTS, KIND_LABELS, allItems, isBonus, findItem } from "./discoveries.js";
import * as store from "./storage.js";
import {
  processImageFile, urlForPhoto, releasePhotoURL, releaseAllPhotoURLs,
  shareImage, buildContactSheet
} from "./photos.js";
import { startNightSky, stopNightSky, playTick, playChime } from "./effects.js";

const $ = (sel) => document.querySelector(sel);
const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (values[i] ?? ""), "");
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ================================================================
   1. State & helpers
   ================================================================ */

let state = store.loadState();
const photos = new Map(); // itemId → { blob, width, height, at }
let photosAvailable = true;
let dayBusy = false;
let storageWarned = false;

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

function coreCount(huntId) {
  return HUNTS[huntId].items.filter((item) => state[huntId].found[item.id]).length;
}
const coreTotal = (huntId) => HUNTS[huntId].items.length;
const bonusFound = (huntId) => Boolean(HUNTS[huntId].bonus && state[huntId].found[HUNTS[huntId].bonus.id]);
const isComplete = (huntId) => coreCount(huntId) === coreTotal(huntId);
const isFound = (huntId, itemId) => Boolean(state[huntId].found[itemId]);

function currentItem(huntId) {
  const items = allItems(huntId);
  const found = items.find((item) => item.id === state[huntId].current);
  if (found) return found;
  state[huntId].current = items[0].id;
  return items[0];
}

/** The next item after `fromId` (in display order, wrapping) that isn't found yet. */
function nextIncomplete(huntId, fromId) {
  const items = allItems(huntId);
  const start = Math.max(0, items.findIndex((item) => item.id === fromId));
  for (let step = 1; step <= items.length; step += 1) {
    const candidate = items[(start + step) % items.length];
    if (!isFound(huntId, candidate.id)) return candidate;
  }
  return null;
}

function neighbour(huntId, fromId, direction) {
  const items = allItems(huntId);
  const index = Math.max(0, items.findIndex((item) => item.id === fromId));
  return items[(index + direction + items.length) % items.length];
}

/** Mark an item found. Returns true if this completed the core list. */
function markFound(huntId, itemId) {
  const hunt = state[huntId];
  hunt.found[itemId] = { at: new Date().toISOString() };
  if (!hunt.startedAt) hunt.startedAt = new Date().toISOString();
  const justCompleted = isComplete(huntId) && !hunt.completedAt;
  if (justCompleted) hunt.completedAt = new Date().toISOString();
  save();
  return justCompleted;
}

function unmarkFound(huntId, itemId) {
  const hunt = state[huntId];
  delete hunt.found[itemId];
  if (!isComplete(huntId)) hunt.completedAt = null;
  save();
}

function progressLabel(huntId) {
  const extra = bonusFound(huntId) ? " ★" : "";
  return `${coreCount(huntId)} of ${coreTotal(huntId)}${extra}`;
}

function setRing(el, huntId) {
  const fraction = coreCount(huntId) / coreTotal(huntId);
  el.style.strokeDashoffset = String(94.25 * (1 - fraction));
}

/* ================================================================
   2. Router & theme
   ================================================================ */

const THEME_COLORS = { home: "#ece6d8", day: "#f4efe4", night: "#0b1220" };
const PARENT = { player: "home", day: "home", night: "home", "day-all": "day", "night-all": "night" };
const navStack = [];
let currentScreen = null;

function themeFor(screen) {
  if (screen === "day" || screen === "day-all") return "day";
  if (screen === "night" || screen === "night-all") return "night";
  return "home";
}

function show(screen) {
  currentScreen = screen;
  const theme = themeFor(screen);
  document.documentElement.dataset.theme = theme;
  $("#theme-color").setAttribute("content", THEME_COLORS[theme]);
  document.querySelectorAll(".screen").forEach((el) => { el.hidden = el.id !== `screen-${screen}`; });
  window.scrollTo(0, 0);
  render(screen);
}

function render(screen) {
  switch (screen) {
    case "player": renderPlayer(); break;
    case "home": renderHome(); break;
    case "day": renderDay(); break;
    case "day-all": renderDayAll(); break;
    case "night": renderNight(); break;
    case "night-all": renderNightAll(); break;
    default: break;
  }
}

function navigate(screen) {
  navStack.push(screen);
  history.pushState({ screen, depth: navStack.length }, "");
  show(screen);
}

/** Go back to `target`, using real history when we can so iOS gestures agree. */
function goBack(target) {
  const index = navStack.lastIndexOf(target);
  if (index >= 0 && index < navStack.length - 1) {
    history.go(index - (navStack.length - 1)); // popstate does the rest
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
  show(screen);
});

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.nav;
    if (PARENT[currentScreen] === target) goBack(target);
    else navigate(target);
  });
});

/* ================================================================
   3. Player & home
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
  const name = playerName();
  $("#player-chip-name").textContent = name;
  $("#home-greeting").textContent = `Ready to explore, ${name}?`;

  for (const huntId of ["day", "night"]) {
    const status = $(`#status-${huntId}`);
    const count = coreCount(huntId);
    status.classList.remove("done");
    if (isComplete(huntId)) {
      status.textContent = huntId === "day" ? "Finished — see your journal" : "Finished — see your summary";
      status.classList.add("done");
    } else if (count > 0 || state[huntId].startedAt) {
      status.textContent = `Continue · ${count} of ${coreTotal(huntId)} found`;
    } else {
      status.textContent = "Start";
    }
  }
}

function startHunt(huntId) {
  const hunt = state[huntId];
  state.activeHunt = huntId;
  if (!hunt.startedAt) hunt.startedAt = new Date().toISOString();
  if (!hunt.current) hunt.current = HUNTS[huntId].items[0].id;
  // Resume where they left off: if the current item is already found, move on.
  if (isFound(huntId, hunt.current)) {
    const next = nextIncomplete(huntId, hunt.current);
    if (next) hunt.current = next.id;
  }
  save();
  if (isComplete(huntId)) {
    navigate(huntId);
    navigate(`${huntId}-all`);
    return;
  }
  navigate(huntId);
  if (!hunt.safetyShown) showSafety(huntId);
}

$("#card-day").addEventListener("click", () => startHunt("day"));
$("#card-night").addEventListener("click", () => startHunt("night"));
$("#home-settings").addEventListener("click", () => openSettings(null));
document.querySelectorAll("[data-settings]").forEach((btn) => {
  btn.addEventListener("click", () => openSettings(btn.dataset.settings));
});

/* ================================================================
   4. Day hunt
   ================================================================ */

const dayStage = $("#day-stage");
const dayActions = $("#day-actions");
const cameraInput = $("#camera-input");

function renderDay() {
  const item = currentItem("day");
  const items = HUNTS.day.items;
  const index = items.findIndex((i) => i.id === item.id);
  const bonus = isBonus("day", item.id);

  $("#day-eyebrow").textContent = bonus ? "⭐ Bonus discovery" : `Discovery ${index + 1} of ${items.length}`;
  $("#day-title").textContent = item.title;
  $("#day-hint").textContent = item.hint || "";
  $("#progress-day").textContent = progressLabel("day");
  setRing($("#ring-day"), "day");

  const photo = photos.get(item.id);
  if (dayBusy) {
    dayStage.innerHTML = html`<div class="busy"><span class="spinner" aria-hidden="true"></span>Saving your photo…</div>`;
    dayActions.innerHTML = "";
    return;
  }

  if (photo && isFound("day", item.id)) {
    dayStage.innerHTML = html`
      <figure class="polaroid" style="margin:0">
        <img id="day-photo" alt="${esc(item.title)}" src="${urlForPhoto(item.id, photo.blob)}">
        <figcaption class="polaroid-caption">
          <span>${esc(item.title.replace(/^Find /, ""))}</span>
          <span class="found-badge"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><use href="#i-tick"/></svg>Found</span>
        </figcaption>
      </figure>`;
    const hasNext = Boolean(nextIncomplete("day", item.id));
    dayActions.innerHTML = html`
      <button class="btn primary big" type="button" id="day-next">${hasNext ? "Next discovery" : "See your journal"}</button>
      <div class="btn-row">
        <button class="btn" type="button" id="day-retake"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-camera"/></svg>Retake</button>
        <button class="btn" type="button" id="day-share"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-share"/></svg>Save / Share</button>
      </div>
      <button class="btn quiet" type="button" id="day-remove">Remove photo</button>`;
    $("#day-next").addEventListener("click", dayNext);
    $("#day-retake").addEventListener("click", openCamera);
    $("#day-share").addEventListener("click", () => sharePhoto(item));
    $("#day-remove").addEventListener("click", () => removePhoto(item.id));
    return;
  }

  dayStage.innerHTML = html`
    <div class="camera-prompt">
      <div class="camera-frame" aria-hidden="true">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <button class="camera-btn" type="button" id="camera-btn" aria-label="Take a photo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-camera"/></svg>
        </button>
      </div>
      <span class="camera-label">Tap to photograph it</span>
    </div>`;
  dayActions.innerHTML = html`<button class="btn quiet" type="button" id="day-skip">Skip this one for now</button>`;
  $("#camera-btn").addEventListener("click", openCamera);
  $("#day-skip").addEventListener("click", dayNext);
}

let pendingItemId = null;

function openCamera() {
  // The camera can take a while; remember what it was opened for so the
  // photo lands on the right discovery even if the screen moved on.
  pendingItemId = currentItem("day").id;
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
  const item = findItem("day", pendingItemId) || currentItem("day");
  pendingItemId = null;
  state.day.current = item.id;
  dayBusy = true;
  renderDay();
  try {
    const { blob, width, height } = await processImageFile(file);
    const record = { blob, width, height, at: new Date().toISOString() };
    photos.set(item.id, record);
    releasePhotoURL(item.id);
    try {
      await store.putPhoto(item.id, record);
    } catch {
      photosAvailable = false;
      toast("Photos can't be saved on this device right now, so this one may not survive a restart.", 4200);
    }
    const completed = markFound("day", item.id);
    dayBusy = false;
    renderDay();
    if (state.settings.sound) playTick();
    if (completed) {
      toast("You found all 16! Opening your journal…", 2200);
      window.setTimeout(() => { if (currentScreen === "day") navigate("day-all"); }, 1600);
    }
  } catch (err) {
    dayBusy = false;
    renderDay();
    toast("Couldn't use that photo — try again.");
    console.warn("Photo failed", err);
  } finally {
    cameraInput.value = "";
  }
});

function dayNext() {
  const next = nextIncomplete("day", state.day.current);
  if (!next) {
    navigate("day-all");
    return;
  }
  state.day.current = next.id;
  save();
  renderDay();
}

async function removePhoto(itemId) {
  photos.delete(itemId);
  releasePhotoURL(itemId);
  unmarkFound("day", itemId);
  try {
    await store.deletePhoto(itemId);
  } catch {
    /* nothing stored, nothing to remove */
  }
  renderDay();
}

async function sharePhoto(item) {
  const photo = photos.get(item.id);
  if (!photo) return;
  const result = await shareImage(photo.blob, item.title, `${possessive(playerName())} discovery: ${item.title}`);
  if (result === "unsupported") openLightbox(urlForPhoto(item.id, photo.blob), item.title);
}

/* --------------------------------------------------- day: journal */

function renderDayAll() {
  const complete = isComplete("day");
  const name = playerName();
  const count = coreCount("day");
  $("#day-all-heading").textContent = complete ? "Journal" : "All discoveries";
  $("#progress-day").textContent = progressLabel("day");

  const head = $("#day-journal-head");
  if (complete) {
    head.innerHTML = html`
      <div class="done-banner">
        <svg class="sun" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-sun"/></svg>
        <span>Every discovery found. What an adventure!</span>
      </div>
      <h1 class="journal-title">${esc(possessive(name))} Day Adventure</h1>
      <p class="journal-sub">${count} discoveries found${bonusFound("day") ? " · plus the bonus ⭐" : ""}</p>`;
  } else {
    head.innerHTML = html`
      <h1 class="journal-title">${esc(possessive(name))} Day Adventure</h1>
      <p class="journal-sub">${count} of ${coreTotal("day")} found so far · tap one to go there</p>`;
  }

  const grid = $("#day-grid");
  grid.innerHTML = allItems("day").map((item, i) => {
    const found = isFound("day", item.id);
    const photo = photos.get(item.id);
    const bonus = isBonus("day", item.id);
    const current = state.day.current === item.id ? " is-current" : "";
    const media = found && photo
      ? html`<img class="journal-thumb" alt="" src="${urlForPhoto(item.id, photo.blob)}">`
      : html`<span class="journal-empty" aria-hidden="true">${bonus ? "★" : i + 1}</span>`;
    return html`
      <button class="journal-card${found ? "" : " todo"}${bonus ? " is-bonus" : ""}${current}" type="button" data-item="${item.id}">
        ${media}
        ${found ? html`<span class="journal-tick" aria-label="Found"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-tick"/></svg></span>` : ""}
        <span class="journal-caption">${bonus ? "⭐ " : ""}${esc(item.title)}</span>
      </button>`;
  }).join("");

  const actions = $("#day-all-actions");
  const anyPhotos = allItems("day").some((item) => isFound("day", item.id) && photos.has(item.id));
  actions.innerHTML = anyPhotos
    ? html`<button class="btn primary" type="button" id="share-journal"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#i-share"/></svg>Share journal</button>`
    : "";
  if (anyPhotos) $("#share-journal").addEventListener("click", shareJournal);
}

$("#day-grid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-item]");
  if (!card) return;
  state.day.current = card.dataset.item;
  save();
  goBack("day");
});

async function shareJournal() {
  const btn = $("#share-journal");
  const entries = allItems("day")
    .filter((item) => isFound("day", item.id) && photos.has(item.id))
    .map((item) => ({ title: item.title, blob: photos.get(item.id).blob }));
  if (!entries.length) return;
  btn.disabled = true;
  btn.textContent = "Making your journal…";
  try {
    const blob = await buildContactSheet(entries, {
      heading: `${possessive(playerName())} Day Adventure`,
      subheading: `${entries.length} ${entries.length === 1 ? "discovery" : "discoveries"} · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
    });
    const result = await shareImage(blob, `${playerName()}-day-adventure`, `${possessive(playerName())} Day Adventure`);
    if (result === "unsupported") openLightbox(URL.createObjectURL(blob), `${possessive(playerName())} Day Adventure`);
  } catch (err) {
    toast("Couldn't make the journal image this time.");
    console.warn("Journal failed", err);
  } finally {
    renderDayAll();
  }
}

/* ================================================================
   5. Night hunt
   ================================================================ */

const missionCard = $("#mission-card");
const foundBtn = $("#found-btn");
let advanceTimer = null;

function renderNight(direction = 0) {
  const item = currentItem("night");
  const items = HUNTS.night.items;
  const index = items.findIndex((i) => i.id === item.id);
  const bonus = isBonus("night", item.id);
  const found = isFound("night", item.id);

  $("#night-eyebrow").textContent = bonus ? "⭐ Bonus mission" : `🔦 Torchlight mission ${index + 1} of ${items.length}`;
  $("#night-kind").textContent = KIND_LABELS[item.kind] || "Look";
  $("#night-title").textContent = item.title;
  $("#progress-night").textContent = progressLabel("night");
  setRing($("#ring-night"), "night");

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
  $("#night-skip").textContent = found ? "Next mission" : "Skip for now";
  $("#swipe-hint").hidden = coreCount("night") > 1;

  if (direction !== 0) {
    missionCard.classList.add(direction > 0 ? "slide-right" : "slide-left");
    void missionCard.offsetWidth; // restart the transition
    missionCard.classList.remove("slide-right", "slide-left");
  }
}

function nightGo(item, direction) {
  window.clearTimeout(advanceTimer);
  state.night.current = item.id;
  save();
  renderNight(direction);
}

function nightAdvance() {
  const next = nextIncomplete("night", state.night.current);
  if (!next) {
    navigate("night-all");
    return;
  }
  nightGo(next, 1);
}

foundBtn.addEventListener("click", () => {
  const item = currentItem("night");
  if (isFound("night", item.id)) {
    window.clearTimeout(advanceTimer);
    unmarkFound("night", item.id);
    renderNight();
    return;
  }
  const completed = markFound("night", item.id);
  if (state.settings.sound) playTick();
  renderNight();
  foundBtn.classList.remove("pulse");
  void foundBtn.offsetWidth;
  foundBtn.classList.add("pulse");
  window.clearTimeout(advanceTimer);
  advanceTimer = window.setTimeout(() => {
    foundBtn.classList.remove("pulse");
    if (currentScreen !== "night") return;
    if (completed) navigate("night-all");
    else nightAdvance();
  }, completed ? 900 : 650);
});

$("#night-skip").addEventListener("click", () => {
  const found = isFound("night", state.night.current);
  if (found) nightGo(neighbour("night", state.night.current, 1), 1);
  else nightAdvance();
});
$("#night-prev").addEventListener("click", () => nightGo(neighbour("night", state.night.current, -1), -1));
$("#night-next").addEventListener("click", () => nightGo(neighbour("night", state.night.current, 1), 1));

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
    nightGo(neighbour("night", state.night.current, dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }
});
missionCard.addEventListener("pointercancel", () => { swipeStart = null; });

/* ------------------------------------------------ night: checklist */

let chimedFor = null;

function renderNightAll() {
  const complete = isComplete("night");
  const name = playerName();
  const count = coreCount("night");
  $("#night-all-heading").textContent = complete ? "Summary" : "All missions";
  $("#progress-night").textContent = progressLabel("night");

  const head = $("#night-journal-head");
  if (complete) {
    head.innerHTML = html`
      <svg class="moon" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-moon"/></svg>
      <h1 class="journal-title">${esc(possessive(name))} Torchlight Adventure</h1>
      <p class="journal-sub">${count} discoveries found${bonusFound("night") ? " · plus the bonus ⭐" : ""}</p>
      <p class="journal-note">Every mission complete. Time to head back in.</p>`;
    startNightSky($("#night-sky"));
    if (state.settings.sound && chimedFor !== state.night.completedAt) {
      chimedFor = state.night.completedAt;
      playChime();
    }
  } else {
    head.innerHTML = html`
      <h1 class="journal-title">${esc(possessive(name))} Torchlight Adventure</h1>
      <p class="journal-sub">${count} of ${coreTotal("night")} found · tap to tick one off</p>`;
    stopNightSky($("#night-sky"));
  }

  $("#night-list").innerHTML = allItems("night").map((item) => {
    const found = isFound("night", item.id);
    const bonus = isBonus("night", item.id);
    const current = state.night.current === item.id ? " is-current" : "";
    return html`
      <li>
        <button class="check-row${found ? " is-found" : ""}${bonus ? " is-bonus" : ""}${current}" type="button" data-item="${item.id}" aria-pressed="${found}">
          <span class="check-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-tick"/></svg></span>
          <span><span class="row-kind">${bonus ? "⭐ Bonus" : esc(KIND_LABELS[item.kind] || "Look")}</span>${esc(item.title)}</span>
        </button>
      </li>`;
  }).join("");

  $("#night-all-actions").innerHTML = complete
    ? html`<button class="btn primary" type="button" id="night-home">Back to adventures</button>`
    : "";
  if (complete) $("#night-home").addEventListener("click", () => goBack("home"));
}

$("#night-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-item]");
  if (!row) return;
  const itemId = row.dataset.item;
  const wasComplete = isComplete("night");
  if (isFound("night", itemId)) {
    unmarkFound("night", itemId);
  } else {
    markFound("night", itemId);
    if (state.settings.sound) playTick();
  }
  // Keep the hunt screen pointing somewhere useful.
  if (isFound("night", state.night.current)) {
    const next = nextIncomplete("night", state.night.current);
    if (next) state.night.current = next.id;
    save();
  }
  if (wasComplete !== isComplete("night")) {
    renderNightAll();
  } else {
    row.classList.toggle("is-found", isFound("night", itemId));
    row.setAttribute("aria-pressed", String(isFound("night", itemId)));
    $("#progress-night").textContent = progressLabel("night");
    const sub = $("#night-journal-head .journal-sub");
    if (sub && !isComplete("night")) sub.textContent = `${coreCount("night")} of ${coreTotal("night")} found · tap to tick one off`;
  }
});

/* ================================================================
   6. Dialogs, toasts, service worker, boot
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

// Tap on the dimmed backdrop closes any sheet.
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close("backdrop");
  });
});

/* Safety note — once per hunt run */
function showSafety(huntId) {
  const hunt = HUNTS[huntId];
  const dialog = $("#dlg-safety");
  $("#safety-emoji").textContent = huntId === "day" ? "🌿" : "🔦";
  $("#safety-title").textContent = huntId === "day" ? "Before you go" : "Before you head out";
  $("#safety-text").textContent = hunt.safety;
  $("#safety-privacy").hidden = huntId !== "day";
  const onClose = () => {
    dialog.removeEventListener("close", onClose);
    state[huntId].safetyShown = true;
    save();
  };
  dialog.addEventListener("close", onClose);
  if (!openDialog(dialog)) onClose();
}

/* Settings */
let settingsHunt = null;

function openSettings(huntId) {
  settingsHunt = huntId;
  const dialog = $("#dlg-settings");
  $("#settings-sound").checked = Boolean(state.settings.sound);
  const resetRow = $("#settings-reset-row");
  resetRow.hidden = !huntId;
  if (huntId) {
    $("#settings-reset-label").textContent = huntId === "day" ? "Start the Day Adventure again" : "Start the Torchlight Adventure again";
  }
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

$("#settings-reset").addEventListener("click", () => {
  const huntId = settingsHunt;
  $("#dlg-settings").close();
  if (!huntId) return;
  $("#reset-title").textContent = huntId === "day" ? "Start the Day Adventure again?" : "Start the Torchlight Adventure again?";
  $("#reset-text").textContent = huntId === "day"
    ? `This clears ${possessive(playerName())} discoveries and deletes the photos for this hunt from this device. It can't be undone.`
    : `This clears every ticked mission so ${playerName()} can explore again. It can't be undone.`;
  $("#reset-hold").dataset.hunt = huntId;
  openDialog($("#dlg-reset"));
});

/* Press-and-hold to confirm a reset — protects against accidental taps. */
const holdBtn = $("#reset-hold");
let holdTimer = null;

function beginHold(event) {
  event.preventDefault();
  holdBtn.classList.add("holding");
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    endHold();
    performReset(holdBtn.dataset.hunt);
  }, 1200);
}
function endHold() {
  window.clearTimeout(holdTimer);
  holdBtn.classList.remove("holding");
}
holdBtn.addEventListener("pointerdown", beginHold);
holdBtn.addEventListener("pointerup", endHold);
holdBtn.addEventListener("pointerleave", endHold);
holdBtn.addEventListener("pointercancel", endHold);
holdBtn.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") beginHold(event); });
holdBtn.addEventListener("keyup", endHold);

async function performReset(huntId) {
  if (!HUNTS[huntId]) return;
  state[huntId] = store.defaultHuntState();
  if (state.activeHunt === huntId) state.activeHunt = null;
  save();
  if (huntId === "day") {
    for (const id of [...photos.keys()]) {
      if (findItem("day", id)) photos.delete(id);
    }
    releaseAllPhotoURLs();
    try {
      await store.clearPhotos();
    } catch {
      /* nothing stored */
    }
  }
  $("#dlg-reset").close();
  goBack("home");
  toast(huntId === "day" ? "Day Adventure reset. Photos removed from this device." : "Torchlight Adventure reset.");
}

/* Lightbox — fallback when the share sheet isn't available */
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
  // boot() is async, so the load event may already have fired by now.
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
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/* Boot */
async function boot() {
  store.requestPersistence();
  try {
    const stored = await Promise.race([
      store.getAllPhotos(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 4000))
    ]);
    stored.forEach((record, id) => { if (record && record.blob) photos.set(id, record); });
  } catch (err) {
    photosAvailable = false;
    console.warn("Photo store unavailable", err);
  }

  // Tidy: a discovery marked found but with no photo behind it is offered again.
  // Only when the photo store actually answered — if it is unavailable we must
  // not mistake "couldn't read" for "there was nothing there".
  if (photosAvailable) {
    for (const item of allItems("day")) {
      if (isFound("day", item.id) && !photos.has(item.id)) delete state.day.found[item.id];
    }
    if (!isComplete("day")) state.day.completedAt = null;
    save();
  }

  const start = state.player ? "home" : "player";
  navStack.length = 0;
  navStack.push(start);
  history.replaceState({ screen: start, depth: 1 }, "");
  show(start);

  if (!store.stateStorageAvailable()) warnStorage();
  else if (!photosAvailable && !state.noticedStorageIssue) {
    state.noticedStorageIssue = true;
    save();
    toast("Photos can't be saved on this device right now.", 3600);
  }

  registerServiceWorker();
}

boot();
