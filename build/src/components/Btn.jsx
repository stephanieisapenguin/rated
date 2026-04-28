import { W } from "../theme";
import { TapTarget } from "./TapTarget";

// Standard-shaped button. Variants:
//   accent   — solid accent fill (primary action)
//   default  — outlined card surface (secondary)
//   small    — 36px-tall compact size; default is 44px (touch target)
//   full     — width 100%
// Wraps TapTarget so keyboard focus and Enter/Space activation are free.
export const Btn = ({ children, accent, full, small, onClick, label, disabled }) => (
  <TapTarget onClick={onClick} label={label || (typeof children === "string" ? children : undefined)} disabled={disabled} minTap={false}
    style={{
      background: accent ? W.accent : "transparent",
      border: accent ? "none" : `1px solid ${W.border}`,
      color: accent ? "#fff" : W.dim,
      borderRadius: 12,
      padding: small ? "8px 14px" : "12px 20px",
      fontSize: small ? 10 : 12,
      fontWeight: 700,
      textAlign: "center",
      width: full ? "100%" : "auto",
      fontFamily: "monospace",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: small ? 36 : 44,
      opacity: disabled ? 0.5 : 1,
    }}>
    {children}
  </TapTarget>
);
