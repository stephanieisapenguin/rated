import { W } from "../theme";

// Small uppercase tag. `color` selects from a fixed palette of dim-bg + bold-fg
// pairs that match the theme: red (accent), gold, green, blue, orange, purple.
// Anything else falls back to purple.
export const Badge = ({ color, children }) => (
  <span style={{
    padding: "2px 7px", borderRadius: 4, fontSize: 7, fontWeight: 900, fontFamily: "monospace",
    background:
      color === "red" ? W.accentDim
      : color === "gold" ? W.goldDim
      : color === "green" ? W.greenDim
      : color === "blue" ? W.blueDim
      : color === "orange" ? W.orangeDim
      : W.purpleDim,
    color:
      color === "red" ? W.accent
      : color === "gold" ? W.gold
      : color === "green" ? W.green
      : color === "blue" ? W.blue
      : color === "orange" ? W.orange
      : W.purple,
    border: `1px solid ${
      color === "red" ? W.accent + "33"
      : color === "gold" ? W.gold + "33"
      : color === "green" ? W.green + "33"
      : color === "blue" ? W.blue + "33"
      : color === "orange" ? W.orange + "33"
      : W.purple + "33"
    }`,
  }}>{children}</span>
);
