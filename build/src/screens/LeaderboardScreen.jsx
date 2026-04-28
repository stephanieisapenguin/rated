import { useEffect, useState } from "react";

import { Poster } from "../components/Poster";
import { PullIndicator } from "../components/PullIndicator";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { usePullToRefresh } from "../lib/hooks";
import { MOVIES, USER_PROFILES } from "../lib/mockData";
import { TMDB_ENABLED, tmdbTopRated } from "../lib/tmdb";
import { W } from "../theme";

export const LeaderboardScreen = ({
  onNav, onSelectMovie, onSelectUser,
  username = "", displayName = "",
  blockedUsers = new Set(),
  myRankedCount = 0, myStreak = 0,
}) => {
  const [tab, setTab] = useState("global");
  const youLabel = displayName ? displayName : username ? `@${username}` : "@you";
  const youHandle = username ? `@${username}` : "@you";
  const youAvatar = (displayName || username || "Y")[0].toUpperCase();

  // Build the leaderboard from USER_PROFILES (single source of truth) and
  // splice in the current user with their real ranked count.
  const otherUsers = Object.entries(USER_PROFILES)
    .filter(([handle]) => handle !== youHandle)
    .map(([handle, p]) => ({ user: handle, avatar: p.avatar, movies_rated: p.movies_rated, streak: p.streak, badge: p.badge }));

  const allUsers = [
    ...otherUsers,
    { user: youHandle, avatar: youAvatar, label: youLabel, movies_rated: myRankedCount, streak: myStreak, badge: myRankedCount >= 50 ? "🔥" : "", isYou: true },
  ];
  const GLOBAL = allUsers
    .sort((a, b) => b.movies_rated - a.movies_rated)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  const FM = [
    { rank: 1, title: "Interstellar",    movie_id: "m-001", avg_rating: 9.4, rated_by: ["@maya", "@josh"],   rated_count: 3 },
    { rank: 2, title: "Parasite",        movie_id: "m-002", avg_rating: 9.1, rated_by: ["@maya", "@carlos"], rated_count: 2 },
    { rank: 3, title: "The Dark Knight", movie_id: "m-003", avg_rating: 8.8, rated_by: ["@josh", "@lina"],   rated_count: 3 },
    { rank: 4, title: "Whiplash",        movie_id: "m-004", avg_rating: 8.7, rated_by: ["@maya"],            rated_count: 1 },
    { rank: 5, title: "RRR",             movie_id: "m-005", avg_rating: 8.4, rated_by: ["@carlos", "@lina"], rated_count: 2 },
  ];

  // Top-rated globally — from TMDB. Lazy-loaded when the user selects the tab.
  const [tmdbTopRatedMovies, setTmdbTopRatedMovies] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    if (tab !== "toprated") return;
    let cancelled = false;
    tmdbTopRated().then((data) => { if (!cancelled && data) setTmdbTopRatedMovies(data); });
    return () => { cancelled = true; };
  }, [tab, refreshNonce]);
  const TOP_RATED = tmdbTopRatedMovies ? tmdbTopRatedMovies.slice(0, 20) : [];

  const handleRefresh = async () => {
    setTmdbTopRatedMovies(null);
    setRefreshNonce((n) => n + 1);
    await new Promise((r) => setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  return (
    <ScreenWithNav active="leaderboard" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{ padding: "8px 22px 6px", fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>◆ LEADERBOARD</div>
      <div style={{ display: "flex", margin: "0 22px", borderBottom: `1px solid ${W.border}` }}>
        {[
          { key: "global", label: "Most Rated" },
          { key: "friends", label: "Friends' Picks" },
          ...(TMDB_ENABLED ? [{ key: "toprated", label: "Top Rated" }] : []),
        ].map((t) => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, color: tab === t.key ? W.accent : W.dim, borderBottom: `2px solid ${tab === t.key ? W.accent : "transparent"}`, cursor: "pointer" }}>{t.label}</div>
        ))}
      </div>
      <div style={{ padding: "10px 22px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {tab === "global" && GLOBAL.filter((u) => u.isYou || !blockedUsers.has(u.user)).map((u) => (
          <div key={u.rank} onClick={() => !u.isYou && onSelectUser && onSelectUser(u.user)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: u.isYou ? W.accentDim : u.rank <= 3 ? `${W.gold}08` : W.card, borderRadius: 10, border: `1px solid ${u.isYou ? W.accent + "33" : u.rank <= 3 ? W.gold + "22" : W.border}`, cursor: u.isYou ? "default" : "pointer" }}>
            <span style={{ width: 20, fontSize: u.rank <= 3 ? 14 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", textAlign: "center" }}>{u.rank <= 3 ? ["🥇", "🥈", "🥉"][u.rank - 1] : u.rank}</span>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{u.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: u.isYou ? W.accent : W.text, fontFamily: "monospace" }}>{u.isYou ? (u.label || u.user) : u.user}</span>
                {u.isYou && <span style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>(you)</span>}
                {u.badge && <span>{u.badge}</span>}
              </div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{u.streak > 0 && `🔥 ${u.streak}w streak`}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>{u.movies_rated.toLocaleString()}</div>
              <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>FILMS</div>
            </div>
          </div>
        ))}
        {tab === "friends" && FM.map((m) => {
          const movie = MOVIES.find((c) => c.id === m.movie_id);
          return (
            <div key={m.rank} onClick={() => movie && onSelectMovie(movie)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: m.rank <= 3 ? `${W.accent}08` : W.card, borderRadius: 10, border: `1px solid ${m.rank <= 3 ? W.accent + "22" : W.border}`, cursor: "pointer" }}>
              <span style={{ width: 20, fontSize: m.rank <= 3 ? 14 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", textAlign: "center" }}>{m.rank <= 3 ? ["🥇", "🥈", "🥉"][m.rank - 1] : m.rank}</span>
              <Poster url={movie?.poster_url} title={movie?.title} w={32} h={44} radius={6}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{m.title}</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>Rated by {m.rated_by.slice(0, 2).join(", ")}{m.rated_count > 2 && ` +${m.rated_count - 2} more`}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>★ {m.avg_rating}</div>
                <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>AVG</div>
              </div>
            </div>
          );
        })}
        {tab === "toprated" && TOP_RATED.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: W.dim, fontFamily: "monospace", fontSize: 11 }}>Loading top rated films...</div>}
        {tab === "toprated" && TOP_RATED.map((movie, i) => {
          const rank = i + 1;
          return (
            <div key={movie.id} onClick={() => onSelectMovie(movie)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: rank <= 3 ? `${W.accent}08` : W.card, borderRadius: 10, border: `1px solid ${rank <= 3 ? W.accent + "22" : W.border}`, cursor: "pointer" }}>
              <span style={{ width: 20, fontSize: rank <= 3 ? 14 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", textAlign: "center" }}>{rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}</span>
              <Poster url={movie.poster_url} title={movie.title} w={32} h={44} radius={6}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{movie.release_year}{movie.user_rating_count ? ` · ${movie.user_rating_count.toLocaleString()} votes` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>★ {movie.avg_user_rating}</div>
                <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>TMDB</div>
              </div>
            </div>
          );
        })}
      </div>
    </ScreenWithNav>
  );
};
