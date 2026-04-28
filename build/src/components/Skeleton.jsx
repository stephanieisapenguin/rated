import { W } from "../theme";

// Pulsing gray placeholder. Sized to match whatever the loaded content will be.
// Pair with the `skeleton-shimmer` keyframes injected by App.jsx.
export const Skeleton = ({ w = "100%", h = 16, radius = 6, style = {} }) => (
  <div style={{ width: w, height: h, borderRadius: radius, background: W.card, position: "relative", overflow: "hidden", ...style }}>
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg,transparent,${W.border}66,transparent)`, animation: "skeleton-shimmer 1.4s infinite" }}/>
  </div>
);

// Three-card skeleton matching the home/profile feed cards' shape.
export const FeedSkeleton = () => (
  <div style={{ padding: "0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Skeleton w={30} h={30} radius={15}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <Skeleton w={80} h={11}/>
            <Skeleton w={50} h={8}/>
          </div>
        </div>
        <Skeleton w="100%" h={10}/>
        <Skeleton w="70%" h={10}/>
      </div>
    ))}
  </div>
);
