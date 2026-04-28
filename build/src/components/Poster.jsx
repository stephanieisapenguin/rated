import { useEffect, useState } from "react";

import { W } from "../theme";

// Movie poster with a 4-state lifecycle:
//   loading → loaded   (image arrives, fade in)
//   loading → error    (network failure, show film-icon fallback)
//             empty    (no url at all, same fallback)
// Click is optional — when present, the poster acts as a button (Enter/Space).
export const Poster = ({ url, w = 85, h = 120, radius = 10, onClick, title }) => {
  const [state, setState] = useState(url ? "loading" : "empty");
  useEffect(() => { setState(url ? "loading" : "empty"); }, [url]);

  const isFailed = state === "error" || state === "empty";
  const altText = title ? `Poster for ${title}` : "Movie poster";
  const handleKey = (e) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? handleKey : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View poster for ${title || "movie"}` : undefined}
      style={{
        width: w, height: h, borderRadius: radius, overflow: "hidden", flexShrink: 0,
        background: W.card, border: `1px solid ${W.border}`,
        cursor: onClick ? "pointer" : "default", position: "relative",
      }}>
      {url && state !== "error" && (
        <img src={url} alt={altText}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: state === "loaded" ? 1 : 0, transition: "opacity 0.2s" }}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}/>
      )}
      {state === "loading" && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(90deg, ${W.card}, ${W.border}, ${W.card})`,
            animation: "skeleton-shimmer 1.2s infinite linear",
            backgroundSize: "200% 100%",
          }}/>
        </div>
      )}
      {isFailed && (
        <div role="img" aria-label={altText} style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 4, padding: 6,
          background: `linear-gradient(135deg, ${W.card}, ${W.border})`,
          textAlign: "center",
        }}>
          <div aria-hidden="true" style={{ fontSize: Math.min(w * 0.32, 22), color: W.dim, opacity: 0.6 }}>🎬</div>
          {title && <div style={{
            fontSize: Math.max(7, Math.min(w * 0.11, 9)),
            color: W.dim, fontFamily: "monospace", fontWeight: 700,
            lineHeight: 1.2, letterSpacing: 0.3, wordBreak: "break-word",
          }}>{title.length > 24 ? title.slice(0, 22) + "…" : title}</div>}
        </div>
      )}
    </div>
  );
};
