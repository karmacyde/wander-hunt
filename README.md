# Wander — scavenger hunts for young explorers

A tiny scavenger-hunt web app for children. Text one link, they pick who they
are, pick where they're exploring, and go.

No accounts, no logins, no server, no analytics. Everything a child does stays
on their own device, and after the first load the app works with no signal.

---

## How it's shaped

Two levels, and this is the whole idea.

**Settings** are *where you are*. There are six, and they are always free to
choose — if you're at the beach today, you pick Rock Pools.

| Setting | What it is | How you play | Look |
|---|---|---|---|
| ☀️ Out and About | A walk from your front door | Photograph it | Warm paper |
| 🔦 Torchlight | Outside after dark | Tick it off | Dark, torchlit |
| 🌊 Rock Pools | Down at the beach | Photograph it | Warm paper |
| 🌧️ A Rainy Day | Out in the wet | Photograph it | Warm paper |
| 🍂 Autumn | Among the falling leaves | Photograph it | Warm paper |
| 🚗 On a Journey | In the car | Tick it off | Warm paper |

**Adventures** are one expedition within a setting: sixteen challenges plus an
optional ⭐ bonus. Each carries its own name and a line about the place, like
"Low Tide — low tide is best, watch for slippery rocks".

**The pacing.** Inside a setting the adventures run in order, and **the next one
opens the day after you finish the one before**. Finish Low Tide on Monday and
The Tide Line waits until Tuesday. Nothing unlocks it early. That makes a
holiday last, and gives them a reason to come back tomorrow.

Fourteen adventures ship with the app, about 240 challenges in all. Settings
never lock each other, so a rainy week never shuts the beach, and the day and
night hunts pace independently.

---

## The two ways to play

They are built as separate screens, not one screen with a button swapped out.
Which one a setting uses is a property of the setting, and so is its colour
scheme — that is what lets a daytime car journey be a tick-list without a black
screen.

### Photograph it

One discovery fills the screen above a large round camera button, which opens
the iPhone camera directly. The moment a photo comes back it appears as a
polaroid, the discovery is marked found, and they can add a short note about
what it was. Then: next, retake, remove, or share.

Nothing has to be done in order. **All discoveries** is a grid of every
challenge with thumbnails of the ones already found; tap one to jump to it. When
all sixteen are found the grid becomes a **journal**, which can be shared as a
single contact-sheet image or printed.

### Tick it off

A single large mission and one very large **Found it** button. Tapping it glows,
then moves to the next unfinished mission on its own, so the phone can go back
in a pocket. Swiping the card moves between missions and tapping a found one
undoes it. **All missions** is a big-target checklist: tap a row to tick it, tap
again to clear it.

There is no photography here at all. In the dark, photos are frustrating and the
torch is the point; in a car, there is nothing to collect.

---

## Keeping things

**The shelf.** Finishing an adventure keeps it. "My adventures" on the home
screen lists every finished one, newest first, with its date and a cover photo.
Tapping one reopens its journal. The home screen also keeps a running count of
everything they have ever found.

**Printing.** A finished photo journal has a **Print or save as PDF** button.
It builds a clean sheet — photos three to a row with their notes, and the
adventure name, place and date as a header — and hands it to the system print
dialogue, which on an iPhone is also how you save a PDF.

**Resetting.** Settings inside an adventure offers "Start again". It asks for a
press-and-hold rather than a tap, so it cannot happen by accident, and it only
ever affects that one adventure. The rest of the shelf is never touched.

---

## Making your own hunt

**Settings → Make your own hunt.** Write a name, where it happens, an optional
note, pick an icon, choose whether it is photographed or ticked off, and list
between 4 and 20 things to find. Then **Get the link**.

The whole hunt travels inside the link. There is no upload and no account:

```
https://…/wander-hunt/#hunt=AmVPu0oEQRD8laaSSwYRuWgyDcTcTDHo…
```

Everything after the `#` is the hunt itself, compressed and encoded. A fragment
is never sent to a web server, so the hunt goes from your phone to theirs and
nowhere else. A sixteen-item hunt makes a link of about 500 characters, which
texts perfectly well.

