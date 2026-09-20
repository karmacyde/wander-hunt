/*
 * adventures.js — all the content in the app.
 *
 * The shape is two levels deep:
 *
 *   SETTING    where you are: Out and About, Rock Pools, Torchlight…
 *              Always freely chosen. Nothing is ever locked.
 *
 *   ADVENTURE  one expedition within a setting: sixteen challenges plus a
 *              bonus. Inside a setting these run in order, and the next one
 *              opens the day after you finish the one before.
 *
 * Two properties decide how a setting behaves, and they are deliberately
 * independent of each other:
 *
 *   interaction  "photo" → find it and photograph it
 *                "tick"  → find it and tick it off, no camera
 *   palette      "day"   → warm paper
 *                "night" → dark, for torchlight
 *
 * Keeping them separate is what lets a car journey be a tick-list in
 * daylight, and it is why the night hunt is not the only tick-list.
 *
 * Editing this file is the way to change the game. Reword any title freely,
 * but keep the ids: saved progress and photos are keyed by them.
 */

/** Short labels for the eyebrow on a tick-list mission. */
export const KIND_LABELS = {
  see: "Look",
  hear: "Listen",
  notice: "Notice",
  make: "Make"
};

const SAFETY_OUTDOORS = "Stay where your grown-up says it's safe to explore.";
const SAFETY_NIGHT = "Take your torch and stay within your exploring area.";
const SAFETY_BEACH = "Stay where your grown-up says it's safe. Rocks get slippery.";
const SAFETY_CAR = "Stay in your seatbelt. This one is all out of the window.";

