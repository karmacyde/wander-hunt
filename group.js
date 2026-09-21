/*
 * group.js — talking to the photo group.
 *
 * A group is one shared secret: its invite code. Everything else follows from
 * that. The code never leaves the device — what goes over the wire is
 * SHA-256(code), so the server holds no codes and could not hand one back even
 * if it were emptied out in front of you.
 *
 * Eight characters from a 32-letter alphabet is 2^40 codes. The worker can
 * answer 100,000 requests a day, so working through even a thousandth of that
 * space would take some ten thousand years. Guessing is not a way in, which is
 * why there is no rate limiter here pretending to be one.
 *
 * Everything that comes back from the network is treated the way a hunt link
 * is treated in hunts.js: checked, clamped, and rendered as text.
 */

import { GROUP_ENDPOINT, groupsEnabled } from "./config.js";

/* No I, L, O or U: the shapes a child would misread or mistype. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 8;
const TIMEOUT_MS = 12000;

export const LIMITS = {
  name: 20,
  caption: 80,
  groupName: 40,
  photoBytes: 300 * 1024
};

export { groupsEnabled };

/* ---------------------------------------------------------------- codes */

/** A fresh invite code, e.g. "XK4P-9TQM". */
export function newCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Rejection-free because 256 is a whole multiple of 32.
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * Tidy up whatever was typed. Children (and adults) confuse O with 0 and I
 * with 1, so those are mapped rather than rejected. Returns "" if it is not a
 * plausible code.
 */
export function normaliseCode(text) {
  const cleaned = String(text || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (cleaned.length !== CODE_LENGTH) return "";
  return [...cleaned].every((c) => ALPHABET.includes(c)) ? cleaned : "";
}

/** "XK4P9TQM" → "XK4P-9TQM", which is easier to read out loud. */
export function formatCode(code) {
  const clean = String(code || "").toUpperCase();
  return clean.length === CODE_LENGTH ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** The group's id: SHA-256 of the code, hex. The code itself never travels. */
export async function groupIdFor(code) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A stable id for this device within a group. Not a login, just a label. */
export function newMemberId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ----------------------------------------------------------- the wire */

class GroupError extends Error {
  constructor(kind, status) {
    super(kind);
    this.kind = kind; // "offline" | "refused" | "full" | "server"
    this.status = status || 0;
  }
}
export { GroupError };

function endpoint(path) {
  return GROUP_ENDPOINT.trim().replace(/\/+$/, "") + path;
}

async function request(path, { method = "GET", groupId, body, headers = {}, accept = "json" } = {}) {
  if (!groupsEnabled()) throw new GroupError("refused");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint(path), {
      method,
      body,
      signal: controller.signal,
      // The group hash is a credential; keep it out of any cache.
      cache: "no-store",
      headers: groupId ? { authorization: `Bearer ${groupId}`, ...headers } : headers
    });
  } catch {
    throw new GroupError("offline"); // no signal, DNS failure, or timed out
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 507) throw new GroupError("full", 507);
  if (!response.ok) {
    throw new GroupError(response.status >= 500 ? "server" : "refused", response.status);
  }
  if (accept === "blob") return response.blob();
  try {
    return await response.json();
  } catch {
    throw new GroupError("server", response.status);
  }
}

/* ------------------------------------------------------- reading it back */

const clean = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Validate one row of a listing. Returns null for anything malformed. */
function validPhoto(raw) {
  if (!raw || typeof raw !== "object") return null;
  const adventure = clean(raw.adventure, 64);
  const item = clean(raw.item, 64);
  const member = clean(raw.member, 64);
  if (!SAFE_ID.test(adventure) || !SAFE_ID.test(item) || !SAFE_ID.test(member)) return null;
  return {
    adventure,
    item,
    member,
    name: clean(raw.name, LIMITS.name),
    caption: clean(raw.caption, LIMITS.caption),
    at: Number.isFinite(raw.at) ? raw.at : 0
  };
}

/* ------------------------------------------------------------ the calls */

/** Create the group, or join it if the code is already in use. */
export async function createOrJoin(groupId, { name, member }) {
  const result = await request("/group", {
    method: "POST",
    groupId,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: clean(name, LIMITS.groupName), member })
  });
  return {
    created: Boolean(result && result.created),
    name: clean(result && result.name, LIMITS.groupName) || "Our group",
    owner: clean(result && result.owner, 64)
  };
}

/** Does this group exist? A wrong code simply reports that it does not. */
export async function lookup(groupId) {
  const result = await request("/group", { groupId });
  if (!result || !result.exists) return null;
  return {
    name: clean(result.name, LIMITS.groupName) || "Our group",
    owner: clean(result.owner, 64)
  };
}

/** Every shared photo, optionally just one adventure's. Newest first. */
export async function list(groupId, adventureId) {
  const query = adventureId ? `?adventure=${encodeURIComponent(adventureId)}` : "";
  const result = await request(`/list${query}`, { groupId });
  const rows = Array.isArray(result && result.photos) ? result.photos : [];
  // A group is small; a listing far larger than that is not one of ours.
  return rows.slice(0, 5000).map(validPhoto).filter(Boolean);
}

export async function upload(groupId, { adventure, item, member, blob, name, caption }) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new GroupError("refused");
  if (blob.size > LIMITS.photoBytes) throw new GroupError("refused");
  return request(`/photo/${adventure}/${item}/${member}`, {
    method: "PUT",
    groupId,
    body: blob,
    headers: {
      "content-type": "image/jpeg",
      // Headers are latin-1 only, and names may not be.
      "x-wander-name": encodeURIComponent(clean(name, LIMITS.name)),
      "x-wander-caption": encodeURIComponent(clean(caption, LIMITS.caption))
    }
  });
}

export async function download(groupId, { adventure, item, member }) {
  const blob = await request(`/photo/${adventure}/${item}/${member}`, { groupId, accept: "blob" });
  // The server says image/jpeg, but never take that on trust.
  if (!blob || !/^image\//.test(blob.type || "")) throw new GroupError("refused");
  if (blob.size > LIMITS.photoBytes * 2) throw new GroupError("refused");
  return blob;
}

export async function remove(groupId, { adventure, item, member }, asMember) {
  return request(`/photo/${adventure}/${item}/${member}`, {
    method: "DELETE",
    groupId,
    headers: { "x-wander-member": asMember }
  });
}

/** A cheap check that the endpoint is really our worker. */
export async function health() {
  try {
    const response = await fetch(endpoint("/health"), { cache: "no-store" });
    const body = await response.json();
    return Boolean(body && body.service === "wander-group");
  } catch {
    return false;
  }
}
