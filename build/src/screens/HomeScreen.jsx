import { useEffect, useRef, useState } from "react";

import { ImageViewer } from "../components/ImageViewer";
import { Poster } from "../components/Poster";
import { PullIndicator } from "../components/PullIndicator";
import { ReportBlockMenu } from "../components/ReportBlockMenu";
import { ScreenWithNav } from "../components/ScreenWithNav";
import { ShareIcon } from "../components/ShareIcon";
import { ShareSheet } from "../components/ShareSheet";
import { Skeleton, FeedSkeleton } from "../components/Skeleton";
import { TapTarget } from "../components/TapTarget";
import { API } from "../lib/api";
import { haptic } from "../lib/haptic";
import { usePullToRefresh } from "../lib/hooks";
import { GLOBAL_FEED, MOCK_FEED, MOCK_FRIENDS, MOVIES } from "../lib/mockData";
import { formatRelativeTime, parseRelativeToTs } from "../lib/time";
import { findMovieSync, tmdbPopular } from "../lib/tmdb";
import { W } from "../theme";

export const HomeScreen = ({
  onNav, onSelectMovie, session, userId, username,
  unreadCount = 0,
  blockedUsers = new Set(), blockUser, reportContent,
  rateLimitedFollow,
  followingHandles = new Set(), toggleFollowHandle, onSelectUser,
  userFeedItems = [], onRank,
  savedMovies = new Set(), toggleSavedMovie,
  feedLikes = {}, toggleFeedLike,
  showToast,
}) => {
  const [loaded, setLoaded] = useState(false);
  // Hydrate feed items with real timestamps so formatRelativeTime ticks live.
  const [feedItems, setFeedItems] = useState(() => MOCK_FEED.map((i) => ({ ...i, ts: parseRelativeToTs(i.time) })));
  const [feedTab, setFeedTab] = useState("following");
  const hydratedGlobalFeed = useRef(GLOBAL_FEED.map((i) => ({ ...i, ts: parseRelativeToTs(i.time) }))).current;
  const likes = feedLikes;
  const saved = savedMovies;
  const [replyOpen, setReplyOpen] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [viewerImage, setViewerImage] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  // Everyone tab collapses long reply threads by default.
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  // Public replies — seed with sample threads keyed by feed item id.
  const [replies, setReplies] = useState(() => ({
    "f-001": [
      { user: "@maya", avatar: "M", text: "Whiplash is an all-timer for me too", time: "3m ago",  ts: parseRelativeToTs("3m") },
      { user: "@josh", avatar: "J", text: "Better than Birdman? Bold take 🔥",   time: "12m ago", ts: parseRelativeToTs("12m") },
    ],
    "g-001": [
      { user: "@reeltalks", avatar: "R", text: "Parasite deserves every 10/10 it gets", time: "8m ago", ts: parseRelativeToTs("8m") },
    ],
    "g-004": [
      { user: "@maya",     avatar: "M", text: "Rajamouli is a master, fully agree",            time: "3h ago",  ts: parseRelativeToTs("3h") },
      { user: "@carlos",   avatar: "C", text: "Need to rewatch this one",                      time: "2h ago",  ts: parseRelativeToTs("2h") },
      { user: "@filmfreak", avatar: "F", text: "That dance sequence lives in my head rent free", time: "45m ago", ts: parseRelativeToTs("45m") },
    ],
  }));

  const rawFeed = feedTab === "following"
    ? [...userFeedItems, ...feedItems.filter((item) => followingHandles.has(item.user))]
    : [...userFeedItems, ...hydratedGlobalFeed];
  const activeFeed = rawFeed.filter((item) => !blockedUsers.has(item.user));

  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleRefresh = async () => {
    setRetryCount((c) => c + 1);
    await new Promise((r) => setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      try {
        if (userId && session) {
          const apiFeed = await API.getFeed(userId, session);
          if (apiFeed && apiFeed.length > 0) {
            setFeedItems(apiFeed.map((r) => {
              // Backend returns ranked_at as Unix seconds; frontend uses ms.
              const tsMs = (r.ranked_at || 0) * 1000;
              const handle = r.user?.username ? `@${r.user.username}` : `@${r.user?.name || "user"}`;
              return {
                id: `api-${r.movie.movie_id}-${r.ranked_at}`,
                type: "rating",
                user: handle,
                avatar: (r.user?.username || r.user?.name || "?")[0].toUpperCase(),
                action: "rated",
                movie_title: r.movie.title,
                movie_id: r.movie.movie_id,
                rating: r.score,
                ts: tsMs,
                time: "",
                likes: 0,
                liked: false,
              };
            }));
          }
        }
        setLoaded(true);
      } catch (err) {
        setLoadError(err?.message || "Couldn't connect. Check your network and try again.");
        setLoaded(true);
      }
    };
    const timer = setTimeout(load, 500);
    return () => clearTimeout(timer);
  }, [userId, session, retryCount]);

  const handleRetry = () => { setLoaded(false); setLoadError(null); setRetryCount((c) => c + 1); };

  const toggleSave = (id) => toggleSavedMovie && toggleSavedMovie(id);
  const toggleFollow = async (friend) => {
    const handle = `@${friend.username}`;
    const isFollowingNow = followingHandles.has(handle);
    // toggleFollowHandle handles both local state and the backend write
    // (optimistic + rollback). Skip the rate limiter for unfollows; wrap follows.
    if (isFollowingNow) { toggleFollowHandle && toggleFollowHandle(handle); return; }
    if (rateLimitedFollow) rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(handle));
    else toggleFollowHandle && toggleFollowHandle(handle);
  };
  const submitReply = (itemId) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    // Hard cap matching the input maxLength — guards against any path that
    // could bypass the input (paste handler, autofill, etc.).
    if (trimmed.length > 280) return;
    const myHandle = username ? `@${username}` : "@you";
    const myAvatar = (username || "Y")[0].toUpperCase();
    setReplies((p) => ({ ...p, [itemId]: [...(p[itemId] || []), { user: myHandle, avatar: myAvatar, text: trimmed, time: "just now", ts: Date.now() }] }));
    setReplyText("");
    setReplyOpen(null);
  };

  // Highlights — pull popular films from TMDB; fall back to MOVIES on failure.
  const [tmdbPopularMovies, setTmdbPopularMovies] = useState(null);
  useEffect(() => {
    let cancelled = false;
    tmdbPopular().then((data) => { if (!cancelled && data && data.length > 0) setTmdbPopularMovies(data); });
    return () => { cancelled = true; };
  }, []);
  const highlights = tmdbPopularMovies
    ? tmdbPopularMovies.slice(0, 4)
    : [...MOVIES]
        .sort((a, b) => {
          if (a.is_highlighted && !b.is_highlighted) return -1;
          if (!a.is_highlighted && b.is_highlighted) return 1;
          return (a.trending_rank || 99) - (b.trending_rank || 99);
        })
        .slice(0, 4);

  if (!loaded) return <ScreenWithNav active="home" onNav={onNav}>
    <div style={{ padding: "6px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: W.accent, fontFamily: "monospace", letterSpacing: -1 }}>RATED</div>
      <Skeleton w={32} h={32} radius={16}/>
    </div>
    <div style={{ padding: "0 22px 10px" }}>
      <Skeleton w={90} h={11} style={{ marginBottom: 10 }}/>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} w={105} h={148} radius={12}/>)}
      </div>
    </div>
    <FeedSkeleton/>
  </ScreenWithNav>;

  return (
    <ScreenWithNav active="home" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{ padding: "6px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: W.accent, fontFamily: "monospace", letterSpacing: -1 }}>RATED</div>
        <div onClick={() => onNav("notifications")}
          style={{ position: "relative", cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: W.card, border: `1px solid ${W.border}`, borderRadius: "50%" }}>
          <span style={{ fontSize: 16 }}>🔔</span>
          {unreadCount > 0 && <div style={{ position: "absolute", top: -1, right: -1, background: W.accent, borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#fff", fontFamily: "monospace" }}>{unreadCount > 9 ? "9+" : unreadCount}</div>}
        </div>
      </div>
      <div style={{ padding: "10px 22px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {loadError && <div style={{ background: W.card, border: `1px solid ${W.accent}66`, borderRadius: 12, padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>Couldn't load your feed</div>
            <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2, lineHeight: 1.5 }}>{loadError} · Showing cached content.</div>
          </div>
          <TapTarget onClick={handleRetry} label="Retry loading feed" minTap={false}
            style={{ padding: "7px 14px", borderRadius: 8, background: W.accent, color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "monospace", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
            Retry
          </TapTarget>
        </div>}
        <div style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1.5 }}>HIGHLIGHTS</div>
        <div className="no-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {highlights.map((m) => (
            <div key={m.id} style={{ flexShrink: 0, width: 105 }}>
              <div style={{ position: "relative", cursor: "pointer" }} onClick={() => onSelectMovie(m)}>
                <Poster url={m.poster_url} title={m.title} w={105} h={148} radius={12}/>
                {m.trending_rank <= 3 && <div style={{ position: "absolute", top: 6, left: 6, background: W.accent, color: "#fff", fontSize: 7, fontWeight: 900, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>#{m.trending_rank}</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: W.text, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</div>
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{m.release_year}</div>
                </div>
                <div onClick={(e) => { e.stopPropagation(); toggleSave(m.id); }} style={{ cursor: "pointer", fontSize: 14, flexShrink: 0, marginLeft: 4 }}>
                  <span style={{ color: saved.has(m.id) ? W.blue : W.dim }}>{saved.has(m.id) ? "◆" : "◇"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1.5 }}>ACTIVITY</div>
        <div style={{ display: "flex", borderBottom: `1px solid ${W.border}`, marginBottom: 4 }}>
          {[{ key: "following", label: "Following" }, { key: "everyone", label: "Everyone" }].map((t) => (
            <div key={t.key} onClick={() => setFeedTab(t.key)}
              style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 10, fontFamily: "monospace", fontWeight: 600, color: feedTab === t.key ? W.accent : W.dim, borderBottom: `2px solid ${feedTab === t.key ? W.accent : "transparent"}`, cursor: "pointer" }}>{t.label}</div>
          ))}
        </div>
        {feedTab === "following" && activeFeed.length === 0 && <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace" }}>Nobody followed yet</div>
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>Follow people to see their activity here</div>
        </div>}
        {activeFeed.slice(0, visibleCount).map((item) => {
          const isLiked = likes[item.id] ?? item.liked;
          const likeCount = (item.likes || 0) + (likes[item.id] && !item.liked ? 1 : 0) - (!likes[item.id] && item.liked ? 1 : 0);
          const friend = MOCK_FRIENDS.find((u) => `@${u.username}` === item.user);
          const isFollowing = followingHandles.has(item.user);
          const itemReplies = replies[item.id] || [];
          const isOwnUser = item.user === "@you" || item.user === `@${username}`;
          const canSelectUser = item.user && !isOwnUser;
          const handleSelectUser = () => {
            if (canSelectUser) { haptic("light"); onSelectUser && onSelectUser(item.user); }
          };
          return (
            <div key={item.id} style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 14, padding: 12, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {canSelectUser ? (
                  <TapTarget onClick={handleSelectUser} label={`View ${item.user}'s profile`} minTap={false}
                    style={{ width: 30, height: 30, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>
                    <span aria-hidden="true">{item.avatar}</span>
                  </TapTarget>
                ) : (
                  <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{item.avatar}</div>
                )}
                {/* Username + timestamp column. FOLLOW/share/⋯ are siblings in the
                    outer row — keeping them separate prevents the follow pill from
                    crowding the username on narrow screens. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {canSelectUser ? (
                    <TapTarget onClick={handleSelectUser} label={`View ${item.user}'s profile`} minTap={false}
                      style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace", padding: "2px 0", borderRadius: 4, display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.user}
                    </TapTarget>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.user}</div>
                  )}
                  <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{item.ts ? formatRelativeTime(item.ts) : item.time}</div>
                </div>
                {/* Follow/Unfollow — Everyone tab only, never on own posts. Sibling of
                    share/⋯ for consistent gap:8 spacing across all trailing actions. */}
                {feedTab === "everyone" && !isOwnUser && (() => {
                  const handleFollowToggle = (e) => {
                    e.stopPropagation();
                    if (friend) {
                      toggleFollow(friend);
                    } else if (isFollowing) {
                      toggleFollowHandle && toggleFollowHandle(item.user);
                    } else if (rateLimitedFollow) {
                      rateLimitedFollow(() => toggleFollowHandle && toggleFollowHandle(item.user));
                    } else {
                      toggleFollowHandle && toggleFollowHandle(item.user);
                    }
                  };
                  return (
                    <TapTarget onClick={handleFollowToggle}
                      label={isFollowing ? `Unfollow ${item.user}` : `Follow ${item.user}`}
                      minTap={false}
                      style={{ padding: "0 12px", borderRadius: 16, fontSize: 9, fontWeight: 700, fontFamily: "monospace", background: isFollowing ? W.accentDim : "transparent", border: `1px solid ${isFollowing ? W.accent : W.border}`, color: isFollowing ? W.accent : W.dim, minHeight: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isFollowing ? "FOLLOWING" : "+ FOLLOW"}
                    </TapTarget>
                  );
                })()}
                {item.movie_id && <TapTarget onClick={(e) => { e.stopPropagation(); haptic("medium"); setShareItem({ type: "movie", id: item.movie_id, title: item.movie_title }); }} label={`Share ${item.movie_title || "post"}`} minTap={false}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: W.card, border: `1px solid ${W.border}`, flexShrink: 0 }}>
                  <ShareIcon size={14} color={W.dim}/>
                </TapTarget>}
                <ReportBlockMenu
                  targetType="feed" targetId={item.id} targetLabel={`${item.user} - ${item.movie_title || item.action}`}
                  targetUser={item.user}
                  onReport={reportContent} onBlock={blockUser} blockedUsers={blockedUsers}/>
              </div>
              <div style={{ fontSize: 11, color: W.text, fontFamily: "monospace", lineHeight: 1.5, marginBottom: 6 }}>
                {item.type === "rating" && <span>{item.action} <span style={{ color: W.gold, fontWeight: 700 }}>{item.movie_title}</span> <span style={{ color: W.gold }}>★ {item.rating}/10</span></span>}
                {item.type === "review" && <div>
                  <span>{item.action} <span onClick={(e) => { e.stopPropagation(); const mv = findMovieSync(item.movie_id, item.movie_title); if (mv) { haptic("light"); onSelectMovie(mv); } }}
                    style={{ color: W.gold, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${W.gold}55`, textUnderlineOffset: 2 }}>{item.movie_title}</span>
                    {item.rating && <span style={{ color: W.gold, fontWeight: 700, marginLeft: 6 }}>★ {item.rating}/10</span>}
                  </span>
                  <div style={{ fontSize: 10, color: W.dim, marginTop: 4, fontStyle: "italic" }}>"{item.preview?.slice(0, 90)}..."</div>
                </div>}
                {item.type === "ranking" && <div>
                  <span>{item.action}{item.movie_title && <span onClick={(e) => { e.stopPropagation(); const mv = findMovieSync(item.movie_id, item.movie_title); if (mv) { haptic("light"); onSelectMovie(mv); } }}
                    style={{ color: W.accent, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${W.accent}55`, textUnderlineOffset: 2, marginLeft: 4 }}>{item.movie_title}</span>}
                    {item.rating && <span style={{ color: W.gold, fontWeight: 700, marginLeft: 6 }}>★ {item.rating}/10</span>}
                  </span>
                  <div onClick={(e) => { e.stopPropagation(); const mv = findMovieSync(item.movie_id, item.movie_title); if (mv) { haptic("light"); onSelectMovie(mv); } }}
                    style={{ fontSize: 10, color: item.movie_id ? W.dim : W.dim, marginTop: 2, cursor: item.movie_id ? "pointer" : "default" }}>{item.preview}</div>
                </div>}
                {item.type === "save" && <span>saved <span onClick={(e) => { e.stopPropagation(); const mv = findMovieSync(item.movie_id, item.movie_title); if (mv) { haptic("light"); onSelectMovie(mv); } }}
                  style={{ color: W.blue, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${W.blue}55`, textUnderlineOffset: 2 }}>{item.movie_title}</span> to watch later 🎬</span>}
                {item.type === "streak" && <span>{item.action}</span>}
              </div>
              {/* Public reply thread — collapsed on Everyone tab (shows only most recent). */}
              {itemReplies.length > 0 && (() => {
                const isExpanded = expandedReplies.has(item.id);
                const shouldCollapse = feedTab === "everyone" && !isExpanded && itemReplies.length > 1;
                const visibleReplies = shouldCollapse ? [itemReplies[itemReplies.length - 1]] : itemReplies;
                const hiddenCount = itemReplies.length - visibleReplies.length;
                return (
                  <div style={{ borderTop: `1px solid ${W.border}`, paddingTop: 8, marginBottom: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                    {shouldCollapse && <div onClick={() => setExpandedReplies((p) => { const n = new Set(p); n.add(item.id); return n; })}
                      style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", cursor: "pointer", paddingLeft: 28 }}>
                      — View {hiddenCount} earlier {hiddenCount === 1 ? "reply" : "replies"}
                    </div>}
                    {visibleReplies.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <div onClick={() => r.user && r.user !== "@you" && onSelectUser && onSelectUser(r.user)}
                          style={{ width: 22, height: 22, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0, cursor: r.user && r.user !== "@you" ? "pointer" : "default" }}>{r.avatar || "?"}</div>
                        <div style={{ background: W.bg, borderRadius: 8, padding: "5px 9px", flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 1 }}>
                            <span onClick={() => r.user && r.user !== "@you" && onSelectUser && onSelectUser(r.user)}
                              style={{ fontSize: 9, fontWeight: 700, color: W.accent, fontFamily: "monospace", cursor: r.user && r.user !== "@you" ? "pointer" : "default" }}>{r.user || "@you"}</span>
                            <span style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>{r.ts ? formatRelativeTime(r.ts) : r.time}</span>
                          </div>
                          <div style={{ fontSize: 10, color: W.text, fontFamily: "monospace", lineHeight: 1.4 }}>{r.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* Reply input — capped at 280 chars (matches Twitter/X) so the input
                  stays useful as a quick reaction and doesn't break card layout. */}
              {replyOpen === item.id && (() => {
                const replyLen = replyText.length;
                const replyValid = replyText.trim().length > 0 && replyLen <= 280;
                const counterColor = replyLen >= 252 ? W.accent : W.dim; // warn at 90%
                return (
                  <div style={{ borderTop: `1px solid ${W.border}`, paddingTop: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && replyValid) submitReply(item.id); }}
                        placeholder="Write a reply..." autoFocus aria-label="Write a reply"
                        enterKeyHint="send" maxLength={280}
                        style={{ flex: 1, background: W.bg, border: `1px solid ${W.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 10, color: W.text, fontFamily: "monospace", outline: "none" }}/>
                      <TapTarget onClick={() => { if (replyValid) submitReply(item.id); }}
                        label="Send reply" disabled={!replyValid} minTap={false}
                        style={{ background: W.accent, borderRadius: 8, padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#fff", fontFamily: "monospace", flexShrink: 0, minHeight: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", opacity: replyValid ? 1 : 0.4 }}>
                        <span aria-hidden="true">→</span>
                      </TapTarget>
                    </div>
                    {/* Counter only appears once user starts typing — no clutter when empty. */}
                    {replyLen > 0 && <div style={{ fontSize: 8, color: counterColor, fontFamily: "monospace", textAlign: "right", marginTop: 3 }}>
                      {replyLen} / 280
                    </div>}
                  </div>
                );
              })()}
              <div role="group" aria-label="Post actions" style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 6, borderTop: `1px solid ${W.border}` }}>
                <TapTarget onClick={() => { toggleFeedLike && toggleFeedLike(item.id); }}
                  label={`${isLiked ? "Unlike" : "Like"} post${typeof likeCount === "number" ? `, ${likeCount} ${likeCount === 1 ? "like" : "likes"}` : ""}`}
                  minTap={false}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 8, minHeight: 36 }}>
                  <span aria-hidden="true" style={{ fontSize: 14, color: isLiked ? W.accent : W.dim }}>{isLiked ? "♥" : "♡"}</span>
                  <span style={{ fontSize: 10, color: isLiked ? W.accent : W.dim, fontFamily: "monospace", fontWeight: isLiked ? 700 : 400 }}>{likeCount}</span>
                </TapTarget>
                <TapTarget onClick={() => {
                    haptic("light");
                    const isCollapsed = feedTab === "everyone" && itemReplies.length > 1 && !expandedReplies.has(item.id);
                    if (isCollapsed) {
                      setExpandedReplies((p) => { const n = new Set(p); n.add(item.id); return n; });
                    } else {
                      setReplyOpen(replyOpen === item.id ? null : item.id);
                      setReplyText("");
                    }
                  }} label={itemReplies.length > 0 ? `${itemReplies.length} ${itemReplies.length === 1 ? "reply" : "replies"}` : "Reply to post"} minTap={false}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 8, minHeight: 36 }}>
                  <span aria-hidden="true" style={{ fontSize: 12, color: replyOpen === item.id ? W.accent : W.dim }}>💬</span>
                  <span style={{ fontSize: 10, color: replyOpen === item.id ? W.accent : W.dim, fontFamily: "monospace", fontWeight: replyOpen === item.id ? 700 : 400 }}>
                    {itemReplies.length > 0 ? itemReplies.length : "Reply"}
                  </span>
                </TapTarget>
                {item.movie_id && onRank && (() => {
                  const movie = findMovieSync(item.movie_id, item.movie_title);
                  if (!movie) return null;
                  return <TapTarget onClick={(e) => { e.stopPropagation(); haptic("medium"); onRank(movie); }} label={`Rank ${movie.title}`} minTap={false}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 8, minHeight: 36 }}>
                    <span aria-hidden="true" style={{ fontSize: 12, color: W.accent }}>⚡</span>
                    <span style={{ fontSize: 10, color: W.accent, fontFamily: "monospace", fontWeight: 700 }}>Rank</span>
                  </TapTarget>;
                })()}
                {item.movie_id && <TapTarget onClick={() => { haptic("light"); toggleSave(item.movie_id); }}
                  label={`${saved.has(item.movie_id) ? "Remove from saved" : "Save"} ${item.movie_title || "movie"}`}
                  minTap={false}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 8px", borderRadius: 8, minHeight: 36, marginLeft: "auto" }}>
                  <span aria-hidden="true" style={{ fontSize: 13, color: saved.has(item.movie_id) ? W.blue : W.dim }}>{saved.has(item.movie_id) ? "◆" : "◇"}</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: saved.has(item.movie_id) ? 700 : 400, color: saved.has(item.movie_id) ? W.blue : W.dim }}>
                    {saved.has(item.movie_id) ? "Saved" : "Save"}
                  </span>
                </TapTarget>}
              </div>
            </div>
          );
        })}
        {activeFeed.length > visibleCount && <TapTarget onClick={() => { haptic("light"); setVisibleCount((c) => c + 10); }}
          label={`Load ${Math.min(10, activeFeed.length - visibleCount)} more posts`} minTap={false}
          style={{ padding: "11px", textAlign: "center", background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44 }}>
          Load {Math.min(10, activeFeed.length - visibleCount)} more
        </TapTarget>}
      </div>
      <ImageViewer url={viewerImage} onClose={() => setViewerImage(null)}/>
      <ShareSheet item={shareItem} onClose={() => setShareItem(null)} showToast={showToast}/>
    </ScreenWithNav>
  );
};
