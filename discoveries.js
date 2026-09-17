/*
 * discoveries.js — the content of both hunts.
 *
 * Everything the app knows about a hunt lives here: its name, wording,
 * and the list of discoveries. Editing this file is the way to change
 * the challenges. Ids are stable keys used for saved progress and photos,
 * so rename a title freely but keep its id.
 */

export const HUNTS = {
  day: {
    id: "day",
    emoji: "☀️",
    title: "Day Adventure",
    tagline: "Find it. Photograph it. Collect your discoveries.",
    noun: "discovery",
    nounPlural: "discoveries",
    safety: "Stay where your grown-up says it's safe to explore.",
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

  night: {
    id: "night",
    emoji: "🔦",
    title: "Torchlight Adventure",
    tagline: "Grab a torch. Explore the dark. Tick off what you find.",
    noun: "mission",
    nounPlural: "missions",
    safety: "Take your torch and stay within your exploring area.",
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
  }
};

/** Small labels for the night "kind" eyebrow. Minimal reading, one glance. */
export const KIND_LABELS = {
  see: "Look",
  hear: "Listen",
  notice: "Notice",
  make: "Make"
};

/** All items including the bonus, in display order. */
export function allItems(huntId) {
  const hunt = HUNTS[huntId];
  return hunt.bonus ? [...hunt.items, hunt.bonus] : [...hunt.items];
}

export function isBonus(huntId, itemId) {
  return HUNTS[huntId].bonus?.id === itemId;
}

export function findItem(huntId, itemId) {
  return allItems(huntId).find((item) => item.id === itemId) || null;
}
