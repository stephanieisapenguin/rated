import { useEffect, useState } from "react";

import { PullIndicator } from "../components/PullIndicator";
import { Poster } from "../components/Poster";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { usePullToRefresh } from "../lib/hooks";
import { ALL_GENRES, UPCOMING } from "../lib/mockData";
import { daysUntil } from "../lib/time";
import { tmdbUpcoming } from "../lib/tmdb";
import { W } from "../theme";

export const UpcomingScreen = ({ onNav, onSelectUpcoming, watchlist, onToggleWatchlist }) => {
  const [genre, setGenre] = useState("All");
  // Fetch upcoming films from TMDB; fall back to hardcoded UPCOMING if unavailable.
  const [tmdbUpcomingMovies, setTmdbUpcomingMovies] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0); // bump to re-fetch
  useEffect(() => {
    let cancelled = false;
    tmdbUpcoming().then((data) => { if (!cancelled && data && data.length > 0) setTmdbUpcomingMovies(data); });
    return () => { cancelled = true; };
  }, [refreshNonce]);

  const handleRefresh = async () => {
    setRefreshNonce((n) => n + 1);
    await new Promise((r) => setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  const source = tmdbUpcomingMovies || UPCOMING;
  const filtered = [...source]
    .filter((u) => genre === "All" || (u.genres || []).some((g) => g.name === genre))
    .sort((a, b) => (daysUntil(a.release_date) || 0) - (daysUntil(b.release_date) || 0));

  return (
    <ScreenWithNav active="upcoming" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{ padding: "8px 22px 6px", fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>◈ UPCOMING · MUST SEE</div>
      <div style={{ display: "flex", gap: 6, padding: "0 22px 10px", overflowX: "auto" }}>
        {ALL_GENRES.map((g) => (
          <span key={g} onClick={() => setGenre(g)} style={{
            flexShrink: 0, padding: "4px 12px", borderRadius: 16,
            fontSize: 9, fontFamily: "monospace", fontWeight: 600, cursor: "pointer",
            background: genre === g ? W.accentDim : W.card,
            border: `1px solid ${genre === g ? W.accent : W.border}`,
            color: genre === g ? W.accent : W.dim,
          }}>{g}</span>
        ))}
      </div>
      <div style={{ padding: "0 22px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: W.dim, fontFamily: "monospace", fontSize: 11 }}>No upcoming {genre} films</div>}
        {filtered.map((u) => (
          <div key={u.id} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", gap: 12, cursor: "pointer" }} onClick={() => onSelectUpcoming(u)}>
              <Poster url={u.poster_url} title={u.title} w={56} h={78} radius={8}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>{u.title}</span>
                </div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>
                  {u.directors?.[0]?.name || (u.genres?.[0]?.name)} · {u.genres?.map((g) => g.name).filter(Boolean).join(", ")}
                </div>
                {u.must_see_reason && <div style={{ fontSize: 10, color: W.gold, fontFamily: "monospace", marginTop: 4 }}>{u.must_see_reason}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace" }}>📅 {u.release_date}</div>
                  <div style={{ fontSize: 10, color: W.accent, fontFamily: "monospace", fontWeight: 700 }}>
                    {(() => { const d = daysUntil(u.release_date); return d > 0 ? `${d}d away` : d === 0 ? "TODAY" : "Released"; })()}
                  </div>
                </div>
                {(u.watchlist_count || u.anticipation_score) && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>
                  {u.watchlist_count ? `👀 ${u.watchlist_count.toLocaleString()} watching` : ""}
                  {u.watchlist_count && u.anticipation_score ? " · " : ""}
                  {u.anticipation_score ? `📊 ${u.anticipation_score} hype` : ""}
                </div>}
              </div>
            </div>
            <div style={{ marginTop: 10 }} onClick={() => onToggleWatchlist(u.id)}>
              <div style={{
                background: watchlist.has(u.id) ? W.blueDim : W.accent,
                border: watchlist.has(u.id) ? `1px solid ${W.blue}` : "none",
                color: watchlist.has(u.id) ? W.blue : "#fff",
                borderRadius: 10, padding: "7px 0", fontSize: 9, fontWeight: 700,
                textAlign: "center", fontFamily: "monospace", cursor: "pointer",
              }}>{watchlist.has(u.id) ? "◆ IN WATCHLIST" : "+ WATCHLIST"}</div>
            </div>
          </div>
        ))}
      </div>
    </ScreenWithNav>
  );
};
