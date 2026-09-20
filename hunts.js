/*
 * hunts.js — hunts that travel inside a link.
 *
 * A grown-up (or a child making one for their brother) writes a hunt in the
 * builder, and the whole thing is encoded into the URL fragment. There is no
 * server involved: a fragment is never sent to one, so a shared hunt reaches
 * the other phone without touching anybody's machine in between.
 *
 * The wire format is a base64url string of:
 *
 *     [ 1 format byte ][ payload ]
 *
 *     byte 1 → UTF-8 JSON
 *     byte 2 → UTF-8 JSON through deflate-raw
 *
 * Compression roughly halves the link, but it needs CompressionStream, so
 * writing falls back to format 1 where that is missing. Reading always handles
 * both, which means a link written on a new phone still opens on an old one.
 *
 * This is the only module that handles input from outside the app, so every
 * field coming back in is length-capped and type-checked in `validate` before
 * it is allowed anywhere near the screen. Nothing here is ever evaluated, and
 * the app renders all of it as text.
 */

const FORMAT_PLAIN = 1;
const FORMAT_DEFLATE = 2;

/** Hard caps. Anything over these is a mistake or an attack; either way, no. */
export const LIMITS = {
  title: 60,
  place: 60,
  note: 140,
  item: 100,
  minItems: 4,
  maxItems: 20,
  payloadBytes: 8192
};

/** The emoji a hunt may use. A closed set, so nothing odd arrives by link. */
export const EMOJI_CHOICES = [
  "🎈", "🎂", "🏡", "🌳", "🏖️", "🏕️",
  "🌲", "🐛", "🦆", "🎃", "❄️", "🗺️"
];

const MODES = new Set(["photo", "tick"]);
const PALETTES = new Set(["day", "night"]);

/* ------------------------------------------------------------- base64url */

function bytesToBase64url(bytes) {
  let binary = "";
  // Chunked, because a spread of a large array can blow the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function streamThrough(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ------------------------------------------------------------- validation */

const clean = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Turn a decoded object into a hunt we are willing to show, or return null.
 * Deliberately strict: an unexpected shape is dropped rather than repaired,
 * with the single exception of fields that have a sensible default.
 */
export function validate(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = clean(raw.t, LIMITS.title);
  const place = clean(raw.p, LIMITS.place);
  if (!title || !place) return null;

  if (!Array.isArray(raw.x)) return null;
  const items = raw.x
    .map((item) => clean(item, LIMITS.item))
    .filter(Boolean)
    .slice(0, LIMITS.maxItems);
  if (items.length < LIMITS.minItems) return null;

  const id = typeof raw.i === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(raw.i) ? raw.i : null;
  if (!id) return null;

  const mode = MODES.has(raw.m) ? raw.m : "photo";
  return {
    id,
    title,
    place,
    note: clean(raw.n, LIMITS.note),
    emoji: EMOJI_CHOICES.includes(raw.e) ? raw.e : "🗺️",
    mode,
    // A photo hunt is never dark: a night camera hunt is the thing the app
    // set out to avoid.
    palette: mode === "tick" && PALETTES.has(raw.d) ? raw.d : "day",
    items
  };
}

/* --------------------------------------------------------------- encoding */

function toPayload(hunt) {
  const out = { i: hunt.id, t: hunt.title, p: hunt.place, e: hunt.emoji, m: hunt.mode, x: hunt.items };
  if (hunt.note) out.n = hunt.note;
  if (hunt.palette === "night") out.d = "night";
  return out;
}

/** Encode a hunt to the fragment value. Compresses where the browser can. */
export async function encodeHunt(hunt) {
  const json = new TextEncoder().encode(JSON.stringify(toPayload(hunt)));
  let format = FORMAT_PLAIN;
  let body = json;

  if (typeof CompressionStream === "function") {
    try {
      const deflated = await streamThrough(json, new CompressionStream("deflate-raw"));
      if (deflated.length < json.length) {
        format = FORMAT_DEFLATE;
        body = deflated;
      }
    } catch {
      /* fall back to the uncompressed form, which every browser can read */
    }
  }

  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = format;
  bytes.set(body, 1);
  return bytesToBase64url(bytes);
}

/** The full link for a hunt, built from where the app is actually served. */
export async function huntLink(hunt, base = window.location.href) {
  const url = new URL(base);
  url.hash = "";
  url.search = "";
  return `${url.href.replace(/#$/, "")}#hunt=${await encodeHunt(hunt)}`;
}

/* --------------------------------------------------------------- decoding */

/**
 * Decode a fragment value back into a hunt. Resolves null for anything that
 * is not one, which covers truncation, the wrong format, nonsense that happens
 * to be valid base64, and payloads that are simply too big to be genuine.
 */
export async function decodeHunt(fragmentValue) {
  if (typeof fragmentValue !== "string" || !fragmentValue) return null;
  // Cheap guard before any allocation: base64 is 4 chars per 3 bytes.
  if (fragmentValue.length > (LIMITS.payloadBytes * 4) / 3 + 16) return null;

  let bytes;
  try {
    bytes = base64urlToBytes(fragmentValue);
  } catch {
    return null; // not base64 at all
  }
  if (bytes.length < 2 || bytes.length > LIMITS.payloadBytes) return null;

  const format = bytes[0];
  const body = bytes.subarray(1);

  let json;
  try {
    if (format === FORMAT_DEFLATE) {
      if (typeof DecompressionStream !== "function") return null;
      const inflated = await streamThrough(body, new DecompressionStream("deflate-raw"));
      if (inflated.length > LIMITS.payloadBytes) return null;
      json = new TextDecoder().decode(inflated);
    } else if (format === FORMAT_PLAIN) {
      json = new TextDecoder().decode(body);
    } else {
      return null; // a format from some future version we cannot read
    }
  } catch {
    return null; // corrupt compressed data
  }

  try {
    return validate(JSON.parse(json));
  } catch {
    return null; // not JSON
  }
}

/** Read and clear a `#hunt=…` fragment. Returns the raw value, or null. */
export function takeHuntFragment() {
  const match = /[#&]hunt=([A-Za-z0-9_-]+)/.exec(window.location.hash || "");
  return match ? match[1] : null;
}

/* ------------------------------------------------- becoming a real setting */

/**
 * Build the same shape a built-in setting has, so every screen, the shelf, the
 * journal and the daily unlock all work on a custom hunt with no special case.
 * One setting, one adventure, no bonus.
 */
export function settingFromHunt(hunt) {
  return {
    id: `custom-${hunt.id}`,
    title: hunt.title,
    emoji: hunt.emoji,
    place: hunt.place,
    note: hunt.note || "Someone made this hunt for you.",
    interaction: hunt.mode,
    palette: hunt.palette,
    custom: true,
    safety: hunt.palette === "night"
      ? "Take your torch and stay within your exploring area."
      : "Stay where your grown-up says it's safe to explore.",
    adventures: [{
      id: `custom-${hunt.id}-1`,
      title: hunt.title,
      blurb: hunt.note || `${hunt.items.length} things to find.`,
      items: hunt.items.map((title, index) => ({
        id: `c${index}`,
        title,
        ...(hunt.mode === "tick" ? { kind: "see" } : {})
      }))
    }]
  };
}

/** A short, url-safe id for a newly written hunt. */
export function newHuntId() {
  const bytes = new Uint8Array(4);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 7);
}
