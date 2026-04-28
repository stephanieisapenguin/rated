// Tiny vibration helper. Wrapped in feature detection because:
//  - desktop browsers don't have navigator.vibrate
//  - some mobile browsers throw on vibrate() with no user gesture
// On any failure we silently no-op — haptics are nice-to-have, never required.

export const haptic = (intensity = "light") => {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    const dur = intensity === "heavy" ? 20 : intensity === "medium" ? 12 : 6;
    try { navigator.vibrate(dur); } catch (e) { /* swallow */ }
  }
};
