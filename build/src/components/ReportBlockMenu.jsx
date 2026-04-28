import { useState } from "react";

import { REPORT_REASONS } from "../lib/moderation";
import { W } from "../theme";
import { TapTarget } from "./TapTarget";

// Reusable report/block sheet. Renders as a small ⋯ trigger that opens a
// bottom sheet with a 4-stage flow:
//   menu → report → report-confirm
//        → block-confirm
// Trigger size matches the adjacent share button (32×32 / 36×36 for "md")
// so action buttons in a row line up at the same visual weight.
export const ReportBlockMenu = ({
  targetType, targetId, targetLabel, targetUser,
  onReport, onBlock, blockedUsers, size = "sm",
}) => {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("menu"); // menu | report | report-confirm | block-confirm
  const [reason, setReason] = useState(null);

  const close = () => { setOpen(false); setStage("menu"); setReason(null); };
  const isBlocked = targetUser && blockedUsers?.has(targetUser);

  const triggerSize = size === "md" ? 36 : 32;
  const iconSize = size === "md" ? 16 : 14;

  return (
    <>
      <TapTarget onClick={(e) => { e.stopPropagation(); setOpen(true); }} label="More options" minTap={false}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: triggerSize, height: triggerSize, borderRadius: "50%", background: W.card, border: `1px solid ${W.border}`, fontSize: iconSize, color: W.dim, flexShrink: 0, lineHeight: 1, userSelect: "none" }}>
        <span aria-hidden="true">⋯</span>
      </TapTarget>
      {open && <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "16px 20px 24px", borderTop: `1px solid ${W.border}` }}>

          {stage === "menu" && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>
                {targetUser || (targetType === "review" ? "Review" : targetType === "feed" ? "Post" : targetType === "comment" ? "Comment" : "Item")}
              </div>
              <TapTarget onClick={close} label="Close menu" minTap={false}
                style={{ fontSize: 16, color: W.dim, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <TapTarget onClick={() => setStage("report")} label="Report this content" minTap={false}
                style={{ padding: "10px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 40 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Report</span>
              </TapTarget>
              {targetUser && !isBlocked && <TapTarget onClick={() => setStage("block-confirm")} label={`Block ${targetUser}`} minTap={false}
                style={{ padding: "10px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 40 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>Block {targetUser}</span>
              </TapTarget>}
              {targetUser && isBlocked && <div style={{ padding: "10px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 40 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: W.dim, fontFamily: "monospace" }}>Already blocked</span>
              </div>}
            </div>
          </>}

          {stage === "report" && <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TapTarget onClick={() => setStage("menu")} label="Back to menu" minTap={false}
                style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", padding: "6px 4px", minHeight: 32, display: "flex", alignItems: "center" }}>
                ← Back
              </TapTarget>
              <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>Why report this?</div>
              <div style={{ width: 40 }}/>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {REPORT_REASONS.map((r) => (
                <TapTarget key={r.key} onClick={() => { setReason(r); setStage("report-confirm"); }} label={`Report reason: ${r.label}`} minTap={false}
                  style={{ padding: "9px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 36 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{r.label}</span>
                </TapTarget>
              ))}
            </div>
          </>}

          {stage === "report-confirm" && reason && <>
            <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🚩</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace", marginBottom: 4 }}>Submit this report?</div>
              <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>
                Reason: <span style={{ color: W.text, fontWeight: 700 }}>{reason.label}</span> · Your identity stays private
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <TapTarget onClick={() => setStage("report")} label="Cancel" minTap={false}
                style={{ flex: 1, padding: "11px", textAlign: "center", fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>Cancel</TapTarget>
              <TapTarget onClick={() => { onReport && onReport(targetType, targetId, targetLabel, reason); close(); }} label="Submit report" minTap={false}
                style={{ flex: 1, padding: "11px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", background: W.accent, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>Submit Report</TapTarget>
            </div>
          </>}

          {stage === "block-confirm" && <>
            <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🚫</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace", marginBottom: 6 }}>Block {targetUser}?</div>
              <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>
                You won't see their posts. They can't see yours. Unblock anytime in Settings.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <TapTarget onClick={() => setStage("menu")} label="Cancel" minTap={false}
                style={{ flex: 1, padding: "11px", textAlign: "center", fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>Cancel</TapTarget>
              <TapTarget onClick={() => { onBlock && onBlock(targetUser); close(); }} label={`Block ${targetUser}`} minTap={false}
                style={{ flex: 1, padding: "11px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", background: W.accent, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>Block</TapTarget>
            </div>
          </>}

        </div>
      </div>}
    </>
  );
};
