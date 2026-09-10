// Pattern Matching content pools.
// Add a new food by appending one object — no other code changes needed.
import { missingTranslation } from "../i18n.js";

export const FOOD_ITEMS = [
  { name: "Momos" },
  { name: "Thukpa" },
  { name: "Pitha" },
  { name: "Khar" },
  { name: "Jadoh" },
  { name: "Bamboo Shoot" },
  { name: "Fish Curry" },
  { name: "Rice" },
  { name: "Dal" },
  { name: "Roti" },
];

export const FRUIT_ITEMS = [
  { name: "Orange" },
  { name: "Pineapple" },
  { name: "Litchi" },
  { name: "Passion Fruit" },
  { name: "Kiwi" },
  { name: "Star Fruit" },
  { name: "Mango" },
  { name: "Banana" },
  { name: "Guava" },
  { name: "Papaya" },
];

const POOLS = { food: FOOD_ITEMS, fruit: FRUIT_ITEMS };

const SHAPE_SETS = [
  ["circle", "square", "triangle"],
  ["star", "pentagon", "rectangle"],
  ["circle", "star", "triangle"],
];

const EMOJI_SETS = [
  ["🍎", "🍌", "🐘"],
  ["🐄", "🌸", "🥭"],
  ["🐐", "🦚", "🍊"],
];

// Three distinct rounds per photo level: category + pair count + start offset.
const PHOTO_ROUNDS = {
  // Level 3: 4 pairs = 8 boxes (word-only cards)
  3: [
    { category: "food",  pairs: 4, offset: 0 },
    { category: "fruit", pairs: 4, offset: 0 },
    { category: "food",  pairs: 4, offset: 4 },
  ],
  // Level 4: 8 pairs = 16 boxes (word-only cards)
  4: [
    { category: "food",  pairs: 8, offset: 0 },
    { category: "fruit", pairs: 8, offset: 0 },
    { category: "food",  pairs: 8, offset: 2 },
  ],
};

const roundCursor = { 1: 0, 2: 0, 3: 0, 4: 0 };

export function nextPatternRound(level) {
  const key = Number(level);
  const index = roundCursor[key] || 0;
  roundCursor[key] = (index + 1) % 3;
  return index;
}

export function pickPoolItems(category, count, offset) {
  const pool = POOLS[category] || FOOD_ITEMS;
  const n = Math.min(count, pool.length);
  const items = [];
  const used = new Set();
  for (let i = 0; i < n; i += 1) {
    const item = pool[(offset + i) % pool.length];
    if (used.has(item.name)) continue;
    used.add(item.name);
    items.push(item);
  }
  return items;
}

export function localizePatternItem(item, lang) {
  if (lang === "en") return item.name;
  return missingTranslation(lang, `pattern.${item.name}`);
}

export function getShapeSet(roundIndex) {
  return SHAPE_SETS[roundIndex % SHAPE_SETS.length];
}

export function getEmojiSet(roundIndex) {
  return EMOJI_SETS[roundIndex % EMOJI_SETS.length];
}

export function getPhotoRound(level, roundIndex) {
  const specs = PHOTO_ROUNDS[level];
  return specs[roundIndex % specs.length];
}
