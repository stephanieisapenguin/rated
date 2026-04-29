import { useEffect, useState } from "react";

import { Badge } from "../components/Badge";
import { Btn } from "../components/Btn";
import { ImageViewer } from "../components/ImageViewer";
import { Poster } from "../components/Poster";
import { ShareIcon } from "../components/ShareIcon";
import { ShareSheet } from "../components/ShareSheet";
import { Skeleton } from "../components/Skeleton";
import { TapTarget } from "../components/TapTarget";
import { TrailerModal } from "../components/TrailerModal";
import { haptic } from "../lib/haptic";
import { useEdgeSwipeBack } from "../lib/hooks";
import { USER_PROFILES } from "../lib/mockData";
import { daysUntil, formatReleaseDate } from "../lib/time";
import { tmdbMovieDetail } from "../lib/tmdb";
import { W } from "../theme";
import { ReviewModal } from "./ReviewModal";

export const MovieDetailScreen = ({
  movie, onBack, onRank, isUpcoming,
  watchlist, onToggleWatchlist,
  followingHandles = new Set(), onSelectUser, onSubmitReview,
  savedMovies = new Set(), toggleSavedMovie, showToast,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const edgeSwipe = useEdgeSwipeBack(onBack);

  // For TMDB movies, fetch the full detail (cast, trailers, backdrop) on open.
  // Local hardcoded movies already have this data.
  const [enrichedMovie, setEnrichedMovie] = useState(movie);
  useEffect(() => {
    setEnrichedMovie(movie);
    if (!movie) return;
    let cancelled = false;
    if (movie.tmdb_id) {
      tmdbMovieDetail(movie.tmdb_id).then((full) => {
        if (!cancelled && full) {
          // Defensive merge: spread original first, then full, then re-apply
          // any URL fields that might have been nulled by the TMDB detail
          // endpoint (some entries are missing poster_path/backdrop_path in
          // the detail response even when present in the list response).
          // Preserve the app's id (tmdb-123) so comparisons with savedMovies/
          // watchlist still work.
          setEnrichedMovie({
            ...movie,
            ...full,
            id: movie.id,
            poster_url: full.poster_url || movie.poster_url,
            backdrop_url: full.backdrop_url || movie.backdrop_url,
          });
        }
      });
    }
    return () => { cancelled = true; };
  }, [movie?.id, movie?.tmdb_id]);

  const m = enrichedMovie || movie;
  const saved = movie ? savedMovies.has(movie.id) : false;
  const setSaved = (val) => {
    if (!movie || !toggleSavedMovie) return;
    if (saved !== val) toggleSavedMovie(movie.id);
  };

  useEffect(() => {
    setLoaded(false);
    setShowReview(false);
    setTrailerOpen(false);
    setTimeout(() => setLoaded(true), 300);
  }, [movie?.id]);

  if (!movie) return null;
  if (!loaded) return (
    <div style={{ padding: 0 }}>
      <Skeleton w="100%" h={180} radius={0}/>
      <div style={{ padding: "48px 22px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton w="70%" h={18}/>
        <Skeleton w="40%" h={10}/>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Skeleton w={60} h={44} radius={10}/>
          <Skeleton w={60} h={44} radius={10}/>
          <Skeleton w={60} h={44} radius={10}/>
        </div>
        <Skeleton w="100%" h={10} style={{ marginTop: 8 }}/>
        <Skeleton w="100%" h={10}/>
        <Skeleton w="80%" h={10}/>
      </div>
    </div>
  );

  const trailer = m.trailers?.find((t) => t.is_primary) || m.trailers?.[0];
  const inWatchlist = watchlist ? watchlist.has(m.id) : false;

  return (
    <div {...edgeSwipe} style={{ position: "relative" }}>
      {showReview && <ReviewModal movie={m} onClose={() => setShowReview(false)} onSubmit={onSubmitReview}/>}
      <ImageViewer url={viewerImage} onClose={() => setViewerImage(null)}/>
      {shareOpen && <ShareSheet item={{ type: "movie", id: m.id, title: m.title }} onClose={() => setShareOpen(false)} showToast={showToast}/>}
      {trailerOpen && trailer && trailer.video_key && <TrailerModal videoKey={trailer.video_key} title={m.title} onClose={() => setTrailerOpen(false)}/>}
      <div style={{ position: "relative", height: 180, background: `linear-gradient(180deg,#1a1a28,${W.bg})`, overflow: "hidden" }}>
        {m.backdrop_url && <img src={m.backdrop_url} alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, cursor: "pointer" }}
          onClick={() => { haptic("light"); setViewerImage(m.backdrop_url); }}
          onError={(e) => { e.target.style.display = "none"; }}/>}
        <div style={{ position: "absolute", top: 10, left: 16, fontSize: 11, color: W.dim, fontFamily: "monospace", cursor: "pointer" }}
          onClick={() => { haptic("light"); onBack(); }}>← Back</div>
        <TapTarget onClick={() => { haptic("medium"); setShareOpen(true); }} label={`Share ${m.title}`} minTap={false}
          style={{ position: "absolute", top: 10, right: 16, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShareIcon size={14} color="#fff"/>
        </TapTarget>
        {trailer && trailer.video_key && <div onClick={() => { haptic("medium"); setTrailerOpen(true); }}
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <div style={{ width: 44, height: 44, background: `${W.accent}cc`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>▶</div>
          <span style={{ fontSize: 9, color: "#fff", fontFamily: "monospace", fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>PLAY TRAILER</span>
        </div>}
        <div style={{ position: "absolute", bottom: -40, left: 22 }}>
          <Poster url={m.poster_url} title={m.title} w={72} h={100} radius={10}
            onClick={() => { haptic("light"); setViewerImage(m.poster_url); }}/>
        </div>
      </div>
      <div style={{ padding: "48px 22px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: W.text, fontFamily: "monospace", letterSpacing: -0.5 }}>{m.title}</span>
            {m.is_international && <Badge color="purple">{m.original_language?.toUpperCase()}</Badge>}
            {isUpcoming && <Badge color="orange">UPCOMING</Badge>}
          </div>
          {m.original_title && m.original_title !== m.title && <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", fontStyle: "italic" }}>{m.original_title}</div>}
          <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", marginTop: 3 }}>
            {m.release_year}{m.runtime_minutes ? ` · ${Math.floor(m.runtime_minutes / 60)}h ${m.runtime_minutes % 60}m` : ""}{m.content_rating ? ` · ${m.content_rating}` : ""}
            {m.directors?.[0]?.name && ` · ${m.directors[0].name}`}
          </div>
          {isUpcoming && m.release_date && (() => {
            const d = daysUntil(m.release_date);
            const label = d > 0 ? `${d}d away` : d === 0 ? "TODAY" : "Released";
            return <div style={{ fontSize: 10, color: W.accent, fontFamily: "monospace", fontWeight: 700, marginTop: 4 }}>📅 {formatReleaseDate(m.release_date)} · {label}</div>;
          })()}
          {isUpcoming && m.must_see_reason && <div style={{ fontSize: 10, color: W.gold, fontFamily: "monospace", marginTop: 3 }}>{m.must_see_reason}</div>}
        </div>
        {!isUpcoming && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {m.global_rank && <div style={{ background: W.accentDim, border: `1px solid ${W.accent}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: W.accent, fontFamily: "monospace" }}>#{m.global_rank}</div>
            <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>RATED</div>
          </div>}
          {m.imdb_rating && <div style={{ background: W.goldDim, border: `1px solid ${W.gold}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>{m.imdb_rating}</div>
            <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>IMDb</div>
          </div>}
          {m.rotten_tomatoes_score && <div style={{ background: W.greenDim, border: `1px solid ${W.green}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: W.green, fontFamily: "monospace" }}>{m.rotten_tomatoes_score}%</div>
            <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>RT</div>
          </div>}
          {m.global_elo_score && <div style={{ background: W.blueDim, border: `1px solid ${W.blue}33`, borderRadius: 10, padding: "6px 12px", textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: W.blue, fontFamily: "monospace" }}>{m.global_elo_score}</div>
            <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>ELO</div>
          </div>}
        </div>}
        {isUpcoming && m.anticipation_score && <div style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>ANTICIPATION</span>
            <span style={{ fontSize: 9, color: W.gold, fontFamily: "monospace", fontWeight: 700 }}>{m.anticipation_score}/1000</span>
          </div>
          <div style={{ height: 4, background: W.border, borderRadius: 2 }}>
            <div style={{ height: "100%", background: `linear-gradient(90deg,${W.gold},${W.accent})`, borderRadius: 2, width: `${m.anticipation_score / 10}%` }}/>
          </div>
          <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 6 }}>👀 {m.watchlist_count?.toLocaleString()} watching</div>
        </div>}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {m.genres?.map((g) => <span key={g.name}
            style={{ padding: "3px 10px", borderRadius: 16, fontSize: 9, fontFamily: "monospace", fontWeight: 600, background: W.card, border: `1px solid ${W.border}`, color: W.dim }}>{g.name}</span>)}
        </div>
        <div style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6 }}>
          {m.synopsis?.slice(0, 200)}{m.synopsis?.length > 200 && <span style={{ color: W.accent, fontWeight: 600 }}> read more</span>}
        </div>
        {isUpcoming ? (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }} onClick={() => onToggleWatchlist && onToggleWatchlist(m.id)}>
              <div style={{ background: inWatchlist ? W.blueDim : W.accent, border: inWatchlist ? `1px solid ${W.blue}` : "none", color: inWatchlist ? W.blue : "#fff", borderRadius: 12, padding: "9px 14px", fontSize: 10, fontWeight: 700, textAlign: "center", fontFamily: "monospace", cursor: "pointer" }}>{inWatchlist ? "◆ IN WATCHLIST" : "+ ADD TO WATCHLIST"}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }} onClick={() => onRank && onRank(m)}><Btn accent full small>⚡ RANK</Btn></div>
            <div style={{ flex: 1 }} onClick={() => setSaved(!saved)}>
              {/* SAVE button matches Btn's small/full styling so all three buttons in
                  this row are the same height. Only color differs: blue tint when
                  saved (◆), default border when not (◇). */}
              <TapTarget label={saved ? "Unsave movie" : "Save movie"} minTap={false}
                style={{ background: saved ? W.blueDim : "transparent", border: saved ? `1px solid ${W.blue}` : `1px solid ${W.border}`, color: saved ? W.blue : W.dim, borderRadius: 12, padding: "8px 14px", fontSize: 10, fontWeight: 700, textAlign: "center", width: "100%", fontFamily: "monospace", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 36 }}>
                {saved ? "◆ SAVED" : "◇ SAVE"}
              </TapTarget>
            </div>
            <div style={{ flex: 1 }} onClick={() => setShowReview(true)}><Btn full small>✎ REVIEW</Btn></div>
          </div>
        )}
        {m.cast?.length > 0 && m.cast[0].name !== "TBA" && <>
          <div style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1, marginTop: 4 }}>CAST</div>
          <div className="no-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto" }}>
            {m.cast.slice(0, 5).map((c, i) => (
              <div key={i} style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: W.card, border: `1px solid ${W.border}`, margin: "0 auto 3px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: W.text, fontFamily: "monospace", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name.split(" ").pop()}</div>
                <div style={{ fontSize: 8, color: W.dim, fontFamily: "monospace" }}>{c.character_name}</div>
              </div>
            ))}
          </div>
        </>}
        {!isUpcoming && <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {[
            { n: m.user_rating_count || 0, l: "Ratings" },
            { n: m.review_count || 0,      l: "Reviews" },
            { n: m.watchlist_count || 0,   l: "Watchlisted" },
            { n: m.seen_count || 0,        l: "Seen" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", background: W.card, borderRadius: 8, padding: "6px 4px", border: `1px solid ${W.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: W.text, fontFamily: "monospace" }}>{s.n > 999 ? `${(s.n / 1000).toFixed(1)}k` : s.n}</div>
              <div style={{ fontSize: 7, color: W.dim, fontFamily: "monospace" }}>{s.l}</div>
            </div>
          ))}
        </div>}

        {/* People you follow who rated/reviewed this movie. Mocked from a stable
            hash of (handle + movie id) so the same user shows up consistently. */}
        {!isUpcoming && (() => {
          const followedActivity = Array.from(followingHandles).map((handle) => {
            const prof = USER_PROFILES[handle];
            if (!prof) return null;
            const seed = (handle + m.id).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
            const rated = seed % 3 !== 0; // 2/3 of followed users have rated this
            if (!rated) return null;
            const score = 6 + (seed % 5); // 6-10
            const hasReview = seed % 4 === 0; // 1/4 also wrote a review
            const reviewBits = [
              "A masterclass in tension and pacing.",
              "Exactly the kind of film I come back to.",
              "Beautifully shot, emotionally wrecking.",
              "Overrated but still compelling.",
              "Genre-defining performance from the lead.",
              "Visually stunning but narratively uneven.",
            ];
            const review = hasReview ? reviewBits[seed % reviewBits.length] : null;
            return { handle, prof, score, review };
          }).filter(Boolean);

          if (followedActivity.length === 0) return null;
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: W.dim, fontFamily: "monospace", letterSpacing: 1 }}>👥 PEOPLE YOU FOLLOW</span>
                <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>· {followedActivity.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {followedActivity.map((a) => (
                  <div key={a.handle} onClick={() => onSelectUser && onSelectUser(a.handle)}
                    style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: W.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: W.text, fontFamily: "monospace", flexShrink: 0 }}>{a.prof.avatar}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: W.accent, fontFamily: "monospace" }}>{a.handle}</span>
                          {a.prof.badge && <span style={{ fontSize: 11 }}>{a.prof.badge}</span>}
                        </div>
                        <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 1 }}>{a.review ? "reviewed" : "ranked"}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: W.gold, fontFamily: "monospace" }}>{a.score}/10</div>
                      </div>
                    </div>
                    {a.review && <div style={{ fontSize: 10, color: W.dim, fontFamily: "monospace", fontStyle: "italic", marginTop: 6, lineHeight: 1.5, borderTop: `1px solid ${W.border}`, paddingTop: 6 }}>"{a.review}"</div>}
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {m.keywords && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
          {m.keywords.slice(0, 6).map((k) => <span key={k}
            style={{ padding: "2px 8px", borderRadius: 10, fontSize: 8, fontFamily: "monospace", background: W.card, border: `1px solid ${W.border}`, color: W.dim }}>#{k}</span>)}
        </div>}
      </div>
    </div>
  );
};
