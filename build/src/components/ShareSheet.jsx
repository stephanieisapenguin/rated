import { useRef } from "react";

import { haptic } from "../lib/haptic";
import { useFocusTrap } from "../lib/hooks";
import { W } from "../theme";
import { ShareIcon } from "./ShareIcon";
import { TapTarget } from "./TapTarget";

// Share sheet for movies and reviews. Three actions: Copy Link, native share
// (with clipboard fallback), and SMS. Closes on backdrop tap and on action
// completion. `showToast` is optional — used to confirm clipboard success.
export const ShareSheet = ({ item, onClose, showToast }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!item, onClose);
  if (!item) return null;

  const link = item.type === "movie"
    ? `https://rated.app/movie/${item.id}`
    : `https://rated.app/review/${item.id}`;
  const title = item.type === "movie"
    ? `${item.title} on RATED`
    : `Review of ${item.movie_title} on RATED`;

  const copyLink = async () => {
    haptic("light");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast && showToast("Link copied", "ok");
      } else {
        showToast && showToast("Couldn't copy — clipboard unavailable", "err");
      }
    } catch {
      showToast && showToast("Couldn't copy — clipboard unavailable", "err");
    }
    onClose();
  };
  const shareNative = async () => {
    haptic("light");
    try {
      if (navigator.share) {
        await navigator.share({ title, url: link });
        onClose();
        return;
      }
    } catch (e) { if (e?.name === "AbortError") { onClose(); return; } }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast && showToast("Link copied", "ok");
      }
    } catch { /* clipboard unavailable */ }
    onClose();
  };
  const sendSms = () => {
    haptic("light");
    const body = encodeURIComponent(`${title}: ${link}`);
    window.location.href = `sms:?&body=${body}`;
    onClose();
  };

  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="share-sheet-title"
      onClick={onClose}
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "18px 22px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div id="share-sheet-title" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>
            <ShareIcon size={14} color={W.text}/> Share
          </div>
          <TapTarget onClick={onClose} label="Close share sheet" minTap={false}
            style={{ fontSize: 16, color: W.dim, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
            <span aria-hidden="true">✕</span>
          </TapTarget>
        </div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginBottom: 12, lineHeight: 1.5 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { icon: "🔗", label: "Copy Link", action: copyLink },
            { icon: <ShareIcon size={18} color={W.text}/>, label: "Share via...", action: shareNative },
            { icon: "💬", label: "Send as Message", action: sendSms },
          ].map((o) => (
            <TapTarget key={o.label} onClick={o.action} label={o.label} minTap={false}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: W.card, borderRadius: 12, border: `1px solid ${W.border}`, minHeight: 48 }}>
              <span aria-hidden="true" style={{ fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", width: 24 }}>{o.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: W.text, fontFamily: "monospace" }}>{o.label}</span>
            </TapTarget>
          ))}
        </div>
        <TapTarget onClick={onClose} label="Cancel" minTap={false}
          style={{ marginTop: 12, padding: "11px", textAlign: "center", fontSize: 11, color: W.dim, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
          Cancel
        </TapTarget>
      </div>
    </div>
  );
};
