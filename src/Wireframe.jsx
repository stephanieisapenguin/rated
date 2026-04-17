import { useState } from "react";

const screens = [
  "login",
  "signup",
  "home",
  "movie_detail",
  "reviews",
  "leaderboard",
  "profile",
  "streak",
  "search",
  "trade",
];

const screenLabels = {
  login: "Login",
  signup: "Sign Up",
  home: "Home Feed",
  movie_detail: "Movie Detail",
  reviews: "Notes & Reviews",
  leaderboard: "Leaderboard",
  profile: "My Profile",
  streak: "Weekly Streak",
  search: "Search",
  trade: "Trade / Buy",
};

const W = {
  bg: "#0f0f13",
  card: "#1a1a22",
  card2: "#222230",
  border: "#2c2c3a",
  text: "#ededf2",
  dim: "#6e6e82",
  accent: "#ff3b3b",
  accentDim: "#ff3b3b28",
  green: "#10b981",
  greenDim: "#10b98122",
  gold: "#eab308",
  goldDim: "#eab30822",
  blue: "#3b82f6",
  blueDim: "#3b82f622",
  purple: "#a855f7",
};

const Phone = ({ children, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
    <div
      style={{
        width: 320,
        height: 640,
        background: W.bg,
        borderRadius: 36,
        border: `2.5px solid ${W.border}`,
        overflow: "hidden",
        position: "relative",
        boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px ${W.border}`,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 100, height: 26, background: "#000", borderRadius: "0 0 18px 18px", zIndex: 10 }}>
        <div style={{ width: 8, height: 8, background: "#1a1a22", borderRadius: "50%", position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)" }} />
      </div>
      <div style={{ height: 44, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 24px 4px", fontSize: 11, color: W.dim, fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 0.3 }}>
        <span style={{ fontWeight: 600 }}>9:41</span>
        <span>●●● ▐██▌</span>
      </div>
      <div style={{ height: 596, overflowY: "auto", overflowX: "hidden" }}>{children}</div>
    </div>
    <span style={{ fontSize: 10, color: W.dim, fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
      {label}
    </span>
  </div>
);

const Img = ({ w, h, label, radius = 8, bg, style: extraStyle }) => (
  <div
    style={{
      width: w,
      height: h,
      background: bg || `linear-gradient(135deg, ${W.card} 0%, ${W.card2} 100%)`,
      border: `1px dashed ${W.border}`,
      borderRadius: radius,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      color: W.dim,
      fontFamily: "'SF Mono', monospace",
      flexShrink: 0,
      ...extraStyle,
    }}
  >
    {label}
  </div>
);

const Btn = ({ children, accent, full, small, outline, color }) => (
  <div
    style={{
      background: accent ? (color || W.accent) : outline ? "transparent" : "transparent",
      border: accent ? "none" : `1px solid ${color || W.border}`,
      color: accent ? "#fff" : color || W.dim,
      borderRadius: 12,
      padding: small ? "6px 14px" : "12px 20px",
      fontSize: small ? 10 : 12,
      fontWeight: 700,
      textAlign: "center",
      width: full ? "100%" : "auto",
      fontFamily: "'SF Mono', monospace",
      letterSpacing: 0.5,
    }}
  >
    {children}
  </div>
);

const NavBar = ({ active }) => {
  const items = [
    { key: "home", icon: "⌂", label: "Home" },
    { key: "leaderboard", icon: "◆", label: "Board" },
    { key: "streak", icon: "🔥", label: "Streak" },
    { key: "search", icon: "⌕", label: "Search" },
    { key: "profile", icon: "●", label: "Me" },
  ];
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 58, background: "#09090c", borderTop: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", zIndex: 5 }}>
      {items.map((item) => (
        <div key={item.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer" }}>
          <span style={{ fontSize: 18, color: item.key === active ? W.accent : W.dim, filter: item.key === active ? `drop-shadow(0 0 4px ${W.accent}66)` : "none" }}>{item.icon}</span>
          <span style={{ fontSize: 8, fontFamily: "'SF Mono', monospace", color: item.key === active ? W.accent : W.dim, fontWeight: item.key === active ? 700 : 400, letterSpacing: 0.5 }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const Rating10 = ({ n = 7 }) => (
  <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'SF Mono', monospace" }}>
    <span style={{ color: W.gold }}>{n}</span>
    <span style={{ color: W.dim, fontWeight: 400 }}>/10</span>
  </span>
);

// ── SCREENS ──

const LoginScreen = () => (
  <div style={{ padding: "70px 28px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
    <div>
      <div style={{ fontSize: 36, fontWeight: 900, color: W.accent, fontFamily: "'SF Mono', monospace", letterSpacing: -2, lineHeight: 1 }}>RATED</div>
      <div style={{ fontSize: 11, color: W.dim, marginTop: 6, fontFamily: "'SF Mono', monospace", letterSpacing: 2 }}>YOUR TASTE. RANKED.</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px 16px", fontSize: 12, color: W.dim, fontFamily: "monospace" }}>email@example.com</div>
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px 16px", fontSize: 12, color: W.dim, fontFamily: "monospace" }}>••••••••</div>
      <Btn accent full>SIGN IN</Btn>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
        <div style={{ flex: 1, height: 1, background: W.border }} />
        <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: W.border }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "11px", textAlign: "center", fontSize: 16 }}>G</div>
        <div style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "11px", textAlign: "center", fontSize: 16 }}>🍎</div>
      </div>
    </div>
    <div style={{ textAlign: "center", fontSize: 11, color: W.accent, fontFamily: "monospace", marginTop: 12, letterSpacing: 0.5 }}>
      New here? Create account →
    </div>
  </div>
);

const SignupScreen = () => (
  <div style={{ padding: "50px 28px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace", letterSpacing: -0.5 }}>Create Account</div>
    {["Display Name", "Email", "Password", "Confirm Password"].map((f) => (
      <div key={f} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: W.dim, fontFamily: "monospace" }}>{f}</div>
    ))}
    <Btn accent full>CREATE ACCOUNT</Btn>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, height: 1, background: W.border }} />
      <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>PICK GENRES YOU LOVE</span>
      <div style={{ flex: 1, height: 1, background: W.border }} />
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {["Action", "Horror", "Sci-Fi", "Comedy", "Drama", "Thriller", "Romance", "A24"].map((g, i) => (
        <span key={g} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 10, fontFamily: "monospace", fontWeight: 600, background: i < 3 ? W.accentDim : W.card, border: `1px solid ${i < 3 ? W.accent : W.border}`, color: i < 3 ? W.accent : W.dim }}>{g}</span>
      ))}
    </div>
  </div>
);

const HomeScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "6px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: W.accent, fontFamily: "'SF Mono', monospace", letterSpacing: -1 }}>RATED</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {/* Streak badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: W.goldDim, border: `1px solid ${W.gold}44`, borderRadius: 20, padding: "3px 10px" }}>
          <span style={{ fontSize: 12 }}>🔥</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: W.gold, fontFamily: "monospace" }}>7</span>
        </div>
        <span style={{ fontSize: 16 }}>🔔</span>
      </div>
    </div>
    <div style={{ padding: "10px 22px 70px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Weekly streak CTA */}
      <div style={{ background: `linear-gradient(135deg, ${W.accent}18, ${W.gold}12)`, border: `1px solid ${W.accent}33`, borderRadius: 16, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>🔥 7-week streak!</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>Rate 1 movie this week to keep it</div>
        </div>
        <Btn accent small>RATE →</Btn>
      </div>

      {/* Highlights / Featured */}
      <div style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase" }}>Highlights</div>
      <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
        {[
          { title: "Dune: Part Three", tag: "NEW", year: "2026" },
          { title: "Nosferatu", tag: "TRENDING", year: "2024" },
          { title: "The Brutalist", tag: "HOT", year: "2025" },
        ].map((m, i) => (
          <div key={i} style={{ position: "relative", flexShrink: 0, width: 105 }}>
            <Img w={105} h={148} label="🎬" radius={12} />
            <div style={{ position: "absolute", top: 6, left: 6, background: i === 0 ? W.accent : i === 1 ? W.gold : W.blue, color: "#fff", fontSize: 7, fontWeight: 900, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", letterSpacing: 0.5 }}>{m.tag}</div>
            <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace", lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.year}</div>
          </div>
        ))}
      </div>

      {/* Trailers Section */}
      <div style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>Latest Trailers</div>
      <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
        {["Dune 3", "A24 New"].map((t, i) => (
          <div key={i} style={{ position: "relative", flexShrink: 0 }}>
            <Img w={160} h={90} label="" radius={10} bg={`linear-gradient(135deg, #1a1a28, #2a2a3a)`} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 28, height: 28, background: W.accent, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>▶</div>
            <div style={{ position: "absolute", bottom: 6, left: 8, fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "monospace", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{t}</div>
          </div>
        ))}
      </div>

      {/* Activity */}
      <div style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>Friend Activity</div>
      {[
        { user: "@maya", action: "rated Interstellar ★★★★★", time: "2m" },
        { user: "@josh", action: 'reviewed "absolutely stunning..."', time: "12m" },
        { user: "@lina", action: "hit a 12-week streak 🔥", time: "1h" },
      ].map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${W.border}` }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: W.card, border: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
          <div style={{ flex: 1, fontSize: 11, color: W.text, fontFamily: "monospace", lineHeight: 1.3 }}>
            <span style={{ color: W.accent, fontWeight: 700 }}>{item.user}</span> {item.action}
          </div>
          <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>{item.time}</span>
        </div>
      ))}
    </div>
    <NavBar active="home" />
  </div>
);

const MovieDetailScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    {/* Hero backdrop */}
    <div style={{ position: "relative" }}>
      <Img w="100%" h={180} label="" radius={0} bg={`linear-gradient(180deg, #1a1a28 0%, ${W.bg} 100%)`} />
      <div style={{ position: "absolute", top: 10, left: 16, fontSize: 11, color: W.dim, fontFamily: "monospace" }}>← Back</div>
      {/* Play trailer button */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ width: 44, height: 44, background: `${W.accent}cc`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", boxShadow: `0 0 20px ${W.accent}44` }}>▶</div>
        <span style={{ fontSize: 9, color: "#fff", fontFamily: "monospace", fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.8)", letterSpacing: 0.5 }}>PLAY TRAILER</span>
      </div>
      {/* Poster overlay */}
      <div style={{ position: "absolute", bottom: -40, left: 22 }}>
        <Img w={72} h={100} label="🎬" radius={10} style={{ border: `2px solid ${W.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }} />
      </div>
    </div>
    <div style={{ padding: "48px 22px 70px", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Title + meta */}
      <div>
        <div style={{ fontSize: 18, fontWeight: 900, color: W.text, fontFamily: "'SF Mono', monospace", letterSpacing: -0.5, lineHeight: 1.1 }}>Interstellar</div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>2014 · Christopher Nolan · 2h 49m · PG-13</div>
      </div>
      {/* Ratings row */}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <div style={{ background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>#1</div>
          <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace", letterSpacing: 0.5 }}>RATED RANK</div>
        </div>
        <div style={{ background: W.goldDim, border: `1px solid ${W.gold}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>8.7</div>
          <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace", letterSpacing: 0.5 }}>IMDb</div>
        </div>
        <div style={{ background: W.blueDim, border: `1px solid ${W.blue}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: W.blue, fontFamily: "monospace" }}>1952</div>
          <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace", letterSpacing: 0.5 }}>ELO SCORE</div>
        </div>
        <div style={{ background: W.greenDim, border: `1px solid ${W.green}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: W.green, fontFamily: "monospace" }}>8.5</div>
          <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace", letterSpacing: 0.5 }}>YOUR /10</div>
        </div>
      </div>

      {/* Genre tags */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {["Sci-Fi", "Drama", "Adventure"].map((g) => (
          <span key={g} style={{ padding: "3px 10px", borderRadius: 16, fontSize: 9, fontFamily: "monospace", fontWeight: 600, background: W.card, border: `1px solid ${W.border}`, color: W.dim }}>{g}</span>
        ))}
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginTop: 2 }}>
        A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival. When Earth becomes uninhabitable, a group of...
        <span style={{ color: W.accent, fontWeight: 600 }}> read more</span>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <div style={{ flex: 1 }}><Btn accent full small>★ RATE THIS</Btn></div>
        <div style={{ flex: 1 }}><Btn full small>+ WATCHLIST</Btn></div>
        <div style={{ flex: 1 }}><Btn full small>✎ REVIEW</Btn></div>
      </div>

      {/* Cast */}
      <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1, marginTop: 6, textTransform: "uppercase" }}>Cast & Crew</div>
      <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
        {[{ name: "McConaughey", role: "Cooper" }, { name: "Hathaway", role: "Brand" }, { name: "Chastain", role: "Murph" }, { name: "Caine", role: "Dr. Brand" }].map((c, i) => (
          <div key={i} style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: W.card, border: `1px solid ${W.border}`, margin: "0 auto 3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{c.name}</div>
            <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>{c.role}</div>
          </div>
        ))}
      </div>

      {/* Trailers section */}
      <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1, marginTop: 6, textTransform: "uppercase" }}>Trailers & Clips</div>
      <div style={{ display: "flex", gap: 8, overflow: "hidden" }}>
        {["Official Trailer", "IMAX Featurette"].map((t, i) => (
          <div key={i} style={{ position: "relative", flexShrink: 0 }}>
            <Img w={140} h={78} label="" radius={10} bg={`linear-gradient(135deg, #1c1c2c, #2a2a3a)`} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 22, height: 22, background: `${W.accent}cc`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>▶</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>{t}</div>
          </div>
        ))}
      </div>

      {/* User reviews preview */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>Reviews (47)</span>
        <span style={{ fontSize: 10, color: W.accent, fontFamily: "monospace", fontWeight: 600 }}>See all →</span>
      </div>
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: W.border, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>@maya</span>
          <Rating10 n={10} />
        </div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>
          "This movie fundamentally changed how I think about time. The docking scene is the most tense moment in cinema..."
        </div>
      </div>
    </div>
  </div>
);

const ReviewsScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "8px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: W.dim, fontFamily: "monospace" }}>← Interstellar</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>NOTES & REVIEWS</span>
      <span style={{ width: 60 }} />
    </div>
    {/* Tabs */}
    <div style={{ display: "flex", margin: "0 22px", borderBottom: `1px solid ${W.border}` }}>
      {["Reviews", "My Notes", "Quotes"].map((t, i) => (
        <div key={t} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, color: i === 0 ? W.accent : W.dim, borderBottom: `2px solid ${i === 0 ? W.accent : "transparent"}`, letterSpacing: 0.5 }}>{t}</div>
      ))}
    </div>
    {/* Write review CTA */}
    <div style={{ margin: "10px 22px", background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 18 }}>✎</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Write your review</div>
        <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>Share your take — keep your streak going</div>
      </div>
    </div>
    {/* Sort */}
    <div style={{ padding: "4px 22px", display: "flex", gap: 6 }}>
      {["Top", "Recent", "Friends"].map((f, i) => (
        <span key={f} style={{ padding: "3px 10px", borderRadius: 16, fontSize: 9, fontFamily: "monospace", fontWeight: 600, background: i === 0 ? W.accentDim : W.card, border: `1px solid ${i === 0 ? W.accent : W.border}`, color: i === 0 ? W.accent : W.dim }}>{f}</span>
      ))}
    </div>
    {/* Reviews list */}
    <div style={{ padding: "8px 22px 70px", display: "flex", flexDirection: "column", gap: 10 }}>
      {[
        { user: "@maya", rating: 10, text: "This movie fundamentally changed how I think about time. The docking scene is the most tense moment in cinema history.", likes: 234, time: "2d" },
        { user: "@josh", rating: 8, text: "Nolan at his most ambitious. The science is surprisingly accurate and the emotional core with Murphy hits differently as a parent.", likes: 89, time: "1w" },
        { user: "@lina", rating: 9, text: "Hans Zimmer's organ score is transcendent. Watch this in IMAX or don't watch it at all.", likes: 156, time: "2w" },
      ].map((r, i) => (
        <div key={i} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: W.border, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{r.user}</span>
                <div><Rating10 n={r.rating} /></div>
              </div>
            </div>
            <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{r.time}</span>
          </div>
          <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>{r.text}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: W.dim, fontFamily: "monospace" }}>
            <span>♥ {r.likes}</span>
            <span>↩ Reply</span>
            <span>⚑ Flag</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const LeaderboardScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "8px 22px 6px", fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>◆ LEADERBOARD</div>
    <div style={{ display: "flex", gap: 0, padding: "0 22px 8px" }}>
      {["Overall", "Genre", "Director", "Decade"].map((t, i) => (
        <div key={t} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, color: i === 0 ? W.accent : W.dim, borderBottom: `2px solid ${i === 0 ? W.accent : "transparent"}` }}>{t}</div>
      ))}
    </div>
    <div style={{ padding: "0 22px 70px", display: "flex", flexDirection: "column", gap: 5 }}>
      {[
        { rank: 1, title: "Interstellar", year: 2014, elo: 1952, medal: "🥇", dir: "Nolan" },
        { rank: 2, title: "Blade Runner 2049", year: 2017, elo: 1870, medal: "🥈", dir: "Villeneuve" },
        { rank: 3, title: "Parasite", year: 2019, elo: 1845, medal: "🥉", dir: "Bong" },
        { rank: 4, title: "The Dark Knight", year: 2008, elo: 1823, medal: "", dir: "Nolan" },
        { rank: 5, title: "There Will Be Blood", year: 2007, elo: 1801, medal: "", dir: "PTA" },
        { rank: 6, title: "Arrival", year: 2016, elo: 1792, medal: "", dir: "Villeneuve" },
        { rank: 7, title: "No Country", year: 2007, elo: 1780, medal: "", dir: "Coens" },
        { rank: 8, title: "Whiplash", year: 2014, elo: 1768, medal: "", dir: "Chazelle" },
      ].map((m) => (
        <div key={m.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: m.rank <= 3 ? `${W.accent}08` : "transparent", borderRadius: 10, border: `1px solid ${m.rank <= 3 ? `${W.accent}22` : W.border}` }}>
          <span style={{ width: 22, fontSize: m.medal ? 15 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", textAlign: "center" }}>
            {m.medal || m.rank}
          </span>
          <Img w={32} h={44} label="" radius={6} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.year} · {m.dir}</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: W.gold, fontFamily: "monospace" }}>{m.elo}</div>
        </div>
      ))}
    </div>
    <NavBar active="leaderboard" />
  </div>
);

const ProfileScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "8px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>MY PROFILE</span>
      <span style={{ fontSize: 14 }}>⚙</span>
    </div>
    <div style={{ padding: "0 22px", display: "flex", gap: 14, alignItems: "center" }}>
      <div style={{ width: 54, height: 54, borderRadius: "50%", background: W.card, border: `2px solid ${W.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>👤</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 900, color: W.text, fontFamily: "'SF Mono', monospace" }}>@jasonk</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 12 }}>🔥</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: W.gold, fontFamily: "monospace" }}>7-week streak</span>
        </div>
      </div>
    </div>
    <div style={{ display: "flex", padding: "14px 22px", gap: 0 }}>
      {[{ n: "89", l: "Rated" }, { n: "23", l: "Reviews" }, { n: "34", l: "Following" }, { n: "128", l: "Followers" }].map((s, i) => (
        <div key={i} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>{s.n}</div>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{s.l}</div>
        </div>
      ))}
    </div>
    {/* Tabs */}
    <div style={{ display: "flex", borderBottom: `1px solid ${W.border}`, margin: "0 22px" }}>
      {["Rankings", "Reviews", "Watchlist", "Notes"].map((t, i) => (
        <div key={t} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, color: i === 0 ? W.accent : W.dim, borderBottom: `2px solid ${i === 0 ? W.accent : "transparent"}` }}>{t}</div>
      ))}
    </div>
    <div style={{ padding: "10px 22px 70px", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>YOUR TOP RANKED</div>
      {["Interstellar", "Blade Runner 2049", "The Dark Knight", "Parasite", "Whiplash"].map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: W.card, borderRadius: 10, border: `1px solid ${W.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: W.accent, fontFamily: "monospace", width: 18 }}>{i + 1}</span>
          <Img w={28} h={38} label="" radius={4} />
          <span style={{ fontSize: 11, color: W.text, fontFamily: "monospace", flex: 1 }}>{m}</span>
          <Rating10 n={[10, 9, 9, 8, 8][i]} />
        </div>
      ))}
    </div>
    <NavBar active="profile" />
  </div>
);

