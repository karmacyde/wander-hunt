/*
 * config.js — the one thing you have to fill in yourself.
 *
 * Wander works completely without this. Photo groups are the only feature that
 * needs somewhere online to put photographs, and while GROUP_ENDPOINT is empty
 * that feature does not exist in the app: no screens, no settings, nothing.
 *
 * To turn it on, deploy the worker in /worker (it runs on Cloudflare's free
 * plan — no card, and it doesn't sleep):
 *
 *   cd worker
 *   npx wrangler login
 *   npx wrangler kv namespace create PHOTOS    # put the id in wrangler.toml
 *   npx wrangler deploy
 *
 * Then paste the https://…workers.dev address it prints in below, with no
 * trailing slash, and commit.
 */

export const GROUP_ENDPOINT = "https://wander-group.karmacyde.workers.dev";

/**
 * Photo groups only appear once an endpoint is configured.
 *
 * HTTPS is required, because the invite code travels as a bearer token and a
 * photograph of somebody's child is not going over plain HTTP. The one
 * exception is a loopback address, which never leaves the machine and is how
 * the worker is tested locally.
 */
export const groupsEnabled = () => {
  const url = GROUP_ENDPOINT.trim();
  if (!url) return false;
  return /^https:\/\/[^\s]+$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
};
