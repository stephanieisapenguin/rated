import { useState } from "react";

import { Badge } from "../components/Badge";
import { DraggableList } from "../components/DraggableList";
import { Poster } from "../components/Poster";
import { PullIndicator } from "../components/PullIndicator";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { ShareIcon } from "../components/ShareIcon";
import { SwipeableRow } from "../components/SwipeableRow";
import { TapTarget } from "../components/TapTarget";
import { haptic } from "../lib/haptic";
import { usePullToRefresh } from "../lib/hooks";
import { MOCK_FRIENDS, MOVIES, UPCOMING, USER_PROFILES } from "../lib/mockData";
import { daysUntil, formatReleaseDate } from "../lib/time";
import { findMovieSync } from "../lib/tmdb";
import { W } from "../theme";
import { ReviewModal } from "./ReviewModal";

export const ProfileScreen = ({
  onNav, onSelectMovie, rankedIds, eloScores,
  watchlist, onSelectUpcoming, onToggleWatchlist,
  username, displayName, userBio, profilePic, isPrivate,
  onOpenSettings,
  rateLimitedFollow,
  followingHandles = new Set(), toggleFollowHandle,
  approvedFollowers = new Set(),
  userReviews = [], onUnrank, onReorderRanking, onReRank,
  savedMovies = new Set(), toggleSavedMovie,
  onEditReview, onDeleteReview,
  showToast, streakInfo = { count: 0, status: "none" },
}) => {
  const [tab, setTab] = useState("rankings");
  const [rankingsSort, setRankingsSort] = useState("ranked");
  const [showRankingsSort, setShowRankingsSort] = useState(false);
  const [editingRankings, setEditingRankings] = useState(false);
  const [unrankConfirm, setUnrankConfirm] = useState(null);
  const [socialModal, setSocialModal] = useState(null);
  const [showImportInfo, setShowImportInfo] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [savedGenreFilter, setSavedGenreFilter] = useState("All");
  const [savedSort, setSavedSort] = useState("default");
  const [showSavedSort, setShowSavedSort] = useState(false);
  // Following count derives from the shared followingHandles set so it stays
  // in sync with follows/unfollows triggered anywhere in the app.
  const followingCount = followingHandles.size;
  // Followers = mock friends who follow you, mutuals from your following, plus
  // anyone whose follow request you approved.
  const mockFollowers = new Set(MOCK_FRIENDS.filter((f) => f.follows_me || followingHandles.has(`@${f.username}`)).map((f) => `@${f.username}`));
  approvedFollowers.forEach((h) => mockFollowers.add(h));
  const followersCount = mockFollowers.size;
  const [reviewBeingEdited, setReviewBeingEdited] = useState(null);
  const [reviewMenuOpen, setReviewMenuOpen] = useState(null);
  const [reviewPendingDelete, setReviewPendingDelete] = useState(null);
  const savedMovieObjects = MOVIES.filter((m) => savedMovies.has(m.id));
  const removeSaved = (id) => { haptic("medium"); toggleSavedMovie && toggleSavedMovie(id); };

  const watchlistMovies = UPCOMING.filter((u) => watchlist.has(u.id));
  const totalSaved = savedMovieObjects.length + watchlistMovies.length;

  const MOCK_REVIEWS = [
    { id: "rv-003", movie_id: "m-003", movie_title: "The Dark Knight", poster_url: MOVIES.find((m) => m.id === "m-003")?.poster_url, rating: 10, text: "Heath Ledger's Joker is one of the greatest performances ever committed to film. Every scene crackles with menace. Nolan at his absolute peak.", time: "2h ago" },
    { id: "rv-001", movie_id: "m-001", movie_title: "Interstellar",    poster_url: MOVIES.find((m) => m.id === "m-001")?.poster_url, rating: 9,  text: "The third act loses me a bit but the docking scene and Hans Zimmer's score are genuinely transcendent. McConaughey carries this film.",        time: "3d ago" },
    { id: "rv-002", movie_id: "m-002", movie_title: "Parasite",        poster_url: MOVIES.find((m) => m.id === "m-002")?.poster_url, rating: 10, text: "A masterpiece of genre-blending. The way Bong Joon-ho shifts tone without you ever noticing is pure craft. Second watch is even better.",     time: "1w ago" },
  ];

  const allRankings = rankedIds.map((id) => findMovieSync(id)).filter(Boolean);

  const savedGenres = ["All", ...new Set(savedMovieObjects.flatMap((m) => m.genres?.map((g) => g.name) || []))];
  const filteredSaved = savedGenreFilter === "All" ? savedMovieObjects : savedMovieObjects.filter((m) => m.genres?.some((g) => g.name === savedGenreFilter));
  const sortedSaved = [...filteredSaved].sort((a, b) => {
    if (savedSort === "alpha") return a.title.localeCompare(b.title);
    if (savedSort === "popular") return (b.avg_user_rating || 0) - (a.avg_user_rating || 0);
    if (savedSort === "unpopular") return (a.avg_user_rating || 0) - (b.avg_user_rating || 0);
    return 0;
  });

  // Pull-to-refresh — no backend yet, just animates so the gesture feedback
  // matches the rest of the app.
  const handleRefresh = async () => { await new Promise((r) => setTimeout(r, 700)); };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  return (
    <ScreenWithNav active="profile" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      {showShareModal && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }} onClick={() => setShowShareModal(false)}>
        <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 18, padding: "22px 20px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>👤</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>{displayName || `@${username}`}</div>
            {displayName && <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>@{username}</div>}
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>rated.app/{username}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { icon: "🔗", label: "Copy Profile Link", action: () => { navigator.clipboard?.writeText(`https://rated.app/${username}`); setShowShareModal(false); } },
              { icon: <ShareIcon size={18} color={W.text}/>, label: "Share via...", action: () => { navigator.share?.({ title: `${username} on RATED`, url: `https://rated.app/${username}` }); setShowShareModal(false); } },
            ].map((o) => (
              <div key={o.label} onClick={o.action} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: W.bg, borderRadius: 12, border: `1px solid ${W.border}`, cursor: "pointer" }}>
                <span style={{ fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", width: 24 }}>{o.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: W.text, fontFamily: "monospace" }}>{o.label}</span>
              </div>
            ))}
          </div>
          <div onClick={() => setShowShareModal(false)} style={{ marginTop: 12, padding: "10px", textAlign: "center", fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>Cancel</div>
        </div>
      </div>}

      {showImportInfo && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }} onClick={() => setShowImportInfo(false)}>
        <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 18, padding: "22px 20px", maxHeight: "75%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>📥 HOW TO IMPORT</div>
            <div onClick={() => setShowImportInfo(false)} style={{ fontSize: 18, color: W.dim, cursor: "pointer" }}>✕</div>
          </div>
          {[
            { name: "Letterboxd", icon: "🎬", steps: ["Go to letterboxd.com → Settings", "Click Import & Export", "Click Export Your Data", "Download the ZIP and open diary.csv", "Tap IMPORT → on Rated and upload the CSV"] },
            { name: "IMDb",       icon: "⭐", steps: ["Go to imdb.com → Your Ratings", "Click the 3-dot menu → Export", "Download the CSV file", "Tap IMPORT → on Rated and upload it"] },
            { name: "Trakt",      icon: "📺", steps: ["Go to trakt.tv → Settings → Data", "Click Export Data", "Download history.json", "Tap IMPORT → on Rated and upload it"] },
            { name: "Netflix",    icon: "🔴", steps: ["Go to netflix.com → Account", "Click Get My Info under Privacy", "Download ViewingActivity.csv", "Tap IMPORT → on Rated and upload it"] },
          ].map((src, si) => (
            <div key={src.name} style={{ marginBottom: si < 3 ? 16 : 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{src.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>{src.name}</span>
              </div>
              {src.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                  <span style={{ fontSize: 9, color: W.accent, fontFamily: "monospace", fontWeight: 700, flexShrink: 0, minWidth: 14 }}>{i + 1}.</span>
                  <span style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.5 }}>{step}</span>
                </div>
              ))}
            </div>
          ))}
          <div onClick={() => setShowImportInfo(false)} style={{ marginTop: 16, background: W.accent, borderRadius: 10, padding: "9px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", cursor: "pointer" }}>GOT IT</div>
        </div>
      </div>}

      {socialModal && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setSocialModal(null)}>
        <div style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "20px 22px 32px", maxHeight: "70%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>{socialModal === "following" ? `FOLLOWING · ${followingCount}` : `FOLLOWERS · ${followersCount}`}</div>
            <div onClick={() => setSocialModal(null)} style={{ fontSize: 18, color: W.dim, cursor: "pointer" }}>✕</div>
          </div>
          {(() => {
            // Build the unified list. Each row needs: handle, avatar, movies_rated.
            let handles;
            if (socialModal === "following") {
              handles = Array.from(followingHandles);
            } else {
              const fHandles = new Set();
              MOCK_FRIENDS.forEach((f) => {
                if (f.follows_me || followingHandles.has(`@${f.username}`)) fHandles.add(`@${f.username}`);
              });
              approvedFollowers.forEach((h) => fHandles.add(h));
              handles = Array.from(fHandles);
            }
            return handles.map((handle) => {
              const friend = MOCK_FRIENDS.find((f) => `@${f.username}` === handle);
              const prof = USER_PROFILES[handle];
              const avatar = friend?.avatar || prof?.avatar || handle[1]?.toUpperCase() || "?";
              const ranked = prof?.movies_rated || 0;
              const isFollowing = followingHandles.has(handle);
              const row = (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: W.card, borderBottom: `1px solid ${W.border}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{handle}</div>
                    <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{ranked} films ranked</div>
                  </div>
                  <div onClick={() => {
                      if (!isFollowing && rateLimitedFollow) rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(handle));
                      else toggleFollowHandle && toggleFollowHandle(handle);
                    }}
                    style={{
                      padding: "4px 10px", borderRadius: 10, fontSize: 9, fontWeight: 700, fontFamily: "monospace", cursor: "pointer",
                      background: isFollowing ? W.accentDim : W.card,
                      border: `1px solid ${isFollowing ? W.accent : W.border}`,
                      color: isFollowing ? W.accent : W.dim,
                    }}>
                    {isFollowing ? "FOLLOWING" : "+ FOLLOW"}
                  </div>
                </div>
              );
              // Only the Following tab gets swipe-to-unfollow. Skip on Followers.
              if (socialModal === "following" && isFollowing) {
                return (
                  <SwipeableRow key={handle} actions={[
                    { icon: "✕", label: "Unfollow", color: W.accent, onPress: () => toggleFollowHandle && toggleFollowHandle(handle) },
                  ]}>
                    {row}
                  </SwipeableRow>
                );
              }
              return <div key={handle}>{row}</div>;
            });
          })()}
          {(socialModal === "following" && followingCount === 0) && <div style={{ textAlign: "center", padding: "24px 0", color: W.dim, fontSize: 11, fontFamily: "monospace" }}>You're not following anyone yet</div>}
          {(socialModal === "followers" && followersCount === 0) && <div style={{ textAlign: "center", padding: "24px 0", color: W.dim, fontSize: 11, fontFamily: "monospace" }}>No followers yet</div>}
        </div>
      </div>}

      <div style={{ padding: "8px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>MY PROFILE</span>
        <div onClick={() => onOpenSettings()} style={{ fontSize: 14, cursor: "pointer", padding: "4px 8px", borderRadius: 8, background: W.card, border: `1px solid ${W.border}`, color: W.dim }}>⚙</div>
      </div>
      <div style={{ padding: "0 22px", display: "flex", gap: 14, alignItems: "center" }}>
        <div onClick={() => onOpenSettings("account")}
          style={{ width: 54, height: 54, borderRadius: "50%", background: W.card, border: `2px solid ${W.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, overflow: "hidden", flexShrink: 0, cursor: "pointer", position: "relative" }}>
          {profilePic ? <img src={profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : "👤"}
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0 }}>
            <span style={{ fontSize: 12, color: "#fff" }}>✏️</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {displayName && <div style={{ fontSize: 14, fontWeight: 800, color: W.text, fontFamily: "monospace", marginBottom: 1 }}>{displayName}</div>}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: displayName ? 12 : 15, fontWeight: displayName ? 500 : 900, color: displayName ? W.dim : W.text, fontFamily: "monospace" }}>@{username}</div>
            {isPrivate && <Badge color="purple">🔒 Private</Badge>}
          </div>
          {userBio && <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 3, lineHeight: 1.4 }}>{userBio}</div>}
          {/* Streak badge — always visible. Three states:
              - active:  gold 🔥 — ranked this week
              - at-risk: orange ⚠️ — last week ranked, this week hasn't (resets Sunday)
              - none:    dim "0-week streak"
              No prompts, no modals. The counter just reflects reality. */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
            <span>{streakInfo.status === "at-risk" ? "⚠️" : "🔥"}</span>
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: streakInfo.status === "active" ? W.gold : streakInfo.status === "at-risk" ? W.orange : W.dim }}>
              {streakInfo.count}-week streak
            </span>
            {streakInfo.status === "at-risk" && <span style={{ fontSize: 9, fontFamily: "monospace", color: W.orange }}>· rank before Sunday</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", padding: "14px 22px 8px" }}>
        {[
          { n: allRankings.length, l: "Ranked",    click: null },
          { n: totalSaved,           l: "Saved",     click: null },
          { n: followingCount,       l: "Following", click: "following" },
          { n: followersCount,       l: "Followers", click: "followers" },
        ].map((s, i) => (
          <div key={i} onClick={() => s.click && setSocialModal(s.click)}
            style={{ flex: 1, textAlign: "center", cursor: s.click ? "pointer" : "default" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? W.accent : s.click ? W.blue : W.text, fontFamily: "monospace", textDecoration: s.click ? "underline" : "none" }}>{s.n}</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "0 22px 10px", display: "flex", gap: 8 }}>
        <div onClick={() => onOpenSettings("account")}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 12, background: W.card, border: `1px solid ${W.border}`, cursor: "pointer" }}>
          <span style={{ fontSize: 14 }}>✎</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace" }}>Edit Profile</span>
        </div>
        <div onClick={() => setShowShareModal(true)}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 12, background: W.card, border: `1px solid ${W.border}`, cursor: "pointer" }}>
          <ShareIcon size={14} color={W.dim}/>
          <span style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace" }}>Share Profile</span>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${W.border}`, margin: "0 22px" }}>
        {["rankings", "saved", "reviews"].map((t) => (
          <div key={t} onClick={() => setTab(t)}
            style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 9, fontFamily: "monospace", fontWeight: 600, color: tab === t ? W.accent : W.dim, borderBottom: `2px solid ${tab === t ? W.accent : "transparent"}`, cursor: "pointer", textTransform: "capitalize" }}>{t}</div>
        ))}
      </div>
      <div style={{ padding: "10px 22px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
        {tab === "rankings" && <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>YOUR RANKINGS · {allRankings.length} films</div>
            {allRankings.length > 0 && <div onClick={() => setEditingRankings((p) => !p)}
              style={{ padding: "3px 9px", borderRadius: 8, background: editingRankings ? W.accentDim : W.card, border: `1px solid ${editingRankings ? W.accent : W.border}`, cursor: "pointer", flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: editingRankings ? W.accent : W.dim, fontFamily: "monospace", fontWeight: 600 }}>{editingRankings ? "✓ Done" : "✎ Edit"}</span>
            </div>}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div onClick={() => setShowRankingsSort((p) => !p)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 8, background: rankingsSort !== "ranked" ? W.blueDim : W.card, border: `1px solid ${rankingsSort !== "ranked" ? W.blue : W.border}`, cursor: "pointer" }}>
                <span style={{ fontSize: 9, color: rankingsSort !== "ranked" ? W.blue : W.dim, fontFamily: "monospace", fontWeight: 600 }}>
                  {{ ranked: "My Rank", alpha: "A–Z", popular: "Popular", unpopular: "Least Popular" }[rankingsSort]} ▾
                </span>
              </div>
              {showRankingsSort && <div style={{ position: "absolute", right: 0, top: "110%", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, overflow: "hidden", zIndex: 20, minWidth: 130 }}>
                {[
                  { key: "ranked",    label: "My Rank" },
                  { key: "alpha",     label: "A–Z" },
                  { key: "popular",   label: "Most Popular" },
                  { key: "unpopular", label: "Least Popular" },
                ].map((o) => (
                  <div key={o.key} onClick={() => { setRankingsSort(o.key); setShowRankingsSort(false); }}
                    style={{ padding: "8px 12px", fontSize: 10, fontFamily: "monospace", color: rankingsSort === o.key ? W.blue : W.text, background: rankingsSort === o.key ? W.blueDim : "transparent", cursor: "pointer", fontWeight: rankingsSort === o.key ? 700 : 400 }}>{o.label}</div>
                ))}
              </div>}
            </div>
          </div>
          {allRankings.length === 0 && <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>No rankings yet</div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6, lineHeight: 1.6 }}>Open any movie and tap ⚡ RANK</div>
          </div>}
          {(() => {
            const sorted = [...allRankings].sort((a, b) => {
              if (rankingsSort === "alpha") return a.title.localeCompare(b.title);
              if (rankingsSort === "popular") return (b.avg_user_rating || 0) - (a.avg_user_rating || 0);
              if (rankingsSort === "unpopular") return (a.avg_user_rating || 0) - (b.avg_user_rating || 0);
              return 0;
            });
            // Single ranking row. dragHandleProps are spread onto the drag affordance (☰).
            // When not provided (non-draggable mode), the handle is hidden.
            const renderRow = (m, i, dragHandleProps = null) => {
              const origPos = allRankings.findIndex((r) => r.id === m.id);
              return (
                <div onClick={() => !editingRankings && onSelectMovie(m)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: origPos === 0 && rankingsSort === "ranked" ? W.goldDim : W.card, borderRadius: 10, border: `1px solid ${origPos === 0 && rankingsSort === "ranked" ? W.gold + "44" : W.border}`, cursor: editingRankings ? "default" : "pointer" }}>
                  {dragHandleProps && <div {...dragHandleProps}
                    style={{ ...dragHandleProps.style, width: 20, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: W.dim, flexShrink: 0, userSelect: "none" }}
                    title="Drag to reorder">☰</div>}
                  <span style={{ fontSize: origPos < 3 && rankingsSort === "ranked" ? 13 : 11, fontWeight: 900, color: W.dim, fontFamily: "monospace", width: 18, textAlign: "center", flexShrink: 0 }}>
                    {rankingsSort === "ranked" ? (origPos < 3 ? ["🥇", "🥈", "🥉"][origPos] : origPos + 1) : (i + 1)}
                  </span>
                  <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                    <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year}{rankingsSort !== "ranked" && m.avg_user_rating ? ` · ★ ${m.avg_user_rating} avg` : ""}</div>
                  </div>
                  {editingRankings ? (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {/* Arrow buttons stay as a keyboard-accessible fallback in "ranked" sort. */}
                      {rankingsSort === "ranked" && origPos > 0 && <TapTarget onClick={(e) => { e.stopPropagation(); onReorderRanking && onReorderRanking(m.id, origPos - 1); }} label={`Move ${m.title} up`} minTap={false}
                        style={{ width: 28, height: 28, borderRadius: 6, background: W.bg, border: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: W.dim }}>
                        <span aria-hidden="true">↑</span>
                      </TapTarget>}
                      {rankingsSort === "ranked" && origPos < allRankings.length - 1 && <TapTarget onClick={(e) => { e.stopPropagation(); onReorderRanking && onReorderRanking(m.id, origPos + 1); }} label={`Move ${m.title} down`} minTap={false}
                        style={{ width: 28, height: 28, borderRadius: 6, background: W.bg, border: `1px solid ${W.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: W.dim }}>
                        <span aria-hidden="true">↓</span>
                      </TapTarget>}
                      <TapTarget onClick={(e) => { e.stopPropagation(); onReRank && onReRank(m); }} label={`Re-rank ${m.title}`} minTap={false}
                        style={{ width: 28, height: 28, borderRadius: 6, background: W.blueDim, border: `1px solid ${W.blue}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: W.blue }}>
                        <span aria-hidden="true">↻</span>
                      </TapTarget>
                      <TapTarget onClick={(e) => { e.stopPropagation(); setUnrankConfirm(m); }} label={`Remove ${m.title}`} minTap={false}
                        style={{ width: 28, height: 28, borderRadius: 6, background: W.accentDim, border: `1px solid ${W.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: W.accent }}>
                        <span aria-hidden="true">✕</span>
                      </TapTarget>
                    </div>
                  ) : (
                    <span style={{ fontSize: 9, color: W.blue, fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>
                      {eloScores[m.id] || 1500}
                    </span>
                  )}
                </div>
              );
            };
            // DraggableList only in "ranked" sort + edit mode. Other sorts are
            // virtual orderings (alphabetical, popularity) so dragging would
            // mislead — drag would imply persistent reorder.
            if (editingRankings && rankingsSort === "ranked") {
              return <DraggableList
                items={sorted}
                keyOf={(m) => m.id}
                renderItem={(m, dragHandleProps) => renderRow(m, sorted.indexOf(m), dragHandleProps)}
                onReorder={(from, to) => {
                  const movie = sorted[from];
                  if (movie && onReorderRanking) onReorderRanking(movie.id, to);
                }}/>;
            }
            return sorted.map((m, i) => <div key={m.id}>{renderRow(m, i)}</div>);
          })()}

          <div style={{ marginTop: 14, background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14, opacity: 0.85 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>📥 IMPORT YOUR DATA</div>
              <span style={{ fontSize: 8, background: W.orangeDim, color: W.orange, padding: "2px 6px", borderRadius: 3, fontFamily: "monospace", fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${W.orange}44` }}>COMING SOON</span>
              <div onClick={() => setShowImportInfo(true)} style={{ width: 16, height: 16, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: W.dim, cursor: "pointer", fontWeight: 700, flexShrink: 0, marginLeft: "auto" }}>i</div>
            </div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", lineHeight: 1.5, marginBottom: 10 }}>We're working on matching your imported history to our movie database. You'll be notified when it's ready.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { name: "Letterboxd", icon: "🎬", sub: "Upload diary.csv from letterboxd.com" },
                { name: "IMDb",        icon: "⭐", sub: "Upload ratings.csv from imdb.com" },
                { name: "Trakt",       icon: "📺", sub: "Upload history.json from trakt.tv" },
                { name: "Netflix",     icon: "🔴", sub: "Upload ViewingActivity.csv" },
              ].map((src) => (
                <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: W.bg, borderRadius: 10, border: `1px solid ${W.border}`, opacity: 0.6 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{src.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{src.name}</div>
                    <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{src.sub}</div>
                  </div>
                  <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", fontWeight: 700, cursor: "not-allowed" }}>SOON</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {tab === "saved" && <>
          <div className="no-scrollbar" style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4 }}>
            {savedGenres.map((g) => (
              <span key={g} onClick={() => setSavedGenreFilter(g)}
                style={{ flexShrink: 0, padding: "4px 11px", borderRadius: 16, fontSize: 9, fontFamily: "monospace", fontWeight: 600, cursor: "pointer", background: savedGenreFilter === g ? W.accentDim : W.card, border: `1px solid ${savedGenreFilter === g ? W.accent : W.border}`, color: savedGenreFilter === g ? W.accent : W.dim }}>{g}</span>
            ))}
          </div>
          {/* SAVED — released films bookmarked. Sort dropdown lives inline with
              the count for compactness (was a row of 4 pills below — see git history). */}
          {sortedSaved.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2, position: "relative" }}>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>SAVED · {sortedSaved.length}</div>
              <div onClick={() => setShowSavedSort((p) => !p)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 8, background: savedSort !== "default" ? W.blueDim : W.card, border: `1px solid ${savedSort !== "default" ? W.blue : W.border}`, cursor: "pointer" }}>
                <span style={{ fontSize: 9, color: savedSort !== "default" ? W.blue : W.dim, fontFamily: "monospace", fontWeight: 600 }}>
                  {{ default: "Default", alpha: "A–Z", popular: "Most Popular", unpopular: "Least Popular" }[savedSort]} ▾
                </span>
              </div>
              {showSavedSort && <div style={{ position: "absolute", right: 0, top: "110%", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, overflow: "hidden", zIndex: 20, minWidth: 140 }}>
                {[
                  { key: "default",   label: "Default" },
                  { key: "alpha",     label: "A–Z" },
                  { key: "popular",   label: "Most Popular" },
                  { key: "unpopular", label: "Least Popular" },
                ].map((o) => (
                  <div key={o.key} onClick={() => { setSavedSort(o.key); setShowSavedSort(false); }}
                    style={{ padding: "8px 12px", fontSize: 10, fontFamily: "monospace", color: savedSort === o.key ? W.blue : W.text, background: savedSort === o.key ? W.blueDim : "transparent", cursor: "pointer", fontWeight: savedSort === o.key ? 700 : 400 }}>{o.label}</div>
                ))}
              </div>}
            </div>
          )}
          {sortedSaved.length === 0 && watchlistMovies.length === 0 && <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◇</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Nothing saved yet</div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6, lineHeight: 1.6 }}>Tap ◇ on any movie to save it</div>
          </div>}
          {sortedSaved.map((m) => (
            <SwipeableRow key={m.id} actions={[
              { icon: "🗑️", label: "Remove", color: W.accent, onPress: () => removeSaved(m.id) },
            ]}>
              <div onClick={() => onSelectMovie(m)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: W.card, borderRadius: 10, border: `1px solid ${W.blue}22`, cursor: "pointer" }}>
                <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{m.title}</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year} · {m.directors?.[0]?.name}</div>
                  {m.avg_user_rating && <div style={{ fontSize: 9, color: W.gold, fontFamily: "monospace", marginTop: 1 }}>★ {m.avg_user_rating} avg</div>}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: W.blue }}>◆</div>
                  <div style={{ fontSize: 7, color: W.blue, fontFamily: "monospace" }}>SAVED</div>
                </div>
              </div>
            </SwipeableRow>
          ))}
          {/* WATCHLIST — upcoming/unreleased films */}
          {watchlistMovies.length > 0 && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginTop: sortedSaved.length > 0 ? 10 : 0, marginBottom: 2 }}>WATCHLIST · {watchlistMovies.length}</div>}
          {watchlistMovies.map((u) => (
            <SwipeableRow key={u.id} actions={[
              { icon: "🗑️", label: "Remove", color: W.accent, onPress: () => onToggleWatchlist && onToggleWatchlist(u.id) },
            ]}>
              <div onClick={() => onSelectUpcoming(u)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: W.card, borderRadius: 10, border: `1px solid ${W.accent}22`, cursor: "pointer" }}>
                <Poster url={u.poster_url} title={u.title} w={36} h={50} radius={6}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{u.title}</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{formatReleaseDate(u.release_date)} · {(() => { const d = daysUntil(u.release_date); return d > 0 ? `${d}d away` : d === 0 ? "TODAY" : "Released"; })()}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: W.accent }}>◈</div>
                  <div style={{ fontSize: 7, color: W.accent, fontFamily: "monospace" }}>SOON</div>
                </div>
              </div>
            </SwipeableRow>
          ))}
        </>}

        {tab === "reviews" && <>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>{(userReviews.length + MOCK_REVIEWS.length)} REVIEWS · MOST RECENT FIRST</div>
          {userReviews.map((r) => {
            const movie = findMovieSync(r.movie_id, r.movie_title);
            const menuOpen = reviewMenuOpen === r.ts;
            return (
              <div key={`user-${r.ts}`} style={{ background: W.card, border: `1px solid ${W.accent}44`, borderRadius: 12, padding: 12, position: "relative" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { if (movie) onSelectMovie(movie); }}>
                    <Poster url={movie?.poster_url} title={movie?.title} w={32} h={44} radius={6}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.movie_title}</div>
                        {r.edited
                          ? <span style={{ fontSize: 7, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>edited</span>
                          : <span style={{ fontSize: 7, background: W.accent, color: "#fff", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace", fontWeight: 700, flexShrink: 0 }}>NEW</span>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: W.gold, fontFamily: "monospace", marginTop: 3 }}>{r.rating}/10</div>
                    </div>
                  </div>
                  <TapTarget onClick={(e) => { e.stopPropagation(); haptic("light"); setReviewMenuOpen(menuOpen ? null : r.ts); }} label="Review options" minTap={false}
                    style={{ fontSize: 16, color: W.dim, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, flexShrink: 0 }}>
                    <span aria-hidden="true">⋯</span>
                  </TapTarget>
                </div>
                <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>{r.text}</div>
                {menuOpen && <div onClick={() => setReviewMenuOpen(null)}
                  style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: 12, overflow: "hidden" }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ background: W.bg, padding: "12px", display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${W.border}` }}>
                    <TapTarget onClick={() => { setReviewBeingEdited(r); setReviewMenuOpen(null); }} label="Edit review" minTap={false}
                      style={{ padding: "10px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 40 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Edit</span>
                    </TapTarget>
                    <TapTarget onClick={() => { setReviewPendingDelete(r.ts); setReviewMenuOpen(null); }} label="Delete review" minTap={false}
                      style={{ padding: "10px 14px", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, display: "flex", alignItems: "center", minHeight: 40 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>Delete</span>
                    </TapTarget>
                  </div>
                </div>}
              </div>
            );
          })}
          {MOCK_REVIEWS.map((r) => {
            const rankPos = allRankings.findIndex((m) => m.id === r.movie_id);
            const score = rankPos >= 0
              ? Math.min(10, Math.max(1, 10 - Math.round(rankPos / Math.max(allRankings.length - 1, 1) * 9)))
              : r.rating;
            return (
              <div key={r.id} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, cursor: "pointer" }} onClick={() => { const m = MOVIES.find((mv) => mv.id === r.movie_id); if (m) onSelectMovie(m); }}>
                  <Poster url={r.poster_url} title={r.movie_title} w={32} h={44} radius={6}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.movie_title}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: W.gold, fontFamily: "monospace", marginTop: 3 }}>{score}/10</div>
                  </div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", flexShrink: 0 }}>{r.time}</div>
                </div>
                <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>{r.text}</div>
              </div>
            );
          })}
        </>}
      </div>

      {unrankConfirm && <div onClick={() => setUnrankConfirm(null)}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 18, padding: "22px 20px", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace", marginBottom: 6 }}>Remove from rankings?</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{unrankConfirm.title}</div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 8, lineHeight: 1.5 }}>
              This will remove the film from your rankings and delete your ELO score for it. You can re-rank it anytime.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div onClick={() => setUnrankConfirm(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", cursor: "pointer" }}>Cancel</div>
            <div onClick={() => { onUnrank && onUnrank(unrankConfirm.id); setUnrankConfirm(null); }}
              style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.accent, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", cursor: "pointer" }}>Remove</div>
          </div>
        </div>
      </div>}

      {/* Edit modal — reuses ReviewModal in edit mode */}
      {reviewBeingEdited && <ReviewModal
        movie={findMovieSync(reviewBeingEdited.movie_id, reviewBeingEdited.movie_title)}
        existing={reviewBeingEdited}
        onSubmit={(text, rating) => {
          onEditReview && onEditReview(reviewBeingEdited.ts, text, rating);
          showToast && showToast("Review updated", "ok");
        }}
        onClose={() => setReviewBeingEdited(null)}/>}

      {reviewPendingDelete && <div onClick={() => setReviewPendingDelete(null)}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
        <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="del-review-title"
          style={{ background: W.card, border: `1px solid ${W.accent}66`, borderRadius: 16, padding: "20px 22px", maxWidth: 340, width: "100%" }}>
          <div id="del-review-title" style={{ fontSize: 13, fontWeight: 900, color: W.text, fontFamily: "monospace", marginBottom: 8, textAlign: "center" }}>Delete this review?</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 14, textAlign: "center" }}>This will remove your review and the corresponding activity from your feed. This can't be undone.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <TapTarget onClick={() => setReviewPendingDelete(null)} label="Cancel" minTap={false}
              style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.bg, border: `1px solid ${W.border}`, textAlign: "center", fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
              Cancel
            </TapTarget>
            <TapTarget onClick={() => { onDeleteReview && onDeleteReview(reviewPendingDelete); setReviewPendingDelete(null); showToast && showToast("Review deleted", "ok"); }} label="Delete review" minTap={false}
              style={{ flex: 1, padding: "11px", borderRadius: 10, background: W.accent, textAlign: "center", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
              Delete
            </TapTarget>
          </div>
        </div>
      </div>}
    </ScreenWithNav>
  );
};
