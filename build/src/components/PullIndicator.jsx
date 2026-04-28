import { W } from "../theme";

// Pull-to-refresh visual. Pair with usePullToRefresh from lib/hooks.
// Rotates a chevron as the user pulls; switches to a spinner once the
// refresh fires. Hidden entirely when at rest.
export const PullIndicator = ({ pullDist, isRefreshing }) => {
  if (!pullDist && !isRefreshing) return null;
  const progress = Math.min(1, pullDist / 60);
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      height: pullDist || 40,
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 5, pointerEvents: "none",
      transition: isRefreshing ? "height 0.2s" : "none",
    }}>
      <div style={{
        fontSize: 16,
        opacity: progress,
        transform: `rotate(${progress * 360}deg)`,
        transition: isRefreshing ? "transform 0.5s linear" : "none",
        color: W.accent,
      }}>{isRefreshing ? "⟳" : "↓"}</div>
    </div>
  );
};