const StreakScreen = () => {
  const weeks = [
    { week: "W1", done: true, count: 1 },
    { week: "W2", done: true, count: 1 },
    { week: "W3", done: true, count: 1 },
    { week: "W4", done: true, count: 1 },
    { week: "W5", done: true, count: 1 },
    { week: "W6", done: true, count: 1 },
    { week: "W7", done: true, count: 1 },
    { week: "W8", done: false, count: 0, current: true },
  ];
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div style={{ padding: "8px 22px 6px", fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>🔥 WEEKLY STREAK</div>
      <div style={{ padding: "0 22px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Big streak count */}
        <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: W.gold, fontFamily: "'SF Mono', monospace", lineHeight: 1, textShadow: `0 0 40px ${W.gold}33` }}>7</div>
          <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", letterSpacing: 2, marginTop: 4 }}>WEEK STREAK</div>
          <div style={{ fontSize: 10, color: W.gold, fontFamily: "monospace", marginTop: 2 }}>🔥 Rate 1 movie this week to keep it!</div>
        </div>

        {/* Week grid */}
        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 32 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: w.current ? W.accentDim : w.done ? W.goldDim : W.card,
                border: `2px solid ${w.current ? W.accent : w.done ? W.gold : W.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: w.done && !w.current ? 12 : 10,
                color: w.current ? W.accent : w.done ? W.gold : W.dim,
                fontWeight: 800, fontFamily: "monospace",
              }}>
                {w.done && !w.current ? "✓" : w.count}
              </div>
              <span style={{ fontSize: 8, color: w.current ? W.accent : W.dim, fontFamily: "monospace", fontWeight: w.current ? 700 : 400 }}>{w.week}</span>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", marginBottom: 8 }}>How Streaks Work</div>
          {[
            { icon: "⭐", text: "Rate at least 1 movie per week" },
            { icon: "🔥", text: "Streaks reset Monday 12am your time" },
            { icon: "🏆", text: "Hit 10 weeks → unlock Gold Badge" },
            { icon: "💎", text: "Hit 52 weeks → unlock Diamond Status" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0" }}>
              <span style={{ fontSize: 14 }}>{r.icon}</span>
              <span style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>{r.text}</span>
            </div>
          ))}
        </div>

        {/* This week's activity */}
        <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>This Week</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: W.greenDim, border: `1px solid ${W.green}33`, borderRadius: 10, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: W.green, fontFamily: "monospace" }}>0</div>
            <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>RATED</div>
          </div>
          <div style={{ flex: 1, background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 10, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>1</div>
            <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>NEEDED</div>
          </div>
        </div>

        {/* Leaderboard of streaks */}
        <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "'SF Mono', monospace", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>Streak Leaders</div>
        {[
          { user: "@cinephile99", streak: 34, badge: "💎" },
          { user: "@maya", streak: 12, badge: "🏆" },
          { user: "@jasonk", streak: 7, badge: "🔥", you: true },
          { user: "@josh", streak: 4, badge: "" },
        ].map((u, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: u.you ? W.accentDim : "transparent", borderRadius: 8, border: `1px solid ${u.you ? W.accent + "33" : W.border}` }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: W.dim, fontFamily: "monospace", width: 16 }}>{i + 1}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: u.you ? W.accent : W.text, fontFamily: "monospace", flex: 1 }}>
              {u.user} {u.you && <span style={{ fontSize: 8, color: W.dim }}>(you)</span>}
            </span>
            <span style={{ fontSize: 12 }}>{u.badge}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: W.gold, fontFamily: "monospace" }}>{u.streak}w</span>
          </div>
        ))}
      </div>
      <NavBar active="streak" />
    </div>
  );
};

const SearchScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "8px 22px 6px" }}>
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 12, color: W.dim, fontFamily: "monospace", display: "flex", gap: 8 }}>⌕ <span>Search movies, people...</span></div>
    </div>
    <div style={{ display: "flex", gap: 6, padding: "8px 22px" }}>
      {["Movies", "Directors", "Actors"].map((t, i) => (
        <span key={t} style={{ padding: "4px 14px", borderRadius: 16, fontSize: 10, fontFamily: "monospace", fontWeight: 600, background: i === 0 ? W.accentDim : W.card, border: `1px solid ${i === 0 ? W.accent : W.border}`, color: i === 0 ? W.accent : W.dim }}>{t}</span>
      ))}
    </div>
    <div style={{ padding: "4px 22px 4px" }}>
      <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>TRENDING</div>
    </div>
    <div style={{ padding: "0 22px", display: "flex", flexDirection: "column", gap: 5 }}>
      {["Dune: Part Three", "A24 Films", "Christopher Nolan", "Horror 2025", "IMAX Releases"].map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${W.border}` }}>
          <span style={{ fontSize: 11, color: W.dim }}>🔥</span>
          <span style={{ fontSize: 12, color: W.text, fontFamily: "monospace", flex: 1 }}>{s}</span>
          <span style={{ fontSize: 10, color: W.dim }}>→</span>
        </div>
      ))}
    </div>
    <div style={{ padding: "14px 22px 6px" }}>
      <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>BROWSE</div>
    </div>
    <div style={{ padding: "0 22px", display: "flex", flexWrap: "wrap", gap: 6 }}>
      {["🎭 Drama", "🚀 Sci-Fi", "😱 Horror", "😂 Comedy", "💥 Action", "🎨 A24", "🎬 Nolan", "🏆 Oscars"].map((c) => (
        <span key={c} style={{ padding: "7px 14px", borderRadius: 10, fontSize: 10, fontFamily: "monospace", fontWeight: 600, background: W.card, border: `1px solid ${W.border}`, color: W.dim }}>{c}</span>
      ))}
    </div>
    <NavBar active="search" />
  </div>
);

