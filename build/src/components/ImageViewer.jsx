import { useRef } from "react";

import { useFocusTrap } from "../lib/hooks";
import { TapTarget } from "./TapTarget";

// Full-screen image viewer with tap-to-close. Returns null when no `url`.
export const ImageViewer = ({ url, onClose }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!url, onClose);
  if (!url) return null;
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-label="Image viewer"
      onClick={onClose}
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "pointer" }}>
      <TapTarget onClick={onClose} label="Close image viewer" minTap={false}
        style={{ position: "absolute", top: 8, right: 8, fontSize: 20, color: "#fff", opacity: 0.8, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
        <span aria-hidden="true">✕</span>
      </TapTarget>
      <img src={url} alt="Full size view"
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
        onClick={(e) => e.stopPropagation()}/>
    </div>
  );
};
