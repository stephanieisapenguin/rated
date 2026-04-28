import { useEffect, useRef } from "react";

import { W } from "../theme";
import { TapTarget } from "./TapTarget";

// Per-screen scroll-position cache, keyed by screen name. Module-level so it
// survives across remounts within a session — the Profile screen's scroll
// position is preserved when you navigate to a movie and back, etc.
const SCROLL_POSITIONS = {};

const useScrollPersistence = (screenKey) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !screenKey) return;
    const saved = SCROLL_POSITIONS[screenKey];
    if (saved != null) {
      // Next tick so content has rendered.
      setTimeout(() => { if (ref.current) ref.current.scrollTop = saved; }, 0);
    }
    const el = ref.current;
    const onScroll = () => { if (el) SCROLL_POSITIONS[screenKey] = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [screenKey]);
  return ref;
};

const NAV_ITEMS = [
  { key: "home",        icon: "⌂", label: "Home" },
  { key: "upcoming",    icon: "◈", label: "Soon" },
  { key: "search",      icon: "⌕", label: "Search" },
  { key: "leaderboard", icon: "◆", label: "Board" },
  { key: "profile",     icon: "●", label: "Me" },
];

const NavBar = ({ active, onNav }) => (
  <nav role="tablist" aria-label="Primary navigation" style={{
    height: 58,
    background: "#09090c",
    borderTop: `1px solid ${W.border}`,
    display: "flex", alignItems: "center", justifyContent: "space-around",
    flexShrink: 0,
  }}>
    {NAV_ITEMS.map((item) => {
      const isActive = item.key === active;
      return (
        <TapTarget
          key={item.key}
          role="tab"
          onClick={() => onNav(item.key)}
          label={item.label}
          aria-selected={isActive}
          minTap={false}
          style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 2,
            position: "relative", minWidth: 58, minHeight: 58, padding: "0 4px",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, color: isActive ? W.accent : W.dim }}>{item.icon}</span>
          <span style={{ fontSize: 8, fontFamily: "monospace", color: isActive ? W.accent : W.dim, fontWeight: isActive ? 700 : 400 }}>{item.label}</span>
        </TapTarget>
      );
    })}
  </nav>
);

// Screen layout: scrollable body + sticky bottom nav. Preserves scroll
// position per `scrollKey` (defaults to `active`).
export const ScreenWithNav = ({ children, active, onNav, scrollHandlers, pullIndicator, scrollKey }) => {
  const scrollRef = useScrollPersistence(scrollKey || active);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {pullIndicator}
      <div ref={scrollRef} {...(scrollHandlers || {})} style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {children}
      </div>
      <NavBar active={active} onNav={onNav}/>
    </div>
  );
};
