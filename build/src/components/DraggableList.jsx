import { useRef, useState } from "react";

import { haptic } from "../lib/haptic";

// Drag-to-reorder list using Pointer Events (works for both mouse and touch).
//   items        — array
//   keyOf(item)  — stable key
//   renderItem(item, dragHandleProps, isDragging) — row JSX. Spread
//                  dragHandleProps onto the element you want to be the drag
//                  affordance.
//   onReorder(fromIndex, toIndex) — fires once on release.
//
// Uses transform translateY for the dragged row (no layout reflow during drag),
// and shifts neighboring rows via CSS transform when the dragged row crosses
// their midpoints. Each row's height is measured on pointerdown so the math
// works for any row size.
export const DraggableList = ({ items, keyOf, renderItem, onReorder, disabled = false }) => {
  const containerRef = useRef(null);
  const rowRefs = useRef({});
  const [draggingKey, setDraggingKey] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [hoverIndex, setHoverIndex] = useState(null);
  const dragState = useRef(null); // { startY, startIndex, rowHeight, offsets[] }

  const handlePointerDown = (e, item, index) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const row = rowRefs.current[keyOf(item)];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    // Pre-measure row offsets so move events can compute hover index from a
    // single pointer Y without re-querying the DOM each move.
    const containerTop = containerRef.current?.getBoundingClientRect().top || 0;
    const offsets = items.map((it) => {
      const r = rowRefs.current[keyOf(it)];
      return r ? r.getBoundingClientRect().top - containerTop : 0;
    });
    dragState.current = { startY: e.clientY, startIndex: index, rowHeight: rect.height, offsets };
    setDraggingKey(keyOf(item));
    setHoverIndex(index);
    setDragOffsetY(0);
    haptic("medium");
  };

  const handlePointerMove = (e) => {
    if (!dragState.current) return;
    e.preventDefault();
    const { startY, startIndex, rowHeight, offsets } = dragState.current;
    const delta = e.clientY - startY;
    setDragOffsetY(delta);
    // Where would the dragged row's center sit?
    const draggedCenter = offsets[startIndex] + rowHeight / 2 + delta;
    let target = startIndex;
    for (let i = 0; i < items.length; i++) {
      const itemCenter = offsets[i] + rowHeight / 2;
      if (i < startIndex && draggedCenter < itemCenter) { target = i; break; }
      if (i > startIndex && draggedCenter > itemCenter) target = i;
    }
    if (target !== hoverIndex) {
      setHoverIndex(target);
      haptic("light");
    }
  };

  const handlePointerUp = () => {
    if (!dragState.current) return;
    const { startIndex } = dragState.current;
    const target = hoverIndex;
    dragState.current = null;
    setDraggingKey(null);
    setDragOffsetY(0);
    setHoverIndex(null);
    if (target !== null && target !== startIndex && onReorder) onReorder(startIndex, target);
  };

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      {items.map((item, i) => {
        const k = keyOf(item);
        const isDragging = k === draggingKey;
        // Shift non-dragged rows to make room for the dragged row's hover position.
        let translateY = 0;
        if (draggingKey && !isDragging && hoverIndex !== null && dragState.current) {
          const startIndex = dragState.current.startIndex;
          const rh = dragState.current.rowHeight;
          if (startIndex < hoverIndex && i > startIndex && i <= hoverIndex) translateY = -rh;
          else if (startIndex > hoverIndex && i < startIndex && i >= hoverIndex) translateY = rh;
        }
        const dragHandleProps = {
          onPointerDown: (e) => handlePointerDown(e, item, i),
          style: { cursor: disabled ? "default" : "grab", touchAction: "none" },
          "aria-label": "Drag to reorder",
        };
        return (
          <div key={k}
            ref={(el) => { if (el) rowRefs.current[k] = el; }}
            style={{
              transform: isDragging ? `translateY(${dragOffsetY}px)` : `translateY(${translateY}px)`,
              transition: isDragging ? "none" : "transform 0.18s cubic-bezier(.2,.7,.3,1)",
              zIndex: isDragging ? 10 : 1,
              opacity: isDragging ? 0.92 : 1,
              boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.4)" : "none",
              borderRadius: 10,
              position: "relative",
            }}>
            {renderItem(item, dragHandleProps, isDragging)}
          </div>
        );
      })}
    </div>
  );
};