export const SETTINGS = {
  /* ============================================================ OUT AND ABOUT */
  "out-and-about": {
    id: "out-and-about",
    title: "Out and About",
    emoji: "☀️",
    place: "A walk from your front door",
    note: "Anywhere will do. A park, a lane, the end of the garden.",
    interaction: "photo",
    palette: "day",
    safety: SAFETY_OUTDOORS,
    adventures: [
      {
        id: "out-and-about-1",
        title: "First Footsteps",
        blurb: "The first expedition. Sixteen things to find and photograph.",
        items: [
          { id: "yellow", title: "Find something yellow", hint: "A flower, a leaf, a bit of lichen…" },
          { id: "big-leaf", title: "Find a leaf bigger than your hand", hint: "Hold your hand next to it in the photo." },
          { id: "tiny-flower", title: "Find a tiny flower", hint: "Get in close." },
          { id: "rough", title: "Find something rough", hint: "Bark, stone, a pine cone…" },
          { id: "smooth", title: "Find something smooth" },
          { id: "feather", title: "Find a feather" },
          { id: "circle", title: "Find something shaped like a circle" },
          { id: "y-stick", title: "Find a stick shaped like the letter Y" },
          { id: "bird-food", title: "Find something a bird might eat", hint: "Seeds, berries, a wriggly worm…" },
          { id: "insect", title: "Find an insect", hint: "Check under leaves and on flowers. Be gentle." },
          { id: "colour-rock", title: "Find a rock with more than one colour" },
          { id: "animal-made", title: "Find something made by an animal", hint: "A nest, a web, a hole, a footprint…" },
          { id: "beautiful", title: "Find something beautiful" },
          { id: "three-leaves", title: "Find three different kinds of leaves", hint: "Line them up so all three fit in one photo." },
          { id: "fingernail", title: "Find something smaller than your fingernail" },
          { id: "never-noticed", title: "Find something you've never noticed before" }
        ],
        bonus: { id: "bonus-nobody", title: "Find something nobody else has noticed", hint: "Your secret discovery." }
      },
      {
        id: "out-and-about-2",
        title: "Colours and Textures",
        blurb: "This time it's about how things look and feel.",
        items: [
          { id: "red", title: "Find something red" },
          { id: "soft", title: "Find something soft" },
          { id: "bumpy", title: "Find something bumpy" },
          { id: "two-greens", title: "Find two leaves that aren't the same green", hint: "Both in one photo." },
          { id: "nibbled", title: "Find something that has been nibbled" },
          { id: "crack-growing", title: "Find a crack with something growing in it" },
          { id: "older", title: "Find something older than you" },
          { id: "smallest-stone", title: "Find the smallest stone you can pick up" },
          { id: "smells-good", title: "Find something that smells lovely" },
          { id: "spiral", title: "Find a spiral" },
          { id: "striped", title: "Find something striped" },
          { id: "odd-shadow", title: "Find a shadow shaped like something else" },
          { id: "moss", title: "Find moss", hint: "Try a wall, a roof, or the shady side of a tree." },
          { id: "shiny-dry", title: "Find something shiny that isn't wet" },
          { id: "tiny-home", title: "Find a place a tiny creature could live" },
          { id: "favourite", title: "Find your favourite thing on this walk" }
        ],
        bonus: { id: "bonus-no-name", title: "Find a colour you can't name", hint: "What would you call it?" }
      },
      {
        id: "out-and-about-3",
        title: "Small World",
        blurb: "Everything on this list is tiny. Get as close as you can.",
        items: [
          { id: "as-close", title: "Get as close as your camera will let you" },
          { id: "many-legs", title: "Find something with more than six legs" },
          { id: "seed", title: "Find a seed" },
          { id: "hole-through", title: "Find something with a hole right through it" },
          { id: "eaten-pattern", title: "Find a leaf with a pattern eaten into it" },
          { id: "pea-sized", title: "Find a creature smaller than a pea" },
          { id: "lichen", title: "Find lichen", hint: "The crusty grey-green stuff on walls and branches." },
          { id: "wrong-place", title: "Find something growing where it shouldn't" },
          { id: "small-feather", title: "Find a feather smaller than your thumb" },
          { id: "empty-web", title: "Find a web with nobody home" },
          { id: "snail-trail", title: "Find a snail, or a snail's trail" },
          { id: "fluffy-flies", title: "Find something fluffy that flies", hint: "Dandelion seeds count." },
          { id: "underneath", title: "Find the underneath of a leaf" },
          { id: "shell-bone", title: "Find a tiny piece of shell or bone" },
          { id: "symmetrical", title: "Find something perfectly symmetrical" },
          { id: "magnifying", title: "Find something you'd want a magnifying glass for" }
        ],
        bonus: { id: "bonus-whole-world", title: "Fit a whole little world into one photograph" }
      }
    ]
  },

  /* ================================================================ TORCHLIGHT */
  torchlight: {
    id: "torchlight",
    title: "Torchlight",
    emoji: "🔦",
    place: "Outside after dark",
    note: "Grab a torch. Nothing to photograph — just find it and tick it off.",
    interaction: "tick",
    palette: "night",
    safety: SAFETY_NIGHT,
    adventures: [
      {
        id: "torchlight-1",
        title: "Into the Dark",
        blurb: "Your first night expedition.",
        items: [
          { id: "sparkle", kind: "see", title: "Find something sparkling in your torchlight" },
          { id: "strange-shadow", kind: "see", title: "Find a strange shadow" },
          { id: "moving", kind: "see", title: "Spot something moving in the dark" },
          { id: "web", kind: "see", title: "Find a spider web" },
          { id: "different", kind: "notice", title: "Find something that looks different at night" },
          { id: "dew", kind: "see", title: "Find dew or water on a leaf" },
          { id: "sound", kind: "hear", title: "Hear a night-time sound" },
          { id: "light-insect", kind: "see", title: "Find an insect drawn to a light" },
          { id: "white", kind: "see", title: "Find something white" },
          { id: "creepy", kind: "notice", title: "Find something that looks a bit creepy" },
          { id: "sky-light", kind: "see", title: "Find a light in the sky" },
          { id: "moon", kind: "see", title: "Find the Moon" },
          { id: "three-shadows", kind: "see", title: "Find three different shadows" },
          { id: "hiding", kind: "see", title: "Spot something hiding in a tree" },
          { id: "daytime-missed", kind: "notice", title: "Find something you didn't notice in the daytime" },
          { id: "giant-shadow", kind: "make", title: "Make a giant shadow with your torch" }
        ],
        bonus: { id: "bonus-still", kind: "hear", title: "Stand completely still for 30 seconds. What can you hear?" }
      },
      {
        id: "torchlight-2",
        title: "Shadows and Sounds",
        blurb: "Tonight is about what you can make, and what you can hear.",
        items: [
          { id: "puppet", kind: "make", title: "Make a shadow puppet on a wall" },
          { id: "longest-shadow", kind: "see", title: "Find the longest shadow you can" },
          { id: "unseen", kind: "hear", title: "Hear something you can't see" },
          { id: "stops", kind: "hear", title: "Find a sound that stops when you stand still" },
          { id: "up-a-tree", kind: "see", title: "Shine your torch up into a tree" },
          { id: "two-eyes", kind: "see", title: "Find two eyes shining back at you" },
          { id: "cold-hands", kind: "notice", title: "Notice how cold your hands have got" },
          { id: "rustles", kind: "hear", title: "Find something that rustles" },
          { id: "door-tall", kind: "make", title: "Make your shadow taller than a door" },
          { id: "fuzzy-edge", kind: "notice", title: "Find a shadow with a fuzzy edge" },
          { id: "torch-off", kind: "notice", title: "Switch your torch off and count to ten" },
          { id: "quietest", kind: "notice", title: "Find the quietest place you can stand" },
          { id: "awake-bird", kind: "hear", title: "Hear a bird that ought to be asleep" },
          { id: "shadow-in-shadow", kind: "see", title: "Find a shadow inside another shadow" },
          { id: "ring-of-light", kind: "make", title: "Make a perfect ring of light on the ground" },
          { id: "friendly", kind: "notice", title: "Find something that looks friendly at night" }
        ],
        bonus: { id: "bonus-dark-eyes", kind: "notice", title: "Turn your torch off and wait a whole minute. What can you see now?" }
      },
      {
        id: "torchlight-3",
        title: "The Night Sky",
        blurb: "Torch down, heads up. This one is all above you.",
        items: [
          { id: "the-moon", kind: "see", title: "Find the Moon" },
          { id: "brightest", kind: "see", title: "Find the brightest star" },
          { id: "three-row", kind: "see", title: "Find three stars in a row" },
          { id: "not-white", kind: "notice", title: "Find a star that isn't quite white" },
          { id: "crossing", kind: "see", title: "Watch for something crossing the sky" },
          { id: "lit-cloud", kind: "see", title: "Find a cloud lit from behind" },
          { id: "plane", kind: "see", title: "Find a plane" },
          { id: "darkest-way", kind: "notice", title: "Work out which way the sky is darkest" },
          { id: "through-branches", kind: "see", title: "Find a star through a gap in the branches" },
          { id: "hand-frame", kind: "make", title: "Make a frame with your hands and count the stars inside" },
          { id: "moon-shape", kind: "notice", title: "Notice the Moon's shape tonight" },
          { id: "eyes-closed", kind: "hear", title: "Close your eyes and listen for ten seconds" },
          { id: "horizon-light", kind: "see", title: "Find a light on the horizon" },
          { id: "twinkliest", kind: "notice", title: "Find the star that twinkles most" },
          { id: "biggest-sky", kind: "notice", title: "Find where the sky looks biggest" },
          { id: "own-constellation", kind: "make", title: "Join some stars up and name your own constellation" }
        ],
        bonus: { id: "bonus-sky-moved", kind: "notice", title: "Come back an hour later. Has the sky moved?" }
      }
    ]
  },

  /* ================================================================ ROCK POOLS */
  "rock-pools": {
    id: "rock-pools",
    title: "Rock Pools",
    emoji: "🌊",
    place: "Down at the beach",
    note: "Low tide is best. Look, don't take — put everything back where it was.",
    interaction: "photo",
    palette: "day",
    safety: SAFETY_BEACH,
    adventures: [
      {
        id: "rock-pools-1",
        title: "Low Tide",
        blurb: "The sea has gone out and left you sixteen things to find.",
        items: [
          { id: "spiral-shell", title: "Find a shell with a spiral" },
          { id: "holey-stone", title: "Find a stone with a hole all the way through" },
          { id: "poppy-weed", title: "Find seaweed that pops" },
          { id: "pool-creature", title: "Find something living in a rock pool", hint: "Crouch down and wait. They come out." },
          { id: "crab", title: "Find a crab, or somewhere a crab has been" },
          { id: "tiny-shell", title: "Find a shell smaller than your fingernail" },
          { id: "smoothest", title: "Find the smoothest pebble on the beach" },
          { id: "sky-pool", title: "Find a pool with the sky in it" },
          { id: "limpet", title: "Find a limpet holding on tight" },
          { id: "sea-polished", title: "Find something the sea has polished" },
          { id: "sea-glass", title: "Find a piece of glass worn smooth" },
          { id: "sand-feather", title: "Find a feather on the sand" },
          { id: "water-pattern", title: "Find a pattern the water left behind" },
          { id: "hear-the-sea", title: "Find something you could hear the sea in" },
          { id: "it-moved", title: "Find a creature that moved while you watched" },
          { id: "strangest", title: "Find the strangest thing on this beach" }
        ],
        bonus: { id: "bonus-only-you", title: "Find something nobody else would have picked up" }
      },
      {
        id: "rock-pools-2",
        title: "The Tide Line",
        blurb: "Follow the line the sea left behind and see what it brought.",
        items: [
          { id: "the-line", title: "Find the line the tide left" },
          { id: "driftwood", title: "Find a piece of driftwood" },
          { id: "floated-here", title: "Find something that floated here" },
          { id: "broken-well", title: "Find a shell that's broken beautifully" },
          { id: "not-your-print", title: "Find a footprint that isn't yours" },
          { id: "bright-in-weed", title: "Find something bright among the seaweed" },
          { id: "egg-case", title: "Find an empty egg case", hint: "People call them mermaid's purses." },
          { id: "animal-stone", title: "Find a stone shaped like an animal" },
          { id: "wet-and-dry", title: "Find dry seaweed and wet seaweed together" },
          { id: "bird-dropped", title: "Find something a bird has dropped" },
          { id: "biggest-shell", title: "Find the biggest shell you can" },
          { id: "two-colour-sand", title: "Find sand with more than one colour in it" },
          { id: "bubble", title: "Find a bubble" },
          { id: "dug-hole", title: "Find a hole a creature has dug" },
          { id: "doesnt-belong", title: "Find something that doesn't belong on a beach" },
          { id: "waters-edge", title: "Find the very edge of the water" }
        ],
        bonus: { id: "bonus-shelf-worthy", title: "Find the one thing you'd put on a shelf at home" }
      }
    ]
  },

  /* ================================================================= RAINY DAY */
  "rainy-day": {
    id: "rainy-day",
    title: "A Rainy Day",
    emoji: "🌧️",
    place: "Out in the wet",
    note: "Wellies and a coat. A porch or a doorway works for most of these.",
    interaction: "photo",
    palette: "day",
    safety: SAFETY_OUTDOORS,
    adventures: [
      {
        id: "rainy-day-1",
        title: "Puddle Patrol",
        blurb: "The best hunt of the week, and everyone else stayed indoors.",
        items: [
          { id: "biggest-puddle", title: "Find the biggest puddle" },
          { id: "reflection", title: "Find a reflection in a puddle" },
          { id: "about-to-fall", title: "Find a drip about to fall" },
          { id: "rain-on-leaf", title: "Find rain sitting on a leaf" },
          { id: "bone-dry", title: "Find somewhere completely dry" },
          { id: "little-river", title: "Find a little river running down something" },
          { id: "beaded-web", title: "Find a spider web holding raindrops" },
          { id: "changed-colour", title: "Find something that's changed colour in the wet" },
          { id: "better-wet", title: "Find a stone that looks better wet" },
          { id: "drainpipe", title: "Find a drainpipe doing its job" },
          { id: "wet-footprint", title: "Find your own wet footprint" },
          { id: "happy-snail", title: "Find a snail out enjoying it" },
          { id: "sky-puddle", title: "Find a puddle with the whole sky in it" },
          { id: "sheltering", title: "Find something sheltering from the rain" },
          { id: "loudest-rain", title: "Find where the rain is loudest" },
          { id: "only-in-rain", title: "Find something beautiful that only happens in the rain" }
        ],
        bonus: { id: "bonus-welly-deep", title: "Find a puddle deep enough to lose a welly in", hint: "Photograph it. Don't lose the welly." }
      },
      {
        id: "rainy-day-2",
        title: "After the Rain",
        blurb: "It's stopped. Everything is dripping and the world smells new.",
        items: [
          { id: "nearly-gone", title: "Find a puddle that's nearly gone" },
          { id: "steam", title: "Find steam rising off something" },
          { id: "worm", title: "Find a worm on a path" },
          { id: "single-drop", title: "Find a leaf holding one single drop" },
          { id: "dried-first", title: "Find whatever dried first" },
          { id: "rainbow-place", title: "Find a rainbow, or a place one could be" },
          { id: "print-in-mud", title: "Find mud with a print in it" },
          { id: "wall-trail", title: "Find a snail trail on a wall" },
          { id: "loaded-grass", title: "Find grass still full of water" },
          { id: "smells-of-rain", title: "Find something that smells of rain" },
          { id: "breaking-cloud", title: "Find a cloud breaking up" },
          { id: "still-running", title: "Find water still running somewhere" },
          { id: "opened-up", title: "Find a flower that's opened back up" },
          { id: "dripping-branch", title: "Find a branch that's still dripping" },
          { id: "first-sun", title: "Find the first sunlight on something wet" },
          { id: "never-reached", title: "Find somewhere the rain never reached" }
        ],
        bonus: { id: "bonus-rain-improved", title: "Find something the rain made better" }
      }
    ]
  },

  /* ==================================================================== AUTUMN */
  autumn: {
    id: "autumn",
    title: "Autumn",
    emoji: "🍂",
    place: "Out among the falling leaves",
    note: "The best light of the year is late in the afternoon.",
    interaction: "photo",
    palette: "day",
    safety: SAFETY_OUTDOORS,
    adventures: [
      {
        id: "autumn-1",
        title: "Leaves and Conkers",
        blurb: "Everything is changing colour and falling down.",
        items: [
          { id: "three-colours", title: "Find a leaf with three colours in it" },
          { id: "conker", title: "Find a conker, or its spiky shell" },
          { id: "reddest", title: "Find the reddest leaf you can" },
          { id: "acorn", title: "Find an acorn" },
          { id: "face-sized", title: "Find a leaf bigger than your face" },
          { id: "still-green", title: "Find a tree that's still completely green" },
          { id: "kickable", title: "Find leaves deep enough to kick" },
          { id: "winged-seed", title: "Find a seed with wings" },
          { id: "blackberry", title: "Find a blackberry, or where they used to be" },
          { id: "low-sun-web", title: "Find a spider web lit by low sun" },
          { id: "skeleton-leaf", title: "Find a leaf that's only a skeleton" },
          { id: "squirrel-work", title: "Find something a squirrel has been at" },
          { id: "last-flower", title: "Find the last flower still out" },
          { id: "berry-hedge", title: "Find a hedge full of berries" },
          { id: "long-shadows", title: "Find long afternoon shadows" },
          { id: "best-leaf", title: "Find the best leaf of the whole day" }
        ],
        bonus: { id: "bonus-keep-forever", title: "Find the leaf you'd keep forever" }
      },
      {
        id: "autumn-2",
        title: "Frost and Fungi",
        blurb: "Colder now. Look down, and look closely.",
        items: [
          { id: "frost-on", title: "Find frost on something" },
          { id: "mushroom", title: "Find a mushroom", hint: "Look, don't pick. Some are poisonous." },
          { id: "frozen-puddle", title: "Find a frozen puddle" },
          { id: "frost-glass", title: "Find frost patterns on glass" },
          { id: "white-edged", title: "Find a leaf edged in white" },
          { id: "silver-web", title: "Find a cobweb turned silver" },
          { id: "wood-fungus", title: "Find fungus growing on wood" },
          { id: "bare-tree", title: "Find a completely bare tree" },
          { id: "frost-missed", title: "Find somewhere the frost has missed" },
          { id: "hungry-bird", title: "Find a bird looking for food" },
          { id: "crunchy", title: "Find something crunchy underfoot" },
          { id: "gills", title: "Find a mushroom with a pattern underneath" },
          { id: "see-through-ice", title: "Find ice you can see through" },
          { id: "very-low-sun", title: "Find the sun very low in the sky" },
          { id: "empty-nest", title: "Find an empty nest" },
          { id: "coldest-looking", title: "Find the coldest looking thing you can" }
        ],
        bonus: { id: "bonus-sugar", title: "Find something that looks like it's made of sugar" }
      }
    ]
  },

  /* =============================================================== ON A JOURNEY */
  "on-a-journey": {
    id: "on-a-journey",
    title: "On a Journey",
    emoji: "🚗",
    place: "In the car, on the way somewhere",
    note: "No photographs on this one. Just spot it and tick it off.",
    interaction: "tick",
    palette: "day",
    safety: SAFETY_CAR,
    adventures: [
      {
        id: "on-a-journey-1",
        title: "Out of the Window",
        blurb: "Sixteen things to spot before you get there.",
        items: [
          { id: "bridge", kind: "see", title: "Spot a bridge" },
          { id: "field-animal", kind: "see", title: "Spot an animal in a field" },
          { id: "tractor", kind: "see", title: "Spot a tractor" },
          { id: "yellow-car", kind: "see", title: "Spot a yellow car" },
          { id: "church-tower", kind: "see", title: "Spot a church tower" },
          { id: "river", kind: "see", title: "Spot a river or a stream" },
          { id: "bird-on-post", kind: "see", title: "Spot a big bird sitting on a post" },
          { id: "caravan", kind: "see", title: "Spot a caravan" },
          { id: "turbine", kind: "see", title: "Spot a wind turbine or a windmill" },
          { id: "funny-name", kind: "notice", title: "Spot a place name that makes you laugh" },
          { id: "hill-with-something", kind: "see", title: "Spot a hill with something on top" },
          { id: "animal-lorry", kind: "see", title: "Spot a lorry with an animal painted on it" },
          { id: "water-big", kind: "see", title: "Spot the sea, or a lake" },
          { id: "tunnel", kind: "see", title: "Spot a tunnel" },
          { id: "horse", kind: "see", title: "Spot a horse" },
          { id: "town-begins", kind: "notice", title: "Notice the moment countryside turns into town" }
        ],
        bonus: { id: "bonus-new-to-you", kind: "notice", title: "Spot something you've never noticed on this road before" }
      },
      {
        id: "on-a-journey-2",
        title: "Counting Things",
        blurb: "Harder than it sounds. Some of these you have to be quick for.",
        items: [
          { id: "ten-sheep", kind: "notice", title: "Count ten sheep" },
          { id: "three-trees", kind: "see", title: "Spot three different kinds of tree" },
          { id: "red-door", kind: "see", title: "Spot a red front door" },
          { id: "flag-or-balloon", kind: "see", title: "Spot a flag or a balloon" },
          { id: "waving", kind: "see", title: "Spot somebody waving" },
          { id: "dog-window", kind: "see", title: "Spot a dog with its head out of a window" },
          { id: "indicator", kind: "hear", title: "Hear the indicator and guess which way we're turning" },
          { id: "your-initial", kind: "notice", title: "Spot a number plate with your initial on it" },
          { id: "roundabout", kind: "see", title: "Spot a roundabout with something in the middle" },
          { id: "empty-bench", kind: "see", title: "Spot a bench with nobody on it" },
          { id: "post-box", kind: "see", title: "Spot a post box" },
          { id: "yellow-field", kind: "see", title: "Spot a whole field of something yellow" },
          { id: "house-story", kind: "make", title: "Make up a story about a house you go past" },
          { id: "animal-sign", kind: "see", title: "Spot a road sign with an animal on it" },
          { id: "cloud-shape", kind: "notice", title: "Spot a cloud shaped like something" },
          { id: "guess-arrival", kind: "notice", title: "Guess how long until we arrive, then check" }
        ],
        bonus: { id: "bonus-first-to-see", kind: "notice", title: "Be the first to spot where we're going" }
      }
    ]
  }
};