const TradeScreen = () => (
  <div style={{ position: "relative", height: "100%" }}>
    <div style={{ padding: "8px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: W.dim, fontFamily: "monospace" }}>← Back</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "'SF Mono', monospace" }}>TICKET DETAILS</span>
      <span style={{ width: 40 }} />
    </div>
    <div style={{ padding: "0 22px", display: "flex", flexDirection: "column", gap: 10 }}>
      <Img w="100%" h={130} label="🎬 Movie Poster" radius={14} />
      <div>
        <div style={{ fontSize: 17, fontWeight: 900, color: W.text, fontFamily: "'SF Mono', monospace", letterSpacing: -0.5 }}>Dune: Part Three</div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>AMC Lincoln Square · IMAX</div>
        <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>Friday, Apr 4 · 7:30 PM · Seat J-14</div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: W.greenDim, border: `1px solid ${W.green}33`, borderRadius: 12, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: W.green, fontFamily: "monospace" }}>$18</div>
          <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>ASKING</div>
        </div>
        <div style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 10, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>$22</div>
          <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>FACE VALUE</div>
        </div>
      </div>
      {/* Seller */}
      <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👤</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>@maya</span>
            <span style={{ background: W.green, color: "#fff", fontSize: 7, padding: "1px 5px", borderRadius: 3, fontWeight: 800, fontFamily: "monospace" }}>VERIFIED</span>
          </div>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>47 sales · 4.9 ★ · 0 disputes</div>
        </div>
      </div>
      <Btn accent full>BUY NOW — $18</Btn>
      <Btn full>MAKE AN OFFER</Btn>
      <Btn full>OFFER A TRADE</Btn>
    </div>
  </div>
);

