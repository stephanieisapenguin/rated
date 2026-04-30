import { useEffect, useRef, useState } from "react";

import { W } from "../theme";
import { TapTarget } from "./TapTarget";

// Profile-photo cropper. Loads an image, lets the user drag to reposition
// inside a circular mask, then writes the visible square region to a 256×256
// canvas and returns a JPEG dataURL via onSave.
//
// State: offset (pan in displayed-image px), imgDims (natural dimensions).
// The frame is FRAME_SIZE square; the image fills with "cover" sizing — the
// short edge matches the frame, the long edge overflows for panning room.
// On save we re-render at full output resolution onto a 256×256 canvas using
// the same transform math, so the saved image matches the preview.
export const CropperModal = ({ src, onSave, onCancel }) => {
  const FRAME_SIZE = 240;
  const OUTPUT_SIZE = 256;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgDims, setImgDims] = useState(null);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  const baseSize = imgDims ? (() => {
    const aspect = imgDims.w / imgDims.h;
    if (aspect > 1) return { w: FRAME_SIZE * aspect, h: FRAME_SIZE };
    return { w: FRAME_SIZE, h: FRAME_SIZE / aspect };
  })() : { w: FRAME_SIZE, h: FRAME_SIZE };
  const displayW = baseSize.w;
  const displayH = baseSize.h;

  const clampOffset = (x, y) => {
    const maxX = Math.max(0, (displayW - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (displayH - FRAME_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    e.preventDefault();
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: { ...offset } };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleSave = () => {
    if (!imgDims) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    const ratio = OUTPUT_SIZE / FRAME_SIZE;
    const drawW = displayW * ratio;
    const drawH = displayH * ratio;
    const drawX = (OUTPUT_SIZE - drawW) / 2 + offset.x * ratio;
    const drawY = (OUTPUT_SIZE - drawH) / 2 + offset.y * ratio;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      onSave(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = src;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop profile photo"
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 90, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", marginBottom: 16, color: W.text, fontFamily: "monospace", fontSize: 13, fontWeight: 800 }}>
        ✂ Crop Photo
      </div>
      <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginBottom: 14, textAlign: "center", lineHeight: 1.5 }}>
        Drag to reposition
      </div>
      <div style={{ position: "relative", width: FRAME_SIZE, height: FRAME_SIZE, marginBottom: 24 }}>
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", cursor: "grab", touchAction: "none", border: `2px solid ${W.accent}` }}>
          {src && <img src={src} alt="" draggable="false"
            style={{ position: "absolute", left: "50%", top: "50%", width: displayW, height: displayH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`, userSelect: "none", pointerEvents: "none" }}/>}
        </div>
        <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `1px dashed ${W.dim}66`, pointerEvents: "none" }}/>
      </div>
      <div style={{ display: "flex", gap: 10, width: FRAME_SIZE }}>
        <TapTarget onClick={onCancel} label="Cancel cropping" minTap={false}
          style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.card, border: `1px solid ${W.border}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
          Cancel
        </TapTarget>
        <TapTarget onClick={handleSave} label="Save cropped photo" minTap={false}
          style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.accent, border: `1px solid ${W.accent}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
          Use Photo
        </TapTarget>
      </div>
    </div>
  );
};
