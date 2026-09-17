# Wander — Day & Torchlight Hunts

A tiny scavenger-hunt web app for young explorers. Text one link to a child, they
pick who they are, pick an adventure, and go.

There are two deliberately different hunts:

- **☀️ Day Adventure** — a photo hunt. Sixteen discoveries to find and photograph.
- **🔦 Torchlight Adventure** — a night hunt. Sixteen missions to find, hear, notice
  or make, ticked off with one thumb while the other hand holds a torch.

No accounts, no logins, no server, no analytics. Everything a child does stays on
their own device, and after the first load the app works with no signal at all.

---

## The two interaction models

They are built as separate screens, not one screen with a button swapped out.

### Day: photograph it

One discovery fills the screen ("Find a leaf bigger than your hand") above a large
round camera button. Tapping it opens the iPhone camera directly. The moment a
photo comes back it appears as a polaroid card, the discovery is marked found, and
the child can go to the next one, retake, remove the photo, or share it.

Nothing has to be done in order. **All discoveries** opens a grid of cards showing
every challenge, with photo thumbnails for the ones already found. Tapping a card
jumps to it. When all sixteen are found the grid becomes a small **journal**, and
**Share journal** builds a single contact-sheet image of the whole adventure.

### Night: tick it off

A very dark screen, one large mission ("Find a spider web") and one very large
**Found it** button. Tapping it glows, then moves on to the next unfinished
mission on its own, so the phone can go back in a pocket. Swiping the card left or
right moves between missions, and a found mission can be untapped to undo it.

**All missions** is a big-target checklist: tap a row to tick it, tap again to
clear it. When the sixteenth is ticked, a quiet summary appears with a moon, a few
stars and drifting fireflies. There is no photography anywhere in night mode —
photos in the dark are frustrating and the torch is the point.

Each hunt also has one optional **⭐ bonus**, shown last and not counted in the
"of 16".

---

## File structure

```
index.html              every screen's markup, plus the inline SVG icon sprite
styles.css              design tokens and all three themes (home / day / night)
app.js                  router, rendering, hunt logic, dialogs, service-worker registration
discoveries.js          the content of both hunts — edit here to change the challenges
storage.js              localStorage state and the IndexedDB photo store
photos.js               capture → resize → JPEG, object URLs, sharing, contact sheet
effects.js              night-sky completion effect and the optional chime
sw.js                   service worker: precache the app shell, serve it offline
manifest.webmanifest    PWA manifest
icons/                  app icons (PNG) and the SVG sources they were rendered from
```

No build step, no dependencies, no framework. Plain ES modules loaded straight by
the browser. Open any file and it is the file that runs.

To change the challenges, edit `discoveries.js`. Titles can be reworded freely;
keep each item's `id` stable, because saved progress and photos are keyed by it.

---

## Where the photos go

Day-hunt photos never leave the phone.

Each capture is decoded, scaled so its longest side is at most **1400 px**, and
re-encoded as JPEG at quality 0.82 before it is stored — a 12 MP camera file
becomes a few hundred kilobytes. The resized blob goes into **IndexedDB**
(database `wander-photos`, keyed by discovery id). Nothing is uploaded, and there
is no backend to upload it to.

**Save / Share** hands the image to the phone's own share sheet
(`navigator.share`), so a child can save it to Photos or send it to a grown-up
themselves. Where the share sheet is unavailable, the photo opens full-screen with
a "press and hold to save" hint instead.

If IndexedDB is unavailable (private browsing, a very old browser, no space left),
the app says so gently and keeps working for the current session.

---

## What is remembered

Stored in `localStorage` under the key `wander.v1`:

- the chosen player name
- which hunt was last opened
- which discoveries and missions are found, and when
- the challenge each hunt is currently showing
- whether each hunt is finished
- the sound setting

Close Safari, come back tomorrow, and the home screen offers
"Continue · 9 of 16 found" for each hunt that is underway. Photos come back from
IndexedDB with it.

**Resetting.** Settings inside a hunt offers "Start again". It asks for a
press-and-hold rather than a tap, so it cannot happen by accident. Resetting the
Day Adventure also deletes that hunt's photos from the device; resetting the
Torchlight Adventure just clears the ticks.

---

## Offline and installing

`sw.js` precaches the whole app shell on install and serves it cache-first, with
navigations falling back to the cached page. After one successful load the app
opens and runs with the network switched off — the hunts make no network requests
of their own at any point.

When a new version is deployed, the app shows a small "Update ready — tap to
refresh" pill rather than changing under the child's feet.

To change the app and have devices pick it up, edit the files and bump `CACHE` in
`sw.js` (for example `wander-v1` → `wander-v2`).

### Add to Home Screen on iPhone

1. Open the link in **Safari** (this only works in Safari, not Chrome on iOS).
2. Tap the **Share** button, the square with an arrow.
3. Scroll down and tap **Add to Home Screen**, then **Add**.

It then opens full-screen with no browser chrome, keeps its own storage, and works
offline. The layout respects the Dynamic Island and the home indicator.

---

## Deploying to GitHub Pages

The app is all static files, so Pages needs no build.

1. Create a repository (for example `wander-hunt`) and push these files to `main`.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then branch
   `main` and folder `/ (root)`. Save.
4. After a minute the site is live at
   `https://<your-username>.github.io/wander-hunt/` — that is the URL to text.

Every path in the app is relative, so it works from a subfolder like this without
any configuration. `.nojekyll` is included so GitHub serves every file as-is.

Pages is served over HTTPS, which service workers and the camera both require.

---

## Privacy

> Your hunt and photos stay on this device.

No accounts, no passwords, no email addresses, no cloud services, no analytics, no
third-party code, no fonts or scripts loaded from anywhere. The only way a photo
leaves the phone is if a child deliberately uses Save / Share.

---

## Accessibility and device notes

- Designed for a ~390 px iPhone in portrait, and scales up to tablets.
- Safe-area insets for the Dynamic Island, notch and home indicator.
- Touch targets are at least 48 px, and the night mode's main button is 80 px tall.
- The night theme is genuinely dark, with no white flashes, for outdoor reading.
- Honours `prefers-reduced-motion`; all animation stops.
- Works with VoiceOver: real buttons, labels, and `aria-pressed` on the checklist.
