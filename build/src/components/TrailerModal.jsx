import { useEffect, useRef } from "react";

import { useFocusTrap } from "../lib/hooks";
import { TapTarget } from "./TapTarget";

// YouTube trailer modal. Iframe embed; autoplay may be blocked on some
// platforms — the user can tap play inside the iframe as fallback. Locks
// background scroll while open. Returns null when no `videoKey`.
export const TrailerModal = ({ videoKey, title, onClose }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, true, onClose);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);
  if (!videoKey) return null;
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-label={`Trailer for ${title || "movie"}`}
      onClick={onClose}
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: 480, padding: "0 6px", marginBottom: 10 }}>
        <div id="trailer-title" style={{ fontSize: 10, color: "#fff", fontFamily: "monospace", fontWeight: 700, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 12 }}>
          ▶ {title || "Trailer"}
        </div>
        <TapTarget onClick={(e) => { e.stopPropagation(); onClose(); }} label="Close trailer" minTap={false}
          style={{ color: "#fff", fontSize: 20, padding: "8px 12px", opacity: 0.9, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
          <span aria-hidden="true">✕</span>
        </TapTarget>
      </div>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#000", boxShadow: "0 12px 40px rgba(0,0,0,0.8)" }}>
        <iframe
          width="100%" height="100%"
          src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
          title={`${title || "Trailer"} — YouTube video player`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 0, display: "block" }}/>
      </div>
      <div style={{ fontSize: 9, color: "#fff", fontFamily: "monospace", opacity: 0.5, marginTop: 10, letterSpacing: 1 }}>
        Tap outside or press Esc to close
      </div>
    </div>
  );
};
