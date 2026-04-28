import { useEffect, useRef, useState } from "react";

import { Badge } from "../components/Badge";
import { Poster } from "../components/Poster";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { TapTarget } from "../components/TapTarget";
import { API } from "../lib/api";
import { haptic } from "../lib/haptic";
import { useShareInvite } from "../lib/hooks";
import { MOVIES, USER_PROFILES } from "../lib/mockData";
import { tmdbSearch } from "../lib/tmdb";
import { W } from "../theme";

const BROWSE_GENRES = [
  { label: "🎭 Drama",         genre: "Drama" },
  { label: "🚀 Sci-Fi",        genre: "Sci-Fi" },
  { label: "😱 Horror",        genre: "Horror" },
  { label: "😂 Comedy",        genre: "Comedy" },
  { label: "💥 Action",        genre: "Action" },
  { label: "🌏 International", genre: "international" },
];

export const SearchScreen = ({
  onNav, onSelectMovie, onSelectUser,
  followingHandles = new Set(), toggleFollowHandle, rateLimitedFollow,
  searchHistory = [], addSearchHistory, clearSearchHistory, removeSearchHistoryItem,
  username = "", showToast,
}) => {
  const [query, setQuery] = useState("");
  const [searchTab, setSearchTab] = useState("movies");
  const [browseGenre, setBrowseGenre] = useState(null);
  const [showFindFriends, setShowFindFriends] = useState(false);

  // Commit query to history when the user pauses after typing 2+ chars.
  useEffect(() => {
    if (query.length >= 2 && addSearchHistory) {
      const t = setTimeout(() => addSearchHistory(query), 1200);
      return () => clearTimeout(t);
    }
  }, [query, addSearchHistory]);

  // TMDB movie search — debounced 400ms. Falls back to a local MOVIES filter
  // if TMDB is disabled or the request fails.
  const [tmdbSearchResults, setTmdbSearchResults] = useState(null);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  useEffect(() => {
    if (query.length < 2) { setTmdbSearchResults(null); setTmdbSearching(false); return; }
    let cancelled = false;
    setTmdbSearching(true);
    const t = setTimeout(async () => {
      const data = await tmdbSearch(query);
      if (!cancelled) {
        setTmdbSearchResults(data);
        setTmdbSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const localTextResults = query.length > 1 ? MOVIES.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())) : [];
  const textResults = tmdbSearchResults || localTextResults;
  const browseResults = browseGenre
    ? MOVIES.filter((m) => browseGenre === "international" ? m.is_international : m.genres?.some((g) => g.name === browseGenre))
    : [];
  const showBrowse = browseGenre && query.length <= 1;

  // User search — backend /users?q= for real DB users, USER_PROFILES for the
  // hardcoded demo cohort. Backend results are debounced 250ms and merged on
  // top of the local list, deduped by handle. When the API is offline the
  // local list still shows so the screen never appears broken.
  const [backendUsers, setBackendUsers] = useState([]);
  useEffect(() => {
    if (query.length <= 1 || searchTab !== "users") { setBackendUsers([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await API.searchUsers(query);
      if (cancelled || !Array.isArray(rows)) return;
      // Map backend → UI shape. Synthesize avatar from first letter; bio is
      // empty unless USER_PROFILES has one.
      const mapped = rows.map((u) => ({
        handle: `@${u.username || u.user_id.slice(0, 8)}`,
        username: u.username || u.name,
        avatar: (u.name || u.username || "?").trim()[0]?.toUpperCase() || "?",
        bio: "",
        movies_rated: 0,
        followers: u.follower_count || 0,
        isPrivate: false,
        _backend: true,
        _userId: u.user_id,
      }));
      setBackendUsers(mapped);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, searchTab]);

  const localUserResults = query.length > 1 ? Object.entries(USER_PROFILES)
    .filter(([handle, p]) =>
      handle.toLowerCase().includes(query.toLowerCase()) ||
      p.username.toLowerCase().includes(query.toLowerCase()) ||
      p.bio?.toLowerCase().includes(query.toLowerCase()),
    )
    .map(([handle, p]) => ({ handle, ...p })) : [];

  // Backend hits first, then any local mocks not already present.
  const seenHandles = new Set(backendUsers.map((u) => u.handle.toLowerCase()));
  const userResults = query.length > 1
    ? [...backendUsers, ...localUserResults.filter((u) => !seenHandles.has(u.handle.toLowerCase()))]
    : [];

  // Suggested users — pick 5 on first render, preferring people not yet
  // followed, then lock the list. Tapping Follow keeps them visible (with the
  // button toggling to "FOLLOWING") instead of having them disappear and be
  // replaced. The list refreshes next time the user revisits Search.
  const suggestedUsersRef = useRef(null);
  if (suggestedUsersRef.current === null) {
    suggestedUsersRef.current = Object.entries(USER_PROFILES)
      .map(([handle, p]) => ({ handle, ...p }))
      .sort((a, b) => {
        const aFollowing = followingHandles.has(a.handle) ? 1 : 0;
        const bFollowing = followingHandles.has(b.handle) ? 1 : 0;
        return aFollowing - bFollowing;
      })
      .slice(0, 5);
  }
  const suggestedUsers = suggestedUsersRef.current;

  // Invite helpers — shared with Settings → Find Friends.
  const { inviteUrl, shareInvite } = useShareInvite(username, showToast);
  const handleShareInviteModal = async () => {
    const ok = await shareInvite();
    if (ok) setShowFindFriends(false);
  };
  const handleSyncContactsModal = () => {
    haptic("light");
    // TODO: in React Native, request CONTACTS permission, hash (SHA-256) each
    // email/phone, POST hashes to /users/me/find_friends, render matches.
    showToast && showToast("Contact sync is available in the RATED mobile app", "ok");
    setShowFindFriends(false);
  };

  return (
    <ScreenWithNav active="search" onNav={onNav}>
      {/* Find Friends modal */}
      {showFindFriends && (
        <div onClick={() => setShowFindFriends(false)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: W.bg, borderRadius: "20px 20px 0 0", padding: "18px 20px 24px", maxHeight: "80%", overflowY: "auto", borderTop: `1px solid ${W.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: W.text, fontFamily: "monospace" }}>👋 FIND FRIENDS</div>
              <TapTarget onClick={() => setShowFindFriends(false)} label="Close find friends" minTap={false}
                style={{ fontSize: 16, color: W.dim, minWidth: 40, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 14 }}>
              See which of your friends are already on RATED, or invite them to join.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <TapTarget onClick={handleSyncContactsModal} label="Sync contacts to find friends on Rated" minTap={false}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: W.card, borderRadius: 12, border: `1px solid ${W.border}`, minHeight: 60 }}>
                <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: W.accent + "22", border: `1px solid ${W.accent}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📇</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Sync Contacts</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>Find friends from your phone contacts</div>
                </div>
                <span aria-hidden="true" style={{ color: W.dim, fontSize: 14 }}>›</span>
              </TapTarget>
              <TapTarget onClick={handleShareInviteModal} label={`Share your invite link: ${inviteUrl}`} minTap={false}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: W.card, borderRadius: 12, border: `1px solid ${W.border}`, minHeight: 60 }}>
                <div aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, background: W.blue + "22", border: `1px solid ${W.blue}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🔗</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Share Invite Link</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inviteUrl}</div>
                </div>
                <span aria-hidden="true" style={{ color: W.dim, fontSize: 14 }}>›</span>
              </TapTarget>
            </div>
            <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, marginTop: 12, textAlign: "center" }}>
              We never post or message on your behalf. Contact data stays private and is only used to find matches.
            </div>
            <TapTarget onClick={() => setShowFindFriends(false)} label="Close" minTap={false}
              style={{ marginTop: 12, padding: "11px", textAlign: "center", fontSize: 11, color: W.dim, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 40 }}>
              Close
            </TapTarget>
          </div>
        </div>
      )}

      <div style={{ padding: "8px 22px 6px", display: "flex", gap: 8, alignItems: "center" }}>
        {browseGenre && <div onClick={() => setBrowseGenre(null)} style={{ fontSize: 11, color: W.dim, cursor: "pointer", flexShrink: 0 }}>←</div>}
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={searchTab === "users" ? "⌕ Search users by name..." : "⌕ Search movies, directors..."}
          type="search" enterKeyHint="search" aria-label="Search"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (query.trim().length >= 2 && addSearchHistory) addSearchHistory(query); e.target.blur(); } }}
          style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 12, color: W.text, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}/>
      </div>

      <div style={{ display: "flex", gap: 0, margin: "0 22px 6px", background: W.card, borderRadius: 10, padding: 3 }}>
        {[{ key: "movies", label: "🎬 Movies" }, { key: "users", label: "👥 Users" }].map((t) => (
          <div key={t.key} onClick={() => { setSearchTab(t.key); setBrowseGenre(null); }}
            style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, borderRadius: 8, background: searchTab === t.key ? W.bg : "transparent", color: searchTab === t.key ? W.accent : W.dim, cursor: "pointer" }}>{t.label}</div>
        ))}
      </div>

      <div style={{ padding: "0 22px 16px" }}>
        {searchTab === "movies" && <>
          {/* Searching indicator — only during initial fetch with no results yet,
              so it doesn't flash on every keystroke. */}
          {query.length > 1 && tmdbSearching && textResults.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px 0", color: W.dim, fontFamily: "monospace", fontSize: 10 }}>
              <span aria-live="polite">Searching…</span>
            </div>
          )}
          {query.length > 1 && textResults.map((m) => (
            <div key={m.id} onClick={() => onSelectMovie(m)}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${W.border}`, cursor: "pointer" }}>
              <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{m.title}</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year} · {m.directors?.[0]?.name}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: W.gold, fontFamily: "monospace" }}>#{m.global_rank || "—"}</div>
            </div>
          ))}
          {/* "No results" only after we've stopped searching — otherwise this
              would flash on every keystroke before the debounced fetch runs. */}
          {query.length > 1 && !tmdbSearching && textResults.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: W.dim, fontFamily: "monospace", fontSize: 11 }}>No results for "{query}"</div>}

          {showBrowse && <>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>
              {BROWSE_GENRES.find((g) => g.genre === browseGenre)?.label} · {browseResults.length} films
            </div>
            {browseResults.map((m) => (
              <div key={m.id} onClick={() => onSelectMovie(m)}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${W.border}`, cursor: "pointer" }}>
                <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>{m.title}</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year} · {m.directors?.[0]?.name}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: W.gold, fontFamily: "monospace" }}>#{m.global_rank || "—"}</div>
              </div>
            ))}
            {browseResults.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: W.dim, fontFamily: "monospace", fontSize: 11 }}>No movies in catalog yet</div>}
          </>}

          {query.length <= 1 && !browseGenre && <>
            {searchHistory.length > 0 && <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>RECENT SEARCHES</div>
                <div onClick={() => { haptic("light"); clearSearchHistory && clearSearchHistory(); }} style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}>Clear</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {searchHistory.slice(0, 6).map((q) => (
                  <div key={q} style={{ display: "flex", alignItems: "center", padding: "5px 6px 5px 10px", borderRadius: 16, background: W.card, border: `1px solid ${W.border}` }}>
                    <div onClick={() => { haptic("light"); setQuery(q); }} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <span style={{ fontSize: 10, color: W.dim }}>🕒</span>
                      <span style={{ fontSize: 10, color: W.text, fontFamily: "monospace" }}>{q}</span>
                    </div>
                    <TapTarget onClick={(e) => { e.stopPropagation(); haptic("light"); removeSearchHistoryItem && removeSearchHistoryItem(q); }} label={`Remove ${q} from search history`} minTap={false}
                      style={{ marginLeft: 4, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: W.dim }}>
                      <span aria-hidden="true">✕</span>
                    </TapTarget>
                  </div>
                ))}
              </div>
            </>}
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginTop: 8 }}>TRENDING</div>
            {[...MOVIES].sort((a, b) => (a.trending_rank || 99) - (b.trending_rank || 99)).slice(0, 5).map((m) => (
              <div key={m.id} onClick={() => onSelectMovie(m)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${W.border}`, cursor: "pointer" }}>
                <span style={{ fontSize: 11, color: W.dim }}>🔥</span>
                <span style={{ fontSize: 12, color: W.text, fontFamily: "monospace", flex: 1 }}>{m.title}</span>
                {m.is_international && <Badge color="purple">{m.original_language}</Badge>}
                <span style={{ fontSize: 10, color: W.dim }}>→</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginTop: 12 }}>BROWSE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {BROWSE_GENRES.map((c) => (
                <span key={c.genre} onClick={() => setBrowseGenre(c.genre)}
                  style={{ padding: "7px 14px", borderRadius: 10, fontSize: 10, fontFamily: "monospace", fontWeight: 600, background: W.card, border: `1px solid ${W.border}`, color: W.dim, cursor: "pointer" }}>{c.label}</span>
              ))}
            </div>
          </>}
        </>}

        {searchTab === "users" && <>
          <div onClick={() => setShowFindFriends(true)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: `linear-gradient(135deg,${W.accent}22,${W.blue}22)`, border: `1px solid ${W.accent}44`, borderRadius: 12, cursor: "pointer", marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: W.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>👋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>Find your friends</div>
              <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>Connect contacts, Instagram, X · or share an invite</div>
            </div>
            <span style={{ color: W.accent, fontSize: 14 }}>›</span>
          </div>

          {query.length > 1 && userResults.map((u) => {
            const isFollowing = followingHandles.has(u.handle);
            return (
              <div key={u.handle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${W.border}` }}>
                <div onClick={() => onSelectUser && onSelectUser(u.handle)}
                  style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{u.avatar}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{u.handle}</span>
                      {u.badge && <span style={{ fontSize: 11 }}>{u.badge}</span>}
                      {u.isPrivate && <span style={{ fontSize: 9 }}>🔒</span>}
                    </div>
                    {u.bio && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.bio}</div>}
                    <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", marginTop: 1 }}>{u.movies_rated} ranked · {u.followers} followers</div>
                  </div>
                </div>
                <div onClick={() => {
                    if (!isFollowing && rateLimitedFollow) rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(u.handle));
                    else toggleFollowHandle && toggleFollowHandle(u.handle);
                  }}
                  style={{ padding: "5px 12px", borderRadius: 10, fontSize: 9, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", background: isFollowing ? W.accentDim : W.card, border: `1px solid ${isFollowing ? W.accent : W.border}`, color: isFollowing ? W.accent : W.dim, flexShrink: 0 }}>
                  {isFollowing ? "FOLLOWING" : "+ FOLLOW"}
                </div>
              </div>
            );
          })}
          {query.length > 1 && userResults.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: W.dim, fontFamily: "monospace", fontSize: 11 }}>No users matching "{query}"</div>}

          {query.length <= 1 && <>
            <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginTop: 4, marginBottom: 2 }}>SUGGESTED FOR YOU</div>
            {suggestedUsers.map((u) => {
              const isFollowing = followingHandles.has(u.handle);
              return (
                <div key={u.handle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${W.border}` }}>
                  <div onClick={() => onSelectUser && onSelectUser(u.handle)}
                    style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{u.avatar}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{u.handle}</span>
                        {u.badge && <span style={{ fontSize: 11 }}>{u.badge}</span>}
                      </div>
                      {u.bio && <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.bio}</div>}
                      <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace", marginTop: 1 }}>{u.movies_rated} ranked · {u.followers} followers</div>
                    </div>
                  </div>
                  <div onClick={() => {
                      if (!isFollowing && rateLimitedFollow) rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(u.handle));
                      else toggleFollowHandle && toggleFollowHandle(u.handle);
                    }}
                    style={{ padding: "5px 12px", borderRadius: 10, fontSize: 9, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", background: isFollowing ? W.accentDim : W.card, border: `1px solid ${isFollowing ? W.accent : W.border}`, color: isFollowing ? W.accent : W.dim, flexShrink: 0 }}>
                    {isFollowing ? "FOLLOWING" : "+ FOLLOW"}
                  </div>
                </div>
              );
            })}
          </>}
        </>}
      </div>
    </ScreenWithNav>
  );
};