Whoever opens it gets a "Someone has sent you a hunt" welcome, and from then on
it sits on their home screen beside the built-in ones and behaves exactly like
them: progress, photos, notes, the journal, printing and the shelf all work the
same way. It also works offline once the app itself has loaded once.

A hunt made this way can be removed again from its own settings, behind a
press-and-hold. The link is a snapshot, so editing your copy will not change one
you have already sent — write a new one instead.

The writing screen keeps a draft as you type, so a locked phone loses nothing.

---

## Sharing photos with a group

**Off by default, and genuinely absent unless you turn it on.** Wander ships
with no group service configured, and while that is the case there is no group
screen, no settings row and nothing on any hunt. Everything below is optional.

### What it does

Everyone doing the same hunt joins a group with an invite code. Once a child has
photographed a discovery themselves, a strip appears under their own photo
showing what everybody else found for the very same challenge.

```
FIND SOMETHING YELLOW
  [ your photo ]   Yours
WHAT OTHERS FOUND
  [Ziggy]  [Mabel]  [Sam]
```

Nothing appears until they have found that thing themselves, so it stays a
reward for looking rather than a shortcut past it. **Share with your group** on
a finished journal sends that adventure's photos in one go.

### Turning it on

The service runs on Cloudflare's free plan: 100,000 requests a day, a gigabyte
of storage, no payment method, and it does not go to sleep. It is one file in
`worker/` that you own and can read.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create PHOTOS   # put the printed id in wrangler.toml
npx wrangler deploy
```

Paste the `https://…workers.dev` address it prints into `GROUP_ENDPOINT` in
`config.js`, commit, and the feature appears.

Photos are re-encoded to 720px at about 90KB before being sent, separate from
the full-size original kept on the phone. That is roughly 11,000 photos inside
the free gigabyte, which a family will not reach.

### The code is the key

A group is protected by one eight-character code such as `XK4P-9TQM`. Anyone
holding it can see every photo in the group and add their own, so it is worth
treating like a key to the house.

**The code never reaches the server.** The app sends `SHA-256(code)` and every
stored key is built from that hash, so the store contains no codes at all. If it
were emptied out in front of you it would give up the photographs it held and
nothing else. There are 2^40 possible codes and the worker answers at most
100,000 requests a day, so guessing is not a route in.

### What is and is not shared

- **Only what a child deliberately shares.** Nothing is uploaded in the
  background, and a hunt that is never shared never leaves the phone.
- **Not where they were.** Every photo is rebuilt through a canvas before it is
  sent, which removes all EXIF: no GPS, no camera, no timestamp. Verified by
  putting a GPS-carrying JPEG through the pipeline and checking the bytes.
- **First names only**, which is all Wander has ever asked for.
- **Removable.** Any child can take their own photos back off; whoever made the
  group can remove anything. Removing deletes the bytes, not just a reference,
  and leaves the copy on their own phone untouched.
- **Leaving takes it with you.** Everyone else's photos come off the device.

Out of signal, sharing queues and goes when a connection returns. If the service
is down or never deployed, every other part of Wander carries on exactly as
before.

**A grown-up should be the one setting this up**, which is why it sits in
Settings rather than anywhere a child lands by accident.

---

## Where the photos go

Photos never leave the phone.

Each capture is decoded, scaled so its longest side is at most **1400 px**, and
re-encoded as JPEG at quality 0.82 before it is stored — a 12 MP camera file
becomes a few hundred kilobytes. The result goes into **IndexedDB**, keyed
`<adventureId>::<itemId>` so a challenge that appears in two adventures keeps
two separate photographs. Nothing is uploaded, and there is no backend to
upload it to.

**Save / Share** hands the image to the phone's own share sheet, so a child can
save it to Photos or send it to a grown-up themselves. Where that is
unavailable, the photo opens full-screen with a "press and hold to save" hint.

If IndexedDB is unavailable — private browsing, no space left — the app says so
gently and keeps working for the session.

---

## What is remembered

Stored in `localStorage` under `wander.v2`:

- the chosen explorer's name
- which setting they were last in
- for every adventure: which challenges are found, any notes, which one is
  showing, when it was started and finished
