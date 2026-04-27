import { useEffect } from "react";
import { W } from "../theme";

// Briefly shown when the rank screen is opened on a movie that's already
// ranked. Auto-dismisses after 400ms by calling onDone — App.jsx routes
// the screen back to whatever was selected (or home).
export const AlreadyRankedFallback = ({ onDone }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 24 }}>✓</div>
      <div style={{ fontSize: 11, color: W.green, fontFamily: "monospace" }}>Already ranked!</div>
    </div>
  );
};
