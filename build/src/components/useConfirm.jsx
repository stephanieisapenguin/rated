import { useRef, useState } from "react";

import { haptic } from "../lib/haptic";
import { useFocusTrap } from "../lib/hooks";
import { W } from "../theme";
import { TapTarget } from "./TapTarget";

// Reusable destructive-action confirmation. Returns `{ confirm, ConfirmDialog }`:
//   confirm({ icon, title, message, confirmLabel, cancelLabel, onConfirm })
//     opens the modal. ConfirmDialog must be rendered somewhere in the tree.
//
// Single instance per consumer — keep it local to the screen that needs it
// rather than hoisting to a global, so dialogs nest naturally.
export const useConfirm = () => {
  const [state, setState] = useState(null);
  const confirm = (opts) => setState(opts);
  const close = () => setState(null);

  const ConfirmDialog = () => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef, !!state, close);
    if (!state) return null;
    return (
      <div ref={containerRef} role="alertdialog" aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={state.message ? "confirm-message" : undefined}
        onClick={close}
        style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)",
          zIndex: 75, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 28px",
        }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: W.card, border: `1px solid ${W.border}`, borderRadius: 18,
          padding: "22px 20px", width: "100%", maxWidth: 340,
        }}>
          {state.icon && <div aria-hidden="true" style={{ textAlign: "center", fontSize: 32, marginBottom: 8 }}>{state.icon}</div>}
          <div id="confirm-title" style={{
            fontSize: 13, fontWeight: 800, color: W.text,
            fontFamily: "monospace", textAlign: "center", marginBottom: 6,
          }}>{state.title}</div>
          {state.message && <div id="confirm-message" style={{
            fontSize: 10, color: W.dim, fontFamily: "monospace",
            lineHeight: 1.6, textAlign: "center", marginBottom: 16,
          }}>{state.message}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <TapTarget onClick={close} label={state.cancelLabel || "Cancel"} minTap={false}
              style={{
                flex: 1, padding: "11px", borderRadius: 10,
                background: W.bg, border: `1px solid ${W.border}`,
                textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text,
                fontFamily: "monospace", display: "flex", alignItems: "center",
                justifyContent: "center", minHeight: 44,
              }}>
              {state.cancelLabel || "Cancel"}
            </TapTarget>
            <TapTarget onClick={() => { haptic("heavy"); state.onConfirm?.(); close(); }}
              label={state.confirmLabel || "Confirm"} minTap={false}
              style={{
                flex: 1, padding: "11px", borderRadius: 10,
                background: W.accent, textAlign: "center", fontSize: 11,
                fontWeight: 700, color: "#fff", fontFamily: "monospace",
                display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44,
              }}>
              {state.confirmLabel || "Confirm"}
            </TapTarget>
          </div>
        </div>
      </div>
    );
  };

  return { confirm, ConfirmDialog };
};