/** The built-in settings, in the order they appear on the home screen. */
const BUILT_IN_ORDER = [
  "out-and-about",
  "torchlight",
  "rock-pools",
  "rainy-day",
  "autumn",
  "on-a-journey"
];

/* --------------------------------------------------------- custom hunts

   A hunt that arrived in a link is registered here at boot and behaves as an
   ordinary setting from then on. Keeping the registry beside the built-in
   content means every lookup below covers both, and no screen needs to know
   the difference. */

const CUSTOM = new Map(); // settingId → setting, in the order they were added

export function registerCustom(setting) {
  CUSTOM.set(setting.id, setting);
}

export function unregisterCustom(settingId) {
  CUSTOM.delete(settingId);
}

export function isCustom(settingId) {
  return CUSTOM.has(settingId);
}

/* ------------------------------------------------------------- lookups */

/** Every setting id in display order: the built-in ones, then any custom. */
export function settingOrder() {
  return [...BUILT_IN_ORDER, ...CUSTOM.keys()];
}

export function getSetting(settingId) {
  return SETTINGS[settingId] || CUSTOM.get(settingId) || null;
}

/** Find an adventure anywhere by its id. Returns { setting, adventure, index }. */
export function findAdventure(adventureId) {
  for (const settingId of settingOrder()) {
    const setting = getSetting(settingId);
    if (!setting) continue;
    const index = setting.adventures.findIndex((a) => a.id === adventureId);
    if (index !== -1) return { setting, adventure: setting.adventures[index], index };
  }
  return null;
}

/** Every item of an adventure including its bonus, in display order. */
export function allItems(adventure) {
  return adventure.bonus ? [...adventure.items, adventure.bonus] : [...adventure.items];
}

export function isBonus(adventure, itemId) {
  return Boolean(adventure.bonus && adventure.bonus.id === itemId);
}

export function findItem(adventure, itemId) {
  return allItems(adventure).find((item) => item.id === itemId) || null;
}

/** Photos are keyed per adventure so a repeated challenge never overwrites one. */
export function photoKey(adventureId, itemId) {
  return `${adventureId}::${itemId}`;
}
