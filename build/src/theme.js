// Live theme palette + type scale.
//
// W is a Proxy: reading W.bg / W.accent / etc. always returns the value from
// ACTIVE_THEME, which the app mutates via setActiveTheme(). The whole tree
// re-reads through the Proxy on every render, so flipping the theme works
// without prop-drilling colors.
//
// Same pattern for TYPE_SCALE — readers call getTypeScale() to multiply
// against base font sizes. Mutated by setTypeScale().

export const DARK_THEME = {
  bg: "#0f0f13", card: "#1a1a22", border: "#2c2c3a",
  text: "#ededf2", dim: "#6e6e82",
  accent: "#ff3b3b", accentDim: "#ff3b3b28",
  green: "#10b981", greenDim: "#10b98122",
  gold: "#eab308", goldDim: "#eab30822",
  blue: "#3b82f6", blueDim: "#3b82f622",
  purple: "#a855f7", purpleDim: "#a855f722",
  orange: "#f97316", orangeDim: "#f9731622",
};

export const LIGHT_THEME = {
  bg: "#f7f7fa", card: "#ffffff", border: "#e5e5ec",
  text: "#18181e", dim: "#6e6e82",
  accent: "#e5252f", accentDim: "#e5252f18",
  green: "#059669", greenDim: "#05966918",
  gold: "#ca8a04", goldDim: "#ca8a0418",
  blue: "#2563eb", blueDim: "#2563eb18",
  purple: "#9333ea", purpleDim: "#9333ea18",
  orange: "#ea580c", orangeDim: "#ea580c18",
};

let ACTIVE_THEME = DARK_THEME;
export const setActiveTheme = (t) => {
  ACTIVE_THEME = t === "light" ? LIGHT_THEME : DARK_THEME;
};
export const getActiveTheme = () => ACTIVE_THEME;

// W is a Proxy. Don't destructure it (`const { bg } = W`) — that captures the
// current theme's bg. Always read through the Proxy at the call site.
export const W = new Proxy({}, { get: (_, prop) => ACTIVE_THEME[prop] });

let TYPE_SCALE = 1.0;
export const setTypeScale = (s) => { TYPE_SCALE = s; };
export const getTypeScale = () => TYPE_SCALE;
