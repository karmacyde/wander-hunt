/*
 * worker.js — the only server Wander has.
 *
 * It holds photographs that children have chosen to share with their group,
 * and nothing else. There are no accounts, no passwords and no user records.
 *
 * The whole access model is one secret: the group's invite code. The code
 * itself never reaches here — the app sends SHA-256(code), and every key is
 * built from that hash. So this store contains no codes: dumping it would give
 * an attacker the photos it already had, but no way to walk back into a group
 * or to recognise a code if they saw one.
 *
 * The hash arrives in an Authorization header rather than the path, to keep it
 * out of request logs and Referer headers.
 *
 * Deploy:  npx wrangler login && npx wrangler deploy
 * Free plan: 100k requests/day, 1 GB stored, 1k writes/day. No card needed.
 */

const MAX_PHOTO_BYTES = 300 * 1024; // a 720px q0.72 JPEG is ~90 KB
const MAX_PHOTOS_PER_GROUP = 4000;
const MAX_NAME = 20;
const MAX_CAPTION = 80;

/* Ids are our own slugs. Anything else is a malformed request, not something
   to be clever about. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_HASH = /^[a-f0-9]{64}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors() }
  });

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-wander-name,x-wander-caption,x-wander-member",
    "access-control-max-age": "86400"
  };
}

/** The group hash from the Authorization header, or null. */
function groupOf(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header.trim());
  return match ? match[1] : null;
}

/** Header values are attacker-controlled: clamp them and drop control chars. */
function headerText(request, name, max) {
  const raw = request.headers.get(name);
  if (!raw) return "";
  let text;
  try {
    text = decodeURIComponent(raw);
  } catch {
    text = raw;
  }
  return text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "health") return json({ ok: true, service: "wander-group" });

    const group = groupOf(request);
    if (!group || !SAFE_HASH.test(group)) {
      // Deliberately the same answer whether or not the group exists.
      return json({ error: "unauthorised" }, 401);
    }

    try {
      switch (`${request.method} /${parts[0] || ""}`) {
        case "POST /group": return await createGroup(request, env, group);
        case "GET /group": return await groupInfo(request, env, group);
        case "GET /list": return await listPhotos(request, env, group, url);
        case "PUT /photo": return await putPhoto(request, env, group, parts);
        case "GET /photo": return await getPhoto(request, env, group, parts);
        case "DELETE /photo": return await deletePhoto(request, env, group, parts);
        default: return json({ error: "not found" }, 404);
      }
    } catch (err) {
      // Never leak internals to the client; the child just sees "try again".
      console.error(err && err.stack ? err.stack : String(err));
      return json({ error: "server" }, 500);
    }
  }
};

/* ------------------------------------------------------------- groups */

const metaKey = (group) => `g:${group}:meta`;
const photoPrefix = (group) => `g:${group}:p:`;
const photoKey = (group, id) => `${photoPrefix(group)}${id}`;

/**
 * Create a group, or confirm one exists. The first caller becomes the owner;
 * anyone arriving later with the same code simply joins it.
 */
