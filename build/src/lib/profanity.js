// Basic profanity filter. Production would use a real library (bad-words,
// better-profanity) plus ML (Perspective API / OpenAI Moderation). This
// catches obvious slurs and f-words plus a few leetspeak bypasses, but
// intentionally misses creative obfuscation — that needs ML.

const BAD_WORDS = [
  "fuck", "shit", "cunt", "bitch", "bastard", "asshole", "dick", "piss",
  "cock", "pussy", "slut", "whore",
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "spic", "chink",
  "kike", "wetback", "gook",
  "rape", "raping", "kys", "kms", "killyourself",
];

// Leetspeak substitutions attackers use to bypass simple filters.
const LEET_MAP = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", "$": "s", "!": "i", "+": "t",
};

const normalizeForProfanity = (text) => (
  (text || "")
    .toLowerCase()
    .split("").map((c) => LEET_MAP[c] || c).join("")
    .replace(/[^a-z0-9]/g, " ") // strip punctuation, keep word boundaries
    .replace(/\s+/g, " ").trim()
);

// Returns the matched bad word (truthy) or null.
export const checkProfanity = (text) => {
  if (!text) return null;
  const normalized = normalizeForProfanity(text);
  for (const w of BAD_WORDS) {
    if (normalized.includes(w)) return w;
  }
  return null;
};