- the furthest date the app has seen, which is what stops the daily unlock being
  bypassed by winding the clock back
- the sound setting

Close Safari, come back tomorrow, and each setting offers "Continue · 9 of 16".
Photos come back from IndexedDB with it.

An install from the first version of Wander is migrated automatically on first
load: its day and night hunts become the first adventure of Out and About and
Torchlight, and its photos are re-keyed. Each photo is written to its new key
before the old one is removed, so an interruption can only duplicate, never
lose.

---

## Offline and installing

`sw.js` precaches the whole app shell on install and serves it cache-first, with
navigations falling back to the cached page. After one successful load the app
opens and runs with the network switched off — the hunts make no network
requests of their own at any point.

When a new version is deployed the app shows a small "Update ready — tap to
refresh" pill rather than changing under the child's feet.

To change the app and have devices pick it up, edit the files and bump `CACHE`
in `sw.js` (`wander-v5` → `wander-v6`).

### Add to Home Screen on iPhone

1. Open the link in **Safari** — this only works in Safari, not Chrome on iOS.
2. Tap the **Share** button, the square with an arrow.
3. Scroll down, tap **Add to Home Screen**, then **Add**.

It then opens full-screen with no browser chrome, keeps its own storage, and
works offline. The layout respects the Dynamic Island and the home indicator.

---

## File structure

```
index.html              every screen's markup, plus the inline SVG icon sprite
styles.css              design tokens, the three palettes, print styles
app.js                  router, rendering, the unlock rule, dialogs, boot
adventures.js           all the content — settings and their adventures
hunts.js                hunts shared by link: encoding, decoding and validation
group.js                talking to a photo group, and the offline upload queue
config.js               the group service address — empty means the feature is off
worker/worker.js        the optional group service (Cloudflare Workers + KV)
storage.js              localStorage state, the IndexedDB photo store, migration
photos.js               capture → resize → JPEG, object URLs, sharing, contact sheet
effects.js              the night-sky completion effect and the optional chime
sw.js                   service worker: precache the shell, serve it offline
manifest.webmanifest    PWA manifest
icons/                  app icons, and the SVG sources they were rendered from
```

No build step, no dependencies, no framework. Plain ES modules loaded straight
by the browser. Open any file and it is the file that runs.

**To change the challenges, edit `adventures.js`.** Reword any title freely;
keep the ids, because saved progress and photos are keyed by them. Adding an
adventure to a setting is a matter of appending to its `adventures` array — the
unlock rule and the shelf pick it up on their own.

---

## Deploying to GitHub Pages

All static files, so Pages needs no build.

1. Push to `main`.
2. **Settings → Pages**, then **Deploy from a branch**, branch `main`, folder
   `/ (root)`. Save.
3. After a minute the site is live at
   `https://<your-username>.github.io/wander-hunt/`.

Every path is relative, so it works from a subfolder without configuration.
`.nojekyll` makes GitHub serve every file as-is. Pages is served over HTTPS,
which service workers and the camera both require.

---

## Privacy

> Your hunt and photos stay on this device.

No accounts, no passwords, no email addresses, no analytics, no third-party
code, no fonts or scripts loaded from anywhere.

Out of the box a photo leaves the phone only when a child deliberately uses
Save / Share. If you set up a photo group, photographs they choose to share also
go to the service you deployed and nowhere else — see the section above for
exactly what that means. Until then, and if you never set one up, the line in
the app is literally true: the hunt and its photos stay on the device.

A hunt shared by link is no exception. It rides in the URL fragment, which
browsers never send to a server, so sharing one is between the two phones and
whatever messaging app carries it. A hunt arriving from a link is treated as
untrusted text: every field is length-checked and rendered as text, never as
markup.

---

## Accessibility and device notes

- Designed for a ~390 px iPhone in portrait, and scales up to tablets.
- Safe-area insets for the Dynamic Island, notch and home indicator.
- Touch targets are at least 44 px, and the tick-list's main button is 80 px.
- The torchlight palette is genuinely dark, with no white flashes, for reading
  outside at night.
- Honours `prefers-reduced-motion`; all animation stops.
- Works with VoiceOver: real buttons, labels, and `aria-pressed` on checklists.