async function createGroup(request, env, group) {
  const existing = await env.PHOTOS.get(metaKey(group), "json");
  if (existing) return json({ ok: true, created: false, name: existing.name, owner: existing.owner });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const name = String(body.name || "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 40) || "Our group";
  const owner = SAFE_ID.test(String(body.member || "")) ? String(body.member) : null;
  if (!owner) return json({ error: "bad request" }, 400);

  await env.PHOTOS.put(metaKey(group), JSON.stringify({ name, owner, at: Date.now() }));
  return json({ ok: true, created: true, name, owner });
}

/** Does this group exist, and who owns it. An unknown code simply looks empty. */
async function groupInfo(request, env, group) {
  const meta = await env.PHOTOS.get(metaKey(group), "json");
  if (!meta) return json({ exists: false });
  return json({ exists: true, name: meta.name, owner: meta.owner });
}

/* ------------------------------------------------------------- photos */

/**
 * List what the group holds, newest first. Names and captions ride in KV's
 * per-key metadata, so a listing needs no value reads at all — which is what
 * keeps a busy strip inside the free request budget.
 */
async function listPhotos(request, env, group, url) {
  const adventure = url.searchParams.get("adventure") || "";
  if (adventure && !SAFE_ID.test(adventure)) return json({ error: "bad request" }, 400);

  const prefix = adventure ? `${photoPrefix(group)}${adventure}:` : photoPrefix(group);
  const photos = [];
  let cursor;
  // KV lists in pages; a group is small, but never loop unbounded.
  for (let page = 0; page < 20; page += 1) {
    const result = await env.PHOTOS.list({ prefix, limit: 1000, cursor });
    for (const key of result.keys) {
      const m = key.metadata || {};
      photos.push({
        id: key.name.slice(photoPrefix(group).length),
        adventure: m.a || "",
        item: m.i || "",
        member: m.m || "",
        name: m.n || "",
        caption: m.c || "",
        at: m.t || 0
      });
    }
    if (result.list_complete) break;
    cursor = result.cursor;
  }
  photos.sort((a, b) => b.at - a.at);
  return json({ photos, count: photos.length });
}

/** PUT /photo/<adventureId>/<itemId>/<memberId> with JPEG bytes as the body. */
async function putPhoto(request, env, group, parts) {
  const [, adventure, item, member] = parts;
  if (!SAFE_ID.test(adventure || "") || !SAFE_ID.test(item || "") || !SAFE_ID.test(member || "")) {
    return json({ error: "bad request" }, 400);
  }
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "image/jpeg") {
    return json({ error: "jpeg only" }, 415);
  }

  const meta = await env.PHOTOS.get(metaKey(group), "json");
  if (!meta) return json({ error: "no such group" }, 404);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return json({ error: "empty" }, 400);
  if (bytes.length > MAX_PHOTO_BYTES) return json({ error: "too big" }, 413);
  // Must actually be a JPEG, not merely labelled one.
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    return json({ error: "not a jpeg" }, 415);
  }

  const id = `${adventure}:${item}:${member}`;
  const existing = await env.PHOTOS.getWithMetadata(photoKey(group, id));
  if (existing.value === null) {
    // Keep a group inside the free tier rather than letting it fill silently.
    if ((await countPhotos(env, group)) >= MAX_PHOTOS_PER_GROUP) {
      return json({ error: "group full" }, 507);
    }
  }

  await env.PHOTOS.put(photoKey(group, id), bytes, {
    metadata: {
      a: adventure,
      i: item,
      m: member,
      n: headerText(request, "x-wander-name", MAX_NAME),
      c: headerText(request, "x-wander-caption", MAX_CAPTION),
      t: Date.now()
    }
  });
  return json({ ok: true, id });
}

async function countPhotos(env, group) {
  let total = 0;
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await env.PHOTOS.list({ prefix: photoPrefix(group), limit: 1000, cursor });
    total += result.keys.length;
    if (result.list_complete) break;
    cursor = result.cursor;
  }
  return total;
}

/** GET /photo/<adventureId>/<itemId>/<memberId> → the JPEG. */
async function getPhoto(request, env, group, parts) {
  const [, adventure, item, member] = parts;
  if (!SAFE_ID.test(adventure || "") || !SAFE_ID.test(item || "") || !SAFE_ID.test(member || "")) {
    return json({ error: "bad request" }, 400);
  }
  const bytes = await env.PHOTOS.get(photoKey(group, `${adventure}:${item}:${member}`), "arrayBuffer");
  if (!bytes) return json({ error: "not found" }, 404);
  return new Response(bytes, {
    headers: {
      "content-type": "image/jpeg",
      // Private: this is somebody's child. Never let a shared cache hold it.
      "cache-control": "private, max-age=3600",
      ...cors()
    }
  });
}

/**
 * DELETE /photo/<adventureId>/<itemId>/<memberId>
 * Your own always; anything, if you made the group.
 */
async function deletePhoto(request, env, group, parts) {
  const [, adventure, item, member] = parts;
  if (!SAFE_ID.test(adventure || "") || !SAFE_ID.test(item || "") || !SAFE_ID.test(member || "")) {
    return json({ error: "bad request" }, 400);
  }
  const asMember = request.headers.get("x-wander-member") || "";
  if (!SAFE_ID.test(asMember)) return json({ error: "bad request" }, 400);

  const id = `${adventure}:${item}:${member}`;
  const stored = await env.PHOTOS.getWithMetadata(photoKey(group, id));
  if (stored.value === null) return json({ ok: true, deleted: false });

  const meta = await env.PHOTOS.get(metaKey(group), "json");
  const owns = (stored.metadata && stored.metadata.m) === asMember;
  const isGroupOwner = Boolean(meta && meta.owner === asMember);
  if (!owns && !isGroupOwner) return json({ error: "not yours" }, 403);

  await env.PHOTOS.delete(photoKey(group, id));
  return json({ ok: true, deleted: true });
}