const screenComponents = {
  login: LoginScreen,
  signup: SignupScreen,
  home: HomeScreen,
  movie_detail: MovieDetailScreen,
  reviews: ReviewsScreen,
  leaderboard: LeaderboardScreen,
  profile: ProfileScreen,
  streak: StreakScreen,
  search: SearchScreen,
  trade: TradeScreen,
};

export default function RatedWireframesV2() {
  const [active, setActive] = useState("home");
  const Screen = screenComponents[active];

  return (
    <div style={{ minHeight: "100vh", background: "#08080b", padding: "20px 12px 40px", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: W.accent, fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: -1, margin: 0, textShadow: `0 0 30px ${W.accent}33` }}>RATED</h1>
        <p style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", margin: "4px 0 0", letterSpacing: 3 }}>WIREFRAMES V2 — {screens.length} SCREENS</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 20, maxWidth: 640, margin: "0 auto 20px" }}>
        {screens.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            style={{
              padding: "5px 11px",
              borderRadius: 8,
              fontSize: 9,
              fontFamily: "'SF Mono', monospace",
              fontWeight: 700,
              cursor: "pointer",
              border: `1px solid ${active === s ? W.accent : W.border}`,
              background: active === s ? W.accentDim : "transparent",
              color: active === s ? W.accent : W.dim,
              transition: "all 0.15s",
              letterSpacing: 0.3,
            }}
          >
            {screenLabels[s]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <Phone label={screenLabels[active]}>
          <Screen />
        </Phone>
      </div>

      <div style={{ maxWidth: 400, margin: "16px auto 0", textAlign: "center" }}>
        <p style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, letterSpacing: 0.3 }}>
          Tap labels above to navigate · 11 screens
        </p>
      </div>
    </div>
  );
}
