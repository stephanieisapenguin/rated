// Content moderation primitives — rate-limit constants and the report-reason
// catalog. Server enforces the real limits; these are mirrored client-side so
// we can short-circuit obviously-rate-limited actions before they fire a
// pointless request.

// In production this lives server-side (Redis). The frontend keeps an
// in-memory mirror in the App shell so the UX stays responsive.
export const FOLLOW_LIMIT_PER_HOUR = 200;
export const FOLLOW_WINDOW_MS = 60 * 60 * 1000;

// Reasons surfaced in ReportBlockMenu. Adding a reason here is enough — the
// menu, the report-confirm screen, and the backend payload all key off `key`.
export const REPORT_REASONS = [
  { key: "spam",          label: "Spam",                   desc: "Repetitive, misleading, or promotional" },
  { key: "harassment",    label: "Harassment or bullying", desc: "Targeted abuse or unwanted contact" },
  { key: "hate",          label: "Hate speech",            desc: "Attacks a protected group or identity" },
  { key: "inappropriate", label: "Inappropriate content",  desc: "Sexual, violent, or graphic material" },
  { key: "impersonation", label: "Impersonation",          desc: "Pretending to be someone else" },
  { key: "other",         label: "Something else",         desc: "Doesn't fit the categories above" },
];
