// Time helpers used across feed cards, notifications, profiles, etc.
//
// formatRelativeTime turns a ms timestamp into "2m ago" / "3h ago" /
// "Mar 14" / "Jan 5, 2024". Re-renders that pass it the same ts and call
// it on each render get a live-updating label as long as the consumer is
// also subscribed to useMinuteTick (or some other tick).
//
// parseRelativeToTs is the inverse: turn a short relative string ("3h",
// "just now") into a ms timestamp. Used to hydrate static mock data so it
// ticks like real data.

export const formatRelativeTime = (ts) => {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  const oneYr = 365 * 24 * 60 * 60 * 1000;
  if (diff < oneYr) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Format an ISO date as "May 15, 2026". Empty string for missing input.
export const formatReleaseDate = (isoDate) => {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Days until an ISO release date (e.g. "2026-05-15"). Returns 0 on the day,
// negative once released, null when the input is missing.
export const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
};

export const parseRelativeToTs = (s) => {
  if (!s) return Date.now();
  const str = String(s).toLowerCase().trim();
  if (str.includes("just")) return Date.now() - 10_000; // 10s ago
  const m = str.match(/^(\d+)\s*([smhdw])/);
  if (!m) return Date.now();
  const n = parseInt(m[1], 10);
  const mult = {
    s: 1000,
    m: 60_000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  }[m[2]] ?? 60_000;
  return Date.now() - n * mult;
};
