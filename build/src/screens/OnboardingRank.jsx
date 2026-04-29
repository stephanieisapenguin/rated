import { useEffect, useState } from "react";

import { Poster } from "../components/Poster";
import { TapTarget } from "../components/TapTarget";
import { haptic } from "../lib/haptic";
import { MOVIES } from "../lib/mockData";
import { tmdbPopular, tmdbSearch } from "../lib/tmdb";
import { W } from "../theme";

const TARGET = 5;

// First-run tutorial. Shows the user 10 popular films plus a search box, asks
// them to rank at least 5 so they understand the pairwise-comparison flow
// before the rest of the app opens up. Dismissible after the target — or
// skippable at any point if they bail. AppInner controls the actual ranking
// flow via onPickMovie; this screen just teaches and tracks progress.
export const OnboardingRank = ({ rankedCount = 0, onPickMovie, onSkip, onDone }) => {
  const [popular, setPopular] = useState(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // Fetch the top 10 popular films from TMDB. Falls back to the 5 hardcoded
  // MOVIES if TMDB is offline so the tutorial still works.
  useEffect(() => {
    let cancelled = false;
    tmdbPopular().then((data) => {
      if (!cancelled) setPopular(data && data.length > 0 ? data.slice(0, 10) : MOVIES);
    });
    return () => { cancelled = true; };
  }, []);

  // Debounced search — 400ms, only fires for queries 2+ chars.
  useEffect(() => {
    if (query.length < 2) { setSearchResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const data = await tmdbSearch(query);
      if (!cancelled) {
        setSearchResults(data || []);
        setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const movies = query.length >= 2 ? (searchResults || []) : (popular || []);
  const remaining = Math.max(0, TARGET - rankedCount);
  const ready = rankedCount >= TARGET;
  const progressPct = Math.min(100, (rankedCount / TARGET) * 100);

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 22px 8px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: W.accent, fontFamily: "monospace", letterSpacing: 1.5 }}>
          STEP 1 OF 1 · WELCOME
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: W.text, fontFamily: "monospace", margin: "6px 0 4px", letterSpacing: -0.5 }}>
          Rank your first {TARGET} movies
        </h1>
        <p style={{ fontSize: 11, color: W.dim, fontFamily: "monospace", lineHeight: 1.6, margin: 0 }}>
          Tap a movie you've seen — we'll ask you to compare it to others to
          figure out exactly where it ranks. The more you rank, the smarter
          your taste profile gets.
        </p>
      </div>

      {/* Progress strip — sticky-ish so it's always visible while scrolling */}
      <div style={{ padding: "10px 22px 14px", borderBottom: `1px solid ${W.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: ready ? W.green : W.dim, fontFamily: "monospace" }}>
            {ready ? "✓ READY" : `${rankedCount} / ${TARGET} RANKED`}
          </span>
          {!ready && <span style={{ fontSize: 9, color: W.dim, fontFamily: "monospace" }}>{remaining} more to go</span>}
        </div>
        <div style={{ height: 4, background: W.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: ready ? W.green : W.accent, borderRadius: 2, transition: "width 0.3s, background 0.3s" }}/>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 22px 6px" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ Or search for a movie you've seen..."
          type="search" enterKeyHint="search" aria-label="Search movies"
          style={{ width: "100%", background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 11, color: W.text, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}/>
      </div>

      {/* Movie grid */}
      <div style={{ flex: 1, padding: "8px 22px 16px" }}>
        {!popular && query.length < 2 && <div style={{ textAlign: "center", padding: "40px 0", fontSize: 11, color: W.dim, fontFamily: "monospace" }}>Loading popular films…</div>}
        {query.length >= 2 && searching && (searchResults || []).length === 0 && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 10, color: W.dim, fontFamily: "monospace" }}>Searching…</div>}
        {query.length >= 2 && !searching && (searchResults || []).length === 0 && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 10, color: W.dim, fontFamily: "monospace" }}>No results for "{query}"</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {movies.map((m) => (
            <TapTarget key={m.id} onClick={() => { haptic("medium"); onPickMovie && onPickMovie(m); }} label={`Rank ${m.title}`} minTap={false}
              style={{ background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
              <Poster url={m.poster_url} title={m.title} w="100%" h={200} radius={8}/>
              <div style={{ minHeight: 38 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.text, fontFamily: "monospace", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{m.title}</div>
                <div style={{ fontSize: 9, color: W.dim, fontFamily: "monospace", marginTop: 2 }}>{m.release_year}</div>
              </div>
              <div style={{ background: W.accent, color: "#fff", borderRadius: 8, padding: "6px 0", textAlign: "center", fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>
                ⚡ RANK THIS
              </div>
            </TapTarget>
          ))}
        </div>
      </div>

      {/* Footer actions — fixed at bottom-ish via the natural scroll layout. */}
      <div style={{ padding: "12px 22px 22px", borderTop: `1px solid ${W.border}`, background: W.bg, display: "flex", gap: 8 }}>
        {ready ? (
          <TapTarget onClick={() => { haptic("heavy"); onDone && onDone(); }} label="Finish onboarding" minTap={false}
            style={{ flex: 1, padding: "13px", background: W.accent, color: "#fff", borderRadius: 12, textAlign: "center", fontSize: 12, fontWeight: 900, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48 }}>
            ✓ DONE — TAKE ME HOME
          </TapTarget>
        ) : (
          <TapTarget onClick={() => { haptic("light"); onSkip && onSkip(); }} label="Skip for now" minTap={false}
            style={{ flex: 1, padding: "13px", background: "transparent", color: W.dim, border: `1px solid ${W.border}`, borderRadius: 12, textAlign: "center", fontSize: 11, fontWeight: 700, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48 }}>
            Skip for now
          </TapTarget>
        )}
      </div>
    </div>
  );
};
