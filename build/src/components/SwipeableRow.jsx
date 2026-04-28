import { useRef, useState } from "react";

import { haptic } from "../lib/haptic";
import { W } from "../theme";

// Row that reveals action buttons on left swipe.
//   actions = [{ icon, label, color, onPress }] — rendered right-to-left,
//   each 64px wide. `onSwipeOpen` fires when the row snaps to the open state.
export const SwipeableRow = ({ children, actions = [], onSwipeOpen }) => {
  const [offset, setOffset] = useState(0); // negative = swiped left
  const startX = useRef(null);
  const startOffset = useRef(0);
  const actionWidth = actions.length * 64;

  const handleStart = (x) => { startX.current = x; startOffset.current = offset; };
  const handleMove = (x) => {
    if (startX.current == null) return;
    const dx = x - startX.current;
    setOffset(Math.max(-actionWidth, Math.min(0, startOffset.current + dx)));
  };
  const handleEnd = () => {
    if (startX.current == null) return;
    if (offset < -actionWidth / 2) {
      setOffset(-actionWidth);
      haptic("light");
      onSwipeOpen?.();
    } else {
      setOffset(0);
    }
    startX.current = null;
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 10 }}>
      {/* Action layer revealed underneath */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex" }}>
        {actions.map((a, i) => (
          <div key={i} onClick={() => { haptic("medium"); a.onPress?.(); setOffset(0); }}
            style={{ width: 64, background: a.color || W.accent, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer" }}>
            <span style={{ fontSize: 16, color: "#fff" }}>{a.icon}</span>
            <span style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{a.label}</span>
          </div>
        ))}
      </div>
      {/* Slidable content layer */}
      <div
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current == null ? "transform 0.2s" : "none",
          position: "relative", zIndex: 1, background: W.card,
        }}>
        {children}
      </div>
    </div>
  );
};
