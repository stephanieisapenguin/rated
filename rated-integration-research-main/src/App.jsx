import React, { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// API LAYER
// Set API_BASE to your running FastAPI server.
// Falls back to mock data automatically when the server is unreachable.
// ─────────────────────────────────────────────────────────────────────────────

// API_BASE points to your backend. Set VITE_API_BASE_URL in .env for local dev
// (defaults to localhost:8000) or in Netlify's Environment Variables for production.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// API.call() returns the parsed JSON response, or null if the server is unreachable.
// On null, callers fall back to mock data so the UI never appears broken.
async function api(method, path, body, token) {
  try {
    const res = await fetch(`${API_BASE}${path}${token ? `?session_token=${token}` : ""}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e.message?.includes("401") || e.message?.includes("403")) throw e;
    console.warn(`[API] ${method} ${path} →`, e.message);
    return null;
  }
}

const API = {
  login:           (id_token)                      => api("POST", "/auth/login",  { id_token }),
  checkUsername:   (u)                             => api("GET",  `/auth/username/check/${u}`),
  setUsername:     (username, token)               => api("POST", "/auth/username", { username }, token),
  getRankings:     (uid, token)                    => api("GET",  `/users/${uid}/rankings`, null, token),
  addRanking:      (uid, movie_id, score, token)   => api("POST", `/users/${uid}/rankings`, { movie_id, score }, token),
  recordPairwise:  (uid, winner_id, loser_id, tok) => api("POST", `/users/${uid}/pairwise`, { winner_movie_id: winner_id, loser_movie_id: loser_id }, tok),
  getFeed:         (uid, token)                    => api("GET",  `/users/${uid}/feed`, null, token),
  follow:          (uid, followee_id, token)       => api("POST", `/users/${uid}/follow`, { followee_id }, token),
  unfollow:        (uid, fid, token)               => api("DELETE",`/users/${uid}/follow/${fid}`, null, token),
  getUserByUsername: (handle, token)              => api("GET",  `/users/by-username/${handle.replace(/^@/, "")}`, null, token),
  addSaved:        (uid, movie_id, token)          => api("POST", `/users/${uid}/saved`, { movie_id }, token),
  removeSaved:     (uid, movie_id, token)          => api("DELETE",`/users/${uid}/saved/${movie_id}`, null, token),
  getSaved:        (uid, token)                    => api("GET",  `/users/${uid}/saved`, null, token),
  submitReview:    (uid, movie_id, rating, text, token) => api("POST", `/users/${uid}/reviews`, { movie_id, rating, text }, token),
  deleteReview:    (uid, movie_id, token)          => api("DELETE",`/users/${uid}/reviews/${movie_id}`, null, token),
  getUserReviews:  (uid, token)                    => api("GET",  `/users/${uid}/reviews`, null, token),
  getMovieReviews: (movie_id, token)               => api("GET",  `/movies/${movie_id}/reviews`, null, token),
  getWatchlist:    (uid, token)                    => api("GET",  `/users/${uid}/watchlist`, null, token),
  addWatchlist:    (uid, movie_id, token)          => api("POST", `/users/${uid}/watchlist`, { movie_id }, token),
  removeWatchlist: (uid, movie_id, token)          => api("DELETE",`/users/${uid}/watchlist/${movie_id}`, null, token),
  topMovies:       ()                              => api("GET",  "/movies/top"),
  movieStats:      (movie_id)                      => api("GET",  `/movies/${movie_id}/stats`),
};

// ─────────────────────────────────────────────────────────────────────────────
// STATIC DATA  (fallback when API is offline)
// ─────────────────────────────────────────────────────────────────────────────

const TMDB = "https://image.tmdb.org/t/p";

// ─────────────────────────────────────────────────────────────────────────────
// TMDB API client — fetches real popular/upcoming/top-rated films and search.
// Replace TMDB_API_KEY below with a real key from themoviedb.org (Settings → API).
// When the key is a placeholder, TMDB_ENABLED is false and all calls fall back
// to the hardcoded MOVIES/UPCOMING arrays below (zero breakage, nothing to config).
// ─────────────────────────────────────────────────────────────────────────────
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || "YOUR_TMDB_KEY_HERE";
const TMDB_API_BASE = "https://api.themoviedb.org/3";
const TMDB_ENABLED = TMDB_API_KEY && TMDB_API_KEY !== "YOUR_TMDB_KEY_HERE" && TMDB_API_KEY.length > 10;

// Module-level cache keyed by URL path. Lists get a 10-minute TTL, individual
// movie details are cached indefinitely since they don't meaningfully change.
const TMDB_CACHE = new Map(); // key -> {data, expiresAt}
const TMDB_LIST_TTL = 10 * 60 * 1000;

async function tmdbFetch(path, { ttl = TMDB_LIST_TTL } = {}) {
  if (!TMDB_ENABLED) return null;
  const cached = TMDB_CACHE.get(path);
  if (cached && (cached.expiresAt === 0 || cached.expiresAt > Date.now())) return cached.data;
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${TMDB_API_BASE}${path}${sep}api_key=${TMDB_API_KEY}`);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    TMDB_CACHE.set(path, { data, expiresAt: ttl === 0 ? 0 : Date.now() + ttl });
    return data;
  } catch (e) {
    console.warn("[TMDB]", path, e.message);
    return null;
  }
}

// TMDB genre id → name mapping (cached on first fetch, rarely changes)
let TMDB_GENRES = null;
async function getTmdbGenres() {
  if (TMDB_GENRES) return TMDB_GENRES;
  const data = await tmdbFetch("/genre/movie/list", { ttl: 0 });
  if (!data?.genres) return {};
  TMDB_GENRES = Object.fromEntries(data.genres.map(g => [g.id, g.name]));
  return TMDB_GENRES;
}

// Normalize a TMDB movie object to the app's internal movie schema.
// Works for both list results (minimal fields) and detail results (full).
function mapTmdbMovie(t, genreMap = TMDB_GENRES || {}) {
  if (!t) return null;
  const year = t.release_date ? parseInt(t.release_date.slice(0, 4), 10) : null;
  const genres = (t.genres || (t.genre_ids || []).map(id => ({ id, name: genreMap[id] || "" }))).filter(g => g.name);
  // Detail response includes credits; list responses don't.
  const directors = (t.credits?.crew || []).filter(p => p.job === "Director").map(p => ({ name: p.name }));
  const cast = (t.credits?.cast || []).slice(0, 10).map(p => ({
    name: p.name,
    character_name: p.character,
    profile_url: p.profile_path ? `${TMDB}/w185${p.profile_path}` : null,
  }));
  const trailers = (t.videos?.results || [])
    .filter(v => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
    .map((v, i) => ({ title: v.name, video_key: v.key, is_primary: i === 0 }));
  return {
    id: `tmdb-${t.id}`,
    tmdb_id: t.id,
    title: t.title,
    original_title: t.original_title,
    is_international: t.original_language && t.original_language !== "en",
    original_language: t.original_language,
    release_year: year,
    release_date: t.release_date || null,
    runtime_minutes: t.runtime || null,
    content_rating: null, // TMDB doesn't expose MPAA in base response
    overview: t.overview || "",
    tagline: t.tagline || "",
    poster_url: t.poster_path ? `${TMDB}/w500${t.poster_path}` : null,
    backdrop_url: t.backdrop_path ? `${TMDB}/w1280${t.backdrop_path}` : null,
    genres,
    directors,
    cast,
    trailers,
    avg_user_rating: t.vote_average ? Math.round(t.vote_average * 10) / 10 : null,
    user_rating_count: t.vote_count || 0,
    popularity: t.popularity || 0,
    trending_rank: null, // will be set by list index when applicable
    watchlist_count: 0, // app-level, not from TMDB
    seen_count: 0,
    review_count: 0,
    global_elo_score: null,
    global_rank: null,
    is_highlighted: false,
    anticipation_score: null,
    is_must_see: false,
    must_see_reason: "",
  };
}

// Public TMDB helpers — each returns mapped movie arrays or null on failure.
async function tmdbPopular() {
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch("/movie/popular?language=en-US&page=1");
  if (!data?.results) return null;
  const mapped = data.results.map((r, i) => {
    const m = mapTmdbMovie(r, genreMap);
    if (m) m.trending_rank = i + 1;
    return m;
  }).filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
async function tmdbUpcoming() {
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch("/movie/upcoming?language=en-US&page=1");
  if (!data?.results) return null;
  // Filter to actually-unreleased films (TMDB sometimes includes already-released ones)
  const today = new Date().toISOString().slice(0, 10);
  const mapped = data.results
    .filter(r => r.release_date && r.release_date > today)
    .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))
    .map(r => mapTmdbMovie(r, genreMap))
    .filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
async function tmdbTopRated() {
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch("/movie/top_rated?language=en-US&page=1");
  if (!data?.results) return null;
  const mapped = data.results.map((r, i) => {
    const m = mapTmdbMovie(r, genreMap);
    if (m) m.global_rank = i + 1;
    return m;
  }).filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
async function tmdbSearch(query) {
  if (!query || query.length < 2) return null;
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
  if (!data?.results) return null;
  const mapped = data.results.map(r => mapTmdbMovie(r, genreMap)).filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
// Fetch full movie detail (cast, trailers, etc). Cached indefinitely.
async function tmdbMovieDetail(tmdbId) {
  if (!tmdbId) return null;
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch(`/movie/${tmdbId}?append_to_response=credits,videos&language=en-US`, { ttl: 0 });
  if (!data) return null;
  return mapTmdbMovie(data, genreMap);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified movie lookup — bridges mock MOVIES[] and TMDB-backed data.
// When the feed contains items with TMDB IDs (tmdb-123) but MOVIES[] only has
// mock IDs (m-001), we need one helper both data sources can agree on.
//
// findMovieSync: returns immediately with whatever we have — MOVIES hit, cached
//   TMDB hit, or a minimal stub built from the feed item itself. Never async,
//   never returns null if at least movie_id or movie_title is known.
// findMovieAsync: prefers findMovieSync's result, then in the background fills in
//   full TMDB detail and returns the hydrated version. Used by MovieDetailScreen.
//
// TMDB_MOVIE_INDEX caches mapped movies keyed by their app id (tmdb-xxx) so
// repeated lookups from feed items don't refetch.
// ─────────────────────────────────────────────────────────────────────────────
const TMDB_MOVIE_INDEX = new Map(); // app-id (e.g. "tmdb-123") -> mapped movie object

// Register mapped TMDB movies as they flow through the app so findMovieSync can
// find them later. Call sites: list results from tmdbPopular/Upcoming/Search/TopRated.
function indexTmdbMovies(movies) {
  if (!movies) return;
  for (const m of movies) {
    if (m?.id && m.tmdb_id) TMDB_MOVIE_INDEX.set(m.id, m);
  }
}

// Synchronous lookup. Returns a movie object (may be partial for TMDB ids not yet cached).
// Never returns null if id or title is provided — guarantees navigation always has something.
// Only safe to call after module init — i.e. from component render code, not top-level.
function findMovieSync(id, title) {
  if (id) {
    // 1. Mock hardcoded movies
    const hit = MOVIES.find(m => m.id === id);
    if (hit) return hit;
    // 2. Cached TMDB movies (from any previous list fetch)
    if (TMDB_MOVIE_INDEX.has(id)) return TMDB_MOVIE_INDEX.get(id);
  }
  // 3. Title fallback — useful for feed items where the id doesn't match either source
  if (title) {
    const byTitle = MOVIES.find(m => m.title === title);
    if (byTitle) return byTitle;
  }
  // 4. Last resort — build a stub from what we know so MovieDetailScreen can still
  //    open and async-enrich via tmdbMovieDetail if the id is a tmdb id.
  if (!id && !title) return null;
  const tmdbId = id && id.startsWith("tmdb-") ? parseInt(id.slice(5), 10) : null;
  return {
    id: id || `stub-${Date.now()}`,
    tmdb_id: tmdbId,
    title: title || "Unknown",
    poster_url: null,
    backdrop_url: null,
    genres: [],
    directors: [],
    cast: [],
    trailers: [],
    overview: "",
  };
}

// Async lookup with TMDB hydration. Returns the fullest possible movie record.
async function findMovieAsync(id, title) {
  const base = findMovieSync(id, title);
  if (!base) return null;
  // If it's already a fully-hydrated record (has poster and genres), return as-is.
  if (base.poster_url && base.genres?.length > 0 && base.cast?.length > 0) return base;
  // If it has a tmdb_id, try to hydrate.
  if (base.tmdb_id && TMDB_ENABLED) {
    const full = await tmdbMovieDetail(base.tmdb_id);
    if (full) {
      const merged = { ...base, ...full, id: base.id };
      TMDB_MOVIE_INDEX.set(merged.id, merged);
      return merged;
    }
  }
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMING — W is a live proxy. Reading W.bg returns the active theme's bg.
// App.setTheme() flips ACTIVE_THEME and forces re-render.
// ─────────────────────────────────────────────────────────────────────────────
const DARK_THEME = {
  bg:"#0f0f13", card:"#1a1a22", border:"#2c2c3a",
  text:"#ededf2", dim:"#6e6e82",
  accent:"#ff3b3b", accentDim:"#ff3b3b28",
  green:"#10b981", greenDim:"#10b98122",
  gold:"#eab308", goldDim:"#eab30822",
  blue:"#3b82f6", blueDim:"#3b82f622",
  purple:"#a855f7", purpleDim:"#a855f722",
  orange:"#f97316", orangeDim:"#f9731622",
};
const LIGHT_THEME = {
  bg:"#f7f7fa", card:"#ffffff", border:"#e5e5ec",
  text:"#18181e", dim:"#6e6e82",
  accent:"#e5252f", accentDim:"#e5252f18",
  green:"#059669", greenDim:"#05966918",
  gold:"#ca8a04", goldDim:"#ca8a0418",
  blue:"#2563eb", blueDim:"#2563eb18",
  purple:"#9333ea", purpleDim:"#9333ea18",
  orange:"#ea580c", orangeDim:"#ea580c18",
};
// Active palette — mutated by App shell when user toggles theme
let ACTIVE_THEME = DARK_THEME;
const setActiveTheme = (t) => { ACTIVE_THEME = t==="light" ? LIGHT_THEME : DARK_THEME; };
// W is a Proxy — reads go to the current ACTIVE_THEME
const W = new Proxy({}, { get: (_, prop) => ACTIVE_THEME[prop] });

// Dynamic type — user-adjustable font scale (0.9=small, 1.0=normal, 1.15=large, 1.3=extra-large)
let TYPE_SCALE = 1.0;
const setTypeScale = (s) => { TYPE_SCALE = s; };

const MOVIES = [
  { id:"m-001", title:"Interstellar", release_year:2014, runtime_minutes:169, content_rating:"PG-13",
    synopsis:"A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    original_language:"en", is_international:false,
    poster_url:`${TMDB}/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg`,
    backdrop_url:`${TMDB}/w1280/xJHokMbljXjADYdit5fK1DVfjko.jpg`,
    genres:[{name:"Sci-Fi"},{name:"Drama"},{name:"Adventure"}],
    directors:[{name:"Christopher Nolan"}],
    cast:[{name:"Matthew McConaughey",character_name:"Cooper"},{name:"Anne Hathaway",character_name:"Brand"},{name:"Jessica Chastain",character_name:"Murph"}],
    trailers:[{title:"Official Trailer",video_key:"zSWdZVtXT7E",is_primary:true}],
    keywords:["space","wormhole","nasa","black hole","time travel"],
    imdb_rating:8.7, rotten_tomatoes_score:73, global_elo_score:1952, global_rank:1,
    avg_user_rating:9.2, user_rating_count:3241, review_count:47, trending_rank:3,
    watchlist_count:1247, seen_count:8934, is_highlighted:true },
  { id:"m-002", title:"Parasite", original_title:"기생충", release_year:2019, runtime_minutes:132, content_rating:"R",
    synopsis:"Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    original_language:"ko", is_international:true,
    poster_url:`${TMDB}/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg`,
    backdrop_url:`${TMDB}/w1280/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg`,
    genres:[{name:"Thriller"},{name:"Drama"},{name:"Comedy"}],
    directors:[{name:"Bong Joon-ho"}],
    cast:[{name:"Song Kang-ho",character_name:"Ki-taek"},{name:"Choi Woo-shik",character_name:"Ki-woo"}],
    trailers:[{title:"Official Trailer",video_key:"SEUXfv87Wpk",is_primary:true}],
    keywords:["class differences","wealth","dark comedy","seoul"],
    imdb_rating:8.5, rotten_tomatoes_score:98, global_elo_score:1845, global_rank:3,
    avg_user_rating:9.0, user_rating_count:2890, review_count:62, trending_rank:8 },
  { id:"m-003", title:"The Dark Knight", release_year:2008, runtime_minutes:152, content_rating:"PG-13",
    synopsis:"Batman raises the stakes in his war on crime, facing the Joker, a criminal mastermind who plunges Gotham into anarchy.",
    original_language:"en", is_international:false,
    poster_url:`${TMDB}/w500/qJ2tW6WMUDux911BTUgMe1YRr.jpg`,
    genres:[{name:"Action"},{name:"Crime"},{name:"Drama"}],
    directors:[{name:"Christopher Nolan"}],
    cast:[{name:"Christian Bale",character_name:"Batman"},{name:"Heath Ledger",character_name:"Joker"}],
    trailers:[{title:"Official Trailer",video_key:"EXeTwQWrcwY",is_primary:true}],
    imdb_rating:9.0, global_elo_score:1823, global_rank:4, avg_user_rating:9.1, trending_rank:12,
    user_rating_count:4187, review_count:89, watchlist_count:982, seen_count:12034 },
  { id:"m-004", title:"Whiplash", release_year:2014, runtime_minutes:107, content_rating:"R",
    synopsis:"A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing.",
    original_language:"en", is_international:false,
    poster_url:`${TMDB}/w500/oPxnRhyAEBhPIT5uXGb02JMbuz.jpg`,
    genres:[{name:"Drama"},{name:"Music"}],
    directors:[{name:"Damien Chazelle"}],
    cast:[{name:"Miles Teller",character_name:"Andrew"},{name:"J.K. Simmons",character_name:"Fletcher"}],
    imdb_rating:8.5, global_elo_score:1768, global_rank:8, avg_user_rating:8.9, trending_rank:15,
    user_rating_count:1876, review_count:34, watchlist_count:567, seen_count:4521 },
  { id:"m-005", title:"RRR", original_title:"RRR", release_year:2022, runtime_minutes:187,
    synopsis:"A fictitious story about two legendary revolutionaries and their journey away from home before they began fighting for their country in the 1920s.",
    original_language:"te", is_international:true,
    poster_url:`${TMDB}/w500/nEufeZYpKOlqp3fkDJKVECVpfjn.jpg`,
    genres:[{name:"Action"},{name:"Drama"}],
    directors:[{name:"S.S. Rajamouli"}],
    cast:[{name:"N.T. Rama Rao Jr.",character_name:"Bheem"},{name:"Ram Charan",character_name:"Ram"}],
    imdb_rating:7.8, global_elo_score:1689, global_rank:14, avg_user_rating:8.4, trending_rank:20,
    user_rating_count:1342, review_count:28, watchlist_count:892, seen_count:3214 },
];

const UPCOMING = [
  { id:"u-001", title:"The Mummy", release_year:2026, release_date:"2026-05-15", days_until_release:43,
    synopsis:"A new chapter in the legendary franchise. An ancient terror is unleashed when an expedition unearths something that should have stayed buried.",
    poster_url:`${TMDB}/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg`,
    genres:[{name:"Horror"},{name:"Adventure"}], directors:[{name:"Lee Cronin"}], cast:[{name:"TBA",character_name:"Lead"}],
    anticipation_score:720, is_must_see:true, must_see_reason:"From the director of Evil Dead Rise", watchlist_count:342 },
  { id:"u-002", title:"Werwulf", release_year:2026, release_date:"2026-12-25", days_until_release:267,
    synopsis:"Robert Eggers returns to folk horror territory with a sweeping werewolf epic set in medieval Europe.",
    genres:[{name:"Horror"},{name:"Thriller"}], directors:[{name:"Robert Eggers"}], cast:[{name:"TBA",character_name:"Lead"}],
    anticipation_score:890, is_must_see:true, must_see_reason:"Robert Eggers' werewolf epic", watchlist_count:512 },
  { id:"u-003", title:"Resident Evil", release_year:2026, release_date:"2026-08-14", days_until_release:134,
    synopsis:"A new cinematic take on the iconic survival horror franchise from the director who brought us Barbarian.",
    genres:[{name:"Horror"},{name:"Action"},{name:"Sci-Fi"}], directors:[{name:"Zach Cregger"}], cast:[{name:"TBA",character_name:"Lead"}],
    anticipation_score:810, is_must_see:true, must_see_reason:"From the Barbarian director", watchlist_count:289 },
  { id:"u-004", title:"Scary Movie 6", release_year:2026, release_date:"2026-07-04", days_until_release:93,
    synopsis:"The Wayans brothers reunite for the long-awaited sixth installment of the beloved parody franchise.",
    genres:[{name:"Comedy"},{name:"Horror"}], directors:[{name:"Keenen Ivory Wayans"}], cast:[{name:"TBA",character_name:"Lead"}],
    anticipation_score:540, is_must_see:true, must_see_reason:"Wayans brothers return", watchlist_count:198 },
  { id:"u-005", title:"Blade", release_year:2026, release_date:"2026-09-20", days_until_release:162,
    synopsis:"Marvel's Daywalker returns in a gritty new MCU solo outing.",
    genres:[{name:"Action"},{name:"Sci-Fi"},{name:"Horror"}], directors:[{name:"Yann Demange"}],
    cast:[{name:"Mahershala Ali",character_name:"Blade"}],
    anticipation_score:870, is_must_see:true, must_see_reason:"Mahershala Ali as Blade", watchlist_count:678 },
  { id:"u-006", title:"28 Years Later", release_year:2026, release_date:"2026-06-20", days_until_release:70,
    synopsis:"Danny Boyle returns to the world that defined a generation of horror.",
    genres:[{name:"Horror"},{name:"Thriller"},{name:"Drama"}], directors:[{name:"Danny Boyle"}],
    cast:[{name:"Jodie Comer",character_name:"Lead"},{name:"Aaron Taylor-Johnson",character_name:"Lead"}],
    anticipation_score:950, is_must_see:true, must_see_reason:"Danny Boyle returns to 28 Days Later", watchlist_count:891 },
  { id:"u-007", title:"Sinners", release_year:2026, release_date:"2026-04-18", days_until_release:7,
    synopsis:"Ryan Coogler's blues-soaked supernatural thriller set in 1930s Mississippi.",
    genres:[{name:"Horror"},{name:"Drama"},{name:"Thriller"}], directors:[{name:"Ryan Coogler"}],
    cast:[{name:"Michael B. Jordan",character_name:"Twins"},{name:"Hailee Steinfeld",character_name:"Mary"}],
    anticipation_score:990, is_must_see:true, must_see_reason:"Ryan Coogler + Michael B. Jordan", watchlist_count:1203 },
  { id:"u-008", title:"Final Destination: Bloodlines", release_year:2026, release_date:"2026-05-16", days_until_release:35,
    synopsis:"Death's design returns. A new group of survivors cheat death — and then it starts collecting.",
    genres:[{name:"Horror"},{name:"Thriller"}], directors:[{name:"Zach Lipovsky"}], cast:[{name:"Kaitlyn Santa Juana",character_name:"Lead"}],
    anticipation_score:730, is_must_see:true, must_see_reason:"The franchise is back", watchlist_count:445 },
  { id:"u-009", title:"F1", release_year:2026, release_date:"2026-06-27", days_until_release:77,
    synopsis:"Brad Pitt plays a retired F1 driver who returns to race alongside a rookie.",
    genres:[{name:"Drama"},{name:"Action"}], directors:[{name:"Joseph Kosinski"}],
    cast:[{name:"Brad Pitt",character_name:"Sonny Hayes"},{name:"Damson Idris",character_name:"Joshua Pierce"}],
    anticipation_score:840, is_must_see:true, must_see_reason:"Brad Pitt + real F1 footage", watchlist_count:567 },
  { id:"u-010", title:"Mission: Impossible 8", release_year:2026, release_date:"2026-05-23", days_until_release:42,
    synopsis:"Ethan Hunt faces his most dangerous mission yet in the final chapter of the beloved franchise.",
    genres:[{name:"Action"},{name:"Thriller"}], directors:[{name:"Christopher McQuarrie"}],
    cast:[{name:"Tom Cruise",character_name:"Ethan Hunt"}],
    anticipation_score:920, is_must_see:true, must_see_reason:"Tom Cruise's final Mission", watchlist_count:1102 },
];

const ALL_GENRES = ["All","Horror","Action","Drama","Comedy","Sci-Fi","Thriller"];

const MOCK_FEED = [
  {id:"f-001",type:"rating",user:"@maya",avatar:"M",action:"rated",movie_title:"Interstellar",movie_id:"m-001",rating:9.5,time:"2m",likes:12,liked:false},
  {id:"f-002",type:"review",user:"@josh",avatar:"J",action:"reviewed",movie_title:"Parasite",movie_id:"m-002",preview:"Bong Joon-ho crafted something that transcends genre. The tonal shifts are masterful...",rating:9.0,time:"18m",likes:34,liked:false},
  {id:"f-003",type:"ranking",user:"@lina",avatar:"L",action:"ranked",movie_title:"The Dark Knight",movie_id:"m-003",rating:10,preview:"New #1 · dethroned Interstellar",rank_position:1,time:"1h",likes:8,liked:false},
  {id:"f-004",type:"save",user:"@carlos",avatar:"C",action:"saved",movie_title:"RRR",movie_id:"m-005",time:"2h",likes:3,liked:false},
  {id:"f-005",type:"streak",user:"@maya",avatar:"M",action:"hit a 12-week streak 🔥",time:"3h",likes:45,liked:false},
  {id:"f-006",type:"rating",user:"@filmfreak",avatar:"F",action:"rated",movie_title:"The Dark Knight",movie_id:"m-003",rating:10,time:"5h",likes:9,liked:false},
  {id:"f-007",type:"rating",user:"@cinephile99",avatar:"C",action:"rated",movie_title:"Whiplash",movie_id:"m-004",rating:9,time:"6h",likes:15,liked:false},
  {id:"f-008",type:"review",user:"@reeltalks",avatar:"R",action:"reviewed",movie_title:"Interstellar",movie_id:"m-001",preview:"Nolan's time-dilation sequence still wrecks me...",rating:9.5,time:"8h",likes:22,liked:false},
];

const MOCK_FRIENDS = [
  {id:"u-maya",username:"maya",avatar:"M",is_following:false,follows_me:true},
  {id:"u-josh",username:"josh",avatar:"J",is_following:true,follows_me:true},
  {id:"u-lina",username:"lina",avatar:"L",is_following:false,follows_me:false},
  {id:"u-carlos",username:"carlos",avatar:"C",is_following:true,follows_me:false},
];

const TAKEN_USERNAMES = new Set([
  "jasonk","maya","josh","lina","carlos","cinephile99","filmfreak","reeltalks","admin","rated","movies","film"
]);

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// UX UTILITIES — haptics, pull-to-refresh, skeletons, swipe, image viewer, share
// ─────────────────────────────────────────────────────────────────────────────

// Haptic feedback. On web, uses navigator.vibrate (mobile browsers only).
// On native, this would call iOS/Android Haptics.impactAsync (light/medium/heavy).
const haptic = (intensity="light") => {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    const dur = intensity==="heavy" ? 20 : intensity==="medium" ? 12 : 6;
    try { navigator.vibrate(dur); } catch(e) {}
  }
};

// Online status — tracks browser connection state
const useOnlineStatus = () => {
  const [online, setOnline] = useState(typeof navigator!=="undefined" ? navigator.onLine : true);
  useEffect(()=>{
    const on = ()=>setOnline(true);
    const off = ()=>setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return ()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);
  return online;
};

// Ticker for relative timestamps — re-renders consumers every minute
const useMinuteTick = () => {
  const [, setTick] = useState(0);
  useEffect(()=>{
    const id = setInterval(()=>setTick(t=>t+1), 60000);
    return ()=>clearInterval(id);
  },[]);
};

// Format a relative time string from a ms timestamp
const formatRelativeTime = (ts) => {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  const d = new Date(ts);
  const oneYr = 365*24*60*60*1000;
  if (diff < oneYr) return d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
};

// Parse a short relative string ("2m", "3h", "1d", "2w", "just now") into a timestamp.
// Used to turn static mock data into "live" timestamps that tick properly.
const parseRelativeToTs = (s) => {
  if (!s) return Date.now();
  const str = String(s).toLowerCase().trim();
  if (str.includes("just")) return Date.now() - 10000; // 10s ago
  const m = str.match(/^(\d+)\s*([smhdw])/);
  if (!m) return Date.now();
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult = unit==="s" ? 1000
    : unit==="m" ? 60*1000
    : unit==="h" ? 60*60*1000
    : unit==="d" ? 24*60*60*1000
    : unit==="w" ? 7*24*60*60*1000
    : 60*1000;
  return Date.now() - n * mult;
};

// Keyboard avoidance — scrolls focused input into view when mobile keyboard opens
const useKeyboardAvoidance = () => {
  useEffect(()=>{
    if (typeof window==="undefined" || !window.visualViewport) return;
    const handleResize = () => {
      const active = document.activeElement;
      if (active && (active.tagName==="INPUT"||active.tagName==="TEXTAREA")) {
        setTimeout(()=>active.scrollIntoView({block:"center",behavior:"smooth"}), 100);
      }
    };
    window.visualViewport.addEventListener("resize", handleResize);
    return ()=>window.visualViewport.removeEventListener("resize", handleResize);
  },[]);
};

// Confirm dialog hook — reusable destructive action confirmation
const useConfirm = () => {
  const [state, setState] = useState(null);
  const confirm = (opts) => setState(opts);
  const close = () => setState(null);
  const ConfirmDialog = () => {
    const containerRef = useRef(null);
    useFocusTrap(containerRef, !!state, close);
    if (!state) return null;
    return (
      <div ref={containerRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={state.message?"confirm-message":undefined}
           onClick={close}
           style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:75,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 28px"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"22px 20px",width:"100%",maxWidth:340}}>
          {state.icon&&<div aria-hidden="true" style={{textAlign:"center",fontSize:32,marginBottom:8}}>{state.icon}</div>}
          <div id="confirm-title" style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",textAlign:"center",marginBottom:6}}>{state.title}</div>
          {state.message&&<div id="confirm-message" style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,textAlign:"center",marginBottom:16}}>{state.message}</div>}
          <div style={{display:"flex",gap:8}}>
            <TapTarget onClick={close} label={state.cancelLabel||"Cancel"} minTap={false}
              style={{flex:1,padding:"11px",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:44}}>
              {state.cancelLabel||"Cancel"}
            </TapTarget>
            <TapTarget onClick={()=>{haptic("heavy");state.onConfirm?.();close();}} label={state.confirmLabel||"Confirm"} minTap={false}
              style={{flex:1,padding:"11px",borderRadius:10,background:W.accent,textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:44}}>
              {state.confirmLabel||"Confirm"}
            </TapTarget>
          </div>
        </div>
      </div>
    );
  };
  return { confirm, ConfirmDialog };
};

// Pull-to-refresh hook. Returns {pullDist, isRefreshing, pullHandlers}.
// Attach pullHandlers to the scrollable container. Triggers onRefresh() when pulled past threshold.
const usePullToRefresh = (onRefresh) => {
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);
  const triggered = useRef(false);

  const handleTouchStart = (e) => {
    if (e.currentTarget.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }
  };
  const handleTouchMove = (e) => {
    if (startY.current == null || isRefreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && e.currentTarget.scrollTop === 0) {
      const damped = Math.min(100, dy * 0.5);
      setPullDist(damped);
      if (damped >= 60 && !triggered.current) { triggered.current = true; haptic("medium"); }
      else if (damped < 60 && triggered.current) { triggered.current = false; }
    }
  };
  const handleTouchEnd = async () => {
    if (pullDist >= 60 && !isRefreshing) {
      setIsRefreshing(true);
      haptic("heavy");
      try { await onRefresh?.(); } catch(e) {}
      setTimeout(() => { setIsRefreshing(false); setPullDist(0); }, 600);
    } else {
      setPullDist(0);
    }
    startY.current = null;
    triggered.current = false;
  };
  return {
    pullDist, isRefreshing,
    pullHandlers: { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd }
  };
};

// Pull indicator — shown at top of scrollable when pulling
const PullIndicator = ({ pullDist, isRefreshing }) => {
  if (!pullDist && !isRefreshing) return null;
  const progress = Math.min(1, pullDist / 60);
  return (
    <div style={{position:"absolute",top:0,left:0,right:0,height:pullDist||40,display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,pointerEvents:"none",transition:isRefreshing?"height 0.2s":"none"}}>
      <div style={{fontSize:16,opacity:progress,transform:`rotate(${progress*360}deg)`,transition:isRefreshing?"transform 0.5s linear":"none",color:W.accent}}>{isRefreshing?"⟳":"↓"}</div>
    </div>
  );
};

// Share icon — square with up-arrow (iOS-style). Used everywhere a share affordance
// appears: feed cards, movie detail, profile, share-sheet header, share-sheet menu items.
// Single source of truth so the visual identity stays consistent.
const ShareIcon = ({ size=14, color=W.dim, strokeWidth=2 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);

// Skeleton placeholder — pulsing gray block matching the shape of loaded content
const Skeleton = ({ w="100%", h=16, radius=6, style={} }) => (
  <div style={{width:w,height:h,borderRadius:radius,background:W.card,position:"relative",overflow:"hidden",...style}}>
    <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,transparent,${W.border}66,transparent)`,animation:"skeleton-shimmer 1.4s infinite"}}/>
  </div>
);

// Feed skeleton — 3 placeholder cards
const FeedSkeleton = () => (
  <div style={{padding:"0 22px",display:"flex",flexDirection:"column",gap:10}}>
    {[0,1,2].map(i=>(
      <div key={i} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:12,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Skeleton w={30} h={30} radius={15}/>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
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

// Profile photo cropper. Loads an image, lets the user drag to reposition and
// scroll/pinch to zoom inside a circular mask, then writes the visible square
// region to a 256×256 canvas and returns a JPEG dataURL via onSave.
//
// Implementation notes:
// - State: imageScale (1 = fit-to-frame), offsetX/Y (pan in pixels of the displayed image).
// - Frame is FRAME_SIZE px square. Image is rendered at FRAME_SIZE * imageScale, anchored
//   at center, then offset by (offsetX, offsetY).
// - On save we re-render at full output resolution onto a 256×256 canvas using the same
//   transformation math, so the saved image matches what the user saw in the preview.
const CropperModal = ({ src, onSave, onCancel }) => {
  const FRAME_SIZE = 240;
  const OUTPUT_SIZE = 256;
  const [offset, setOffset] = useState({x:0, y:0});
  const [imgDims, setImgDims] = useState(null); // {w, h} natural dimensions

  // Load image to get natural dimensions
  useEffect(()=>{
    if (!src) return;
    const img = new Image();
    img.onload = () => setImgDims({w: img.naturalWidth, h: img.naturalHeight});
    img.src = src;
  },[src]);

  // Image fills the frame using "cover" sizing — short edge matches frame, long edge overflows.
  // No zoom: this is always the displayed size. User can only pan within the overflow area.
  const baseSize = imgDims ? (() => {
    const aspect = imgDims.w / imgDims.h;
    if (aspect > 1) {
      return { w: FRAME_SIZE * aspect, h: FRAME_SIZE };
    } else {
      return { w: FRAME_SIZE, h: FRAME_SIZE / aspect };
    }
  })() : { w: FRAME_SIZE, h: FRAME_SIZE };

  const displayW = baseSize.w;
  const displayH = baseSize.h;

  // Clamp offsets so the image always covers the frame (no transparent edges).
  const clampOffset = (x, y) => {
    const maxX = Math.max(0, (displayW - FRAME_SIZE) / 2);
    const maxY = Math.max(0, (displayH - FRAME_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  // Pan-only gesture: single pointer, drag to reposition.
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    e.preventDefault();
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch(_){}
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: { ...offset } };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffset.x + dx, dragRef.current.startOffset.y + dy));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleSave = () => {
    if (!imgDims) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    // Map from preview frame → output canvas: scale up by OUTPUT_SIZE / FRAME_SIZE
    const ratio = OUTPUT_SIZE / FRAME_SIZE;
    const drawW = displayW * ratio;
    const drawH = displayH * ratio;
    const drawX = (OUTPUT_SIZE - drawW) / 2 + offset.x * ratio;
    const drawY = (OUTPUT_SIZE - drawH) / 2 + offset.y * ratio;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      onSave(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = src;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop profile photo"
         style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.92)",zIndex:90,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:20}}>
      <div style={{textAlign:"center",marginBottom:16,color:W.text,fontFamily:"monospace",fontSize:13,fontWeight:800}}>
        ✂ Crop Photo
      </div>
      <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginBottom:14,textAlign:"center",lineHeight:1.5}}>
        Drag to reposition
      </div>
      {/* Crop frame with circular mask */}
      <div style={{position:"relative",width:FRAME_SIZE,height:FRAME_SIZE,marginBottom:24}}>
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
             style={{position:"absolute",inset:0,borderRadius:"50%",overflow:"hidden",cursor:"grab",touchAction:"none",border:`2px solid ${W.accent}`}}>
          {src&&<img src={src} alt="" draggable="false"
                     style={{position:"absolute",left:"50%",top:"50%",width:displayW,height:displayH,transform:`translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,userSelect:"none",pointerEvents:"none"}}/>}
        </div>
        {/* Outer ring indicator */}
        <div style={{position:"absolute",inset:-4,borderRadius:"50%",border:`1px dashed ${W.dim}66`,pointerEvents:"none"}}/>
      </div>
      {/* Action buttons */}
      <div style={{display:"flex",gap:10,width:FRAME_SIZE}}>
        <TapTarget onClick={onCancel} label="Cancel cropping" minTap={false}
          style={{flex:1,padding:"11px",borderRadius:10,background:W.card,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
          Cancel
        </TapTarget>
        <TapTarget onClick={handleSave} label="Save cropped photo" minTap={false}
          style={{flex:1,padding:"11px",borderRadius:10,background:W.accent,border:`1px solid ${W.accent}`,textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
          Use Photo
        </TapTarget>
      </div>
    </div>
  );
};

// Drag-to-reorder list using Pointer Events (works for both mouse and touch).
// `items` is the array, `keyOf(item)` returns a stable key, `renderItem(item, dragHandleProps, isDragging)`
// returns the row JSX. Pass dragHandleProps onto the element you want to be the drag affordance.
// onReorder(fromIndex, toIndex) is called once when the user releases.
//
// Uses transform translateY for the dragged item (no layout reflow during drag), and
// shifts neighboring items via CSS transform when the dragged item crosses their midpoints.
// Each row's row height is measured on pointerdown so the math works for any row size.
const DraggableList = ({ items, keyOf, renderItem, onReorder, disabled=false }) => {
  const containerRef = useRef(null);
  const rowRefs = useRef({});
  const [draggingKey, setDraggingKey] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0); // pixel offset of the dragged row
  const [hoverIndex, setHoverIndex] = useState(null); // current target index
  const dragState = useRef(null); // { startY, startIndex, rowHeight, rowOffsets[] }

  const handlePointerDown = (e, item, index) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const row = rowRefs.current[keyOf(item)];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    // Capture pointer so we keep getting move events even if the cursor leaves the row
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch(_){}
    // Pre-measure each row's vertical offset (relative to container) so we can compute
    // hover index from a single pointer Y coord without re-querying DOM each move.
    const containerTop = containerRef.current?.getBoundingClientRect().top || 0;
    const offsets = items.map(it=>{
      const r = rowRefs.current[keyOf(it)];
      return r ? r.getBoundingClientRect().top - containerTop : 0;
    });
    dragState.current = {
      startY: e.clientY,
      startIndex: index,
      rowHeight: rect.height,
      offsets,
    };
    setDraggingKey(keyOf(item));
    setHoverIndex(index);
    setDragOffsetY(0);
    haptic("medium");
  };

  const handlePointerMove = (e) => {
    if (!dragState.current) return;
    e.preventDefault();
    const { startY, startIndex, rowHeight, offsets } = dragState.current;
    const delta = e.clientY - startY;
    setDragOffsetY(delta);
    // Determine target index: where would the dragged row's center sit?
    const draggedCenter = offsets[startIndex] + rowHeight/2 + delta;
    let target = startIndex;
    for (let i = 0; i < items.length; i++) {
      const itemCenter = offsets[i] + rowHeight/2;
      if (i < startIndex && draggedCenter < itemCenter) { target = i; break; }
      if (i > startIndex && draggedCenter > itemCenter) target = i;
    }
    if (target !== hoverIndex) {
      setHoverIndex(target);
      haptic("light");
    }
  };

  const handlePointerUp = (e) => {
    if (!dragState.current) return;
    const { startIndex } = dragState.current;
    const target = hoverIndex;
    dragState.current = null;
    setDraggingKey(null);
    setDragOffsetY(0);
    setHoverIndex(null);
    if (target !== null && target !== startIndex && onReorder) {
      onReorder(startIndex, target);
    }
  };

  return (
    <div ref={containerRef} style={{display:"flex",flexDirection:"column",gap:6}}
         onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      {items.map((item, i)=>{
        const k = keyOf(item);
        const isDragging = k === draggingKey;
        // Shift non-dragged rows to make room for the dragged row's hover position
        let translateY = 0;
        if (draggingKey && !isDragging && hoverIndex !== null && dragState.current) {
          const startIndex = dragState.current.startIndex;
          const rh = dragState.current.rowHeight;
          // Items between startIndex and hoverIndex shift to fill the gap
          if (startIndex < hoverIndex && i > startIndex && i <= hoverIndex) translateY = -rh;
          else if (startIndex > hoverIndex && i < startIndex && i >= hoverIndex) translateY = rh;
        }
        const dragHandleProps = {
          onPointerDown: (e)=>handlePointerDown(e, item, i),
          style: { cursor: disabled ? "default" : "grab", touchAction: "none" },
          "aria-label": "Drag to reorder",
        };
        return (
          <div key={k}
               ref={el=>{ if(el) rowRefs.current[k]=el; }}
               style={{
                 transform: isDragging ? `translateY(${dragOffsetY}px)` : `translateY(${translateY}px)`,
                 transition: isDragging ? "none" : "transform 0.18s cubic-bezier(.2,.7,.3,1)",
                 zIndex: isDragging ? 10 : 1,
                 opacity: isDragging ? 0.92 : 1,
                 boxShadow: isDragging ? `0 8px 20px rgba(0,0,0,0.4)` : "none",
                 borderRadius: 10,
                 position: "relative",
               }}>
            {renderItem(item, dragHandleProps, isDragging)}
          </div>
        );
      })}
    </div>
  );
};

// Swipeable row — reveals action buttons on left swipe. Children is the row content.
// actions = [{icon, label, color, onPress}]  — rendered right-to-left
const SwipeableRow = ({ children, actions=[], onSwipeOpen }) => {
  const [offset, setOffset] = useState(0); // negative = swiped left
  const startX = useRef(null);
  const startOffset = useRef(0);
  const actionWidth = actions.length * 64;

  const handleStart = (x) => { startX.current = x; startOffset.current = offset; };
  const handleMove = (x) => {
    if (startX.current == null) return;
    const dx = x - startX.current;
    const next = Math.max(-actionWidth, Math.min(0, startOffset.current + dx));
    setOffset(next);
  };
  const handleEnd = () => {
    if (startX.current == null) return;
    // Snap open or closed based on threshold
    if (offset < -actionWidth/2) {
      setOffset(-actionWidth);
      haptic("light");
      onSwipeOpen?.();
    } else {
      setOffset(0);
    }
    startX.current = null;
  };
  return (
    <div style={{position:"relative",overflow:"hidden",borderRadius:10}}>
      {/* Action buttons revealed underneath */}
      <div style={{position:"absolute",right:0,top:0,bottom:0,display:"flex"}}>
        {actions.map((a,i)=>(
          <div key={i} onClick={()=>{haptic("medium");a.onPress?.();setOffset(0);}} style={{width:64,background:a.color||W.accent,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer"}}>
            <span style={{fontSize:16,color:"#fff"}}>{a.icon}</span>
            <span style={{fontSize:8,color:"#fff",fontFamily:"monospace",fontWeight:700}}>{a.label}</span>
          </div>
        ))}
      </div>
      {/* Slidable content layer */}
      <div
        onTouchStart={e=>handleStart(e.touches[0].clientX)}
        onTouchMove={e=>handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        style={{transform:`translateX(${offset}px)`,transition:startX.current==null?"transform 0.2s":"none",position:"relative",zIndex:1,background:W.card}}>
        {children}
      </div>
    </div>
  );
};

// Edge-swipe back hook — detects iOS-style swipe from left edge. Calls onBack when triggered.
const useEdgeSwipeBack = (onBack) => {
  const startX = useRef(null);
  const startY = useRef(null);
  const triggered = useRef(false);
  const handleTouchStart = (e) => {
    if (e.touches[0].clientX < 24) { // left edge
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      triggered.current = false;
    }
  };
  const handleTouchMove = (e) => {
    if (startX.current == null || triggered.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    if (dx > 70 && dy < 50) {
      triggered.current = true;
      haptic("medium");
      onBack?.();
    }
  };
  const handleTouchEnd = () => { startX.current = null; triggered.current = false; };
  return { onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd };
};

// Full-screen image viewer with tap-to-close
const ImageViewer = ({ url, onClose }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!url, onClose);
  if (!url) return null;
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-label="Image viewer"
         onClick={onClose}
         style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.95)",zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer"}}>
      <TapTarget onClick={onClose} label="Close image viewer" minTap={false}
        style={{position:"absolute",top:8,right:8,fontSize:20,color:"#fff",opacity:0.8,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8}}>
        <span aria-hidden="true">✕</span>
      </TapTarget>
      <img src={url} alt="Full size view" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:8}} onClick={e=>e.stopPropagation()}/>
    </div>
  );
};

// Share sheet for movies and reviews
const ShareSheet = ({ item, onClose, showToast }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!item, onClose);
  if (!item) return null;
  const link = item.type==="movie"
    ? `https://rated.app/movie/${item.id}`
    : `https://rated.app/review/${item.id}`;
  const title = item.type==="movie" ? `${item.title} on RATED` : `Review of ${item.movie_title} on RATED`;
  // Copy link → toast confirmation. Handles clipboard failures gracefully.
  const copyLink = async () => {
    haptic("light");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast && showToast("Link copied","ok");
      } else {
        showToast && showToast("Couldn't copy — clipboard unavailable","err");
      }
    } catch (e) {
      showToast && showToast("Couldn't copy — clipboard unavailable","err");
    }
    onClose();
  };
  // Share via native sheet, or fall back to copy
  const shareNative = async () => {
    haptic("light");
    try {
      if (navigator.share) {
        await navigator.share({ title, url: link });
        onClose();
        return;
      }
    } catch (e) { if (e?.name === "AbortError") { onClose(); return; } }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast && showToast("Link copied","ok");
      }
    } catch (e) {}
    onClose();
  };
  // Send as SMS with prefilled body
  const sendSms = () => {
    haptic("light");
    const body = encodeURIComponent(`${title}: ${link}`);
    window.location.href = `sms:?&body=${body}`;
    onClose();
  };
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="share-sheet-title"
         onClick={onClose}
         style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",zIndex:60,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"18px 22px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div id="share-sheet-title" style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace"}}>
            <ShareIcon size={14} color={W.text}/> Share
          </div>
          <TapTarget onClick={onClose} label="Close share sheet" minTap={false}
            style={{fontSize:16,color:W.dim,minWidth:40,minHeight:40,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>
            <span aria-hidden="true">✕</span>
          </TapTarget>
        </div>
        <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginBottom:12,lineHeight:1.5}}>{title}</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[
            {icon:"🔗",label:"Copy Link",action:copyLink},
            {icon:<ShareIcon size={18} color={W.text}/>,label:"Share via...",action:shareNative},
            {icon:"💬",label:"Send as Message",action:sendSms},
          ].map(o=>(
            <TapTarget key={o.label} onClick={o.action} label={o.label} minTap={false}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:W.card,borderRadius:12,border:`1px solid ${W.border}`,minHeight:48}}>
              <span aria-hidden="true" style={{fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",width:24}}>{o.icon}</span>
              <span style={{fontSize:12,fontWeight:600,color:W.text,fontFamily:"monospace"}}>{o.label}</span>
            </TapTarget>
          ))}
        </div>
        <TapTarget onClick={onClose} label="Cancel" minTap={false}
          style={{marginTop:12,padding:"11px",textAlign:"center",fontSize:11,color:W.dim,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
          Cancel
        </TapTarget>
      </div>
    </div>
  );
};

// YouTube trailer modal. Embeds the video via an iframe. Autoplay may be blocked
// on some platforms — user can tap play inside the iframe as fallback.
const TrailerModal = ({ videoKey, title, onClose }) => {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, true, onClose);
  useEffect(()=>{
    // Lock background scroll while the modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return ()=>{ document.body.style.overflow = prevOverflow; };
  },[]);
  if (!videoKey) return null;
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-label={`Trailer for ${title||"movie"}`}
         onClick={onClose}
         style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.92)",zIndex:80,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 10px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",maxWidth:480,padding:"0 6px",marginBottom:10}}>
        <div id="trailer-title" style={{fontSize:10,color:"#fff",fontFamily:"monospace",fontWeight:700,opacity:0.85,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:12}}>
          ▶ {title||"Trailer"}
        </div>
        <TapTarget onClick={(e)=>{e.stopPropagation();onClose();}} label="Close trailer" minTap={false}
          style={{color:"#fff",fontSize:20,padding:"8px 12px",opacity:0.9,minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8}}>
          <span aria-hidden="true">✕</span>
        </TapTarget>
      </div>
      <div onClick={(e)=>e.stopPropagation()} style={{width:"100%",maxWidth:480,aspectRatio:"16/9",borderRadius:12,overflow:"hidden",background:"#000",boxShadow:"0 12px 40px rgba(0,0,0,0.8)"}}>
        <iframe
          width="100%" height="100%"
          src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
          title={`${title||"Trailer"} — YouTube video player`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{border:0,display:"block"}}
        />
      </div>
      <div style={{fontSize:9,color:"#fff",fontFamily:"monospace",opacity:0.5,marginTop:10,letterSpacing:1}}>Tap outside or press Esc to close</div>
    </div>
  );
};

const Poster = ({ url, w=85, h=120, radius=10, onClick, title }) => {
  const [state,setState]=useState(url?"loading":"empty"); // "loading" | "loaded" | "error" | "empty"
  useEffect(()=>{setState(url?"loading":"empty");},[url]);
  const isFailed = state==="error" || state==="empty";
  const altText = title ? `Poster for ${title}` : "Movie poster";
  const handleKey = (e) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); }
  };
  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? handleKey : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `View poster for ${title||"movie"}` : undefined}
      style={{width:w,height:h,borderRadius:radius,overflow:"hidden",flexShrink:0,background:W.card,border:`1px solid ${W.border}`,cursor:onClick?"pointer":"default",position:"relative"}}>
      {url && state!=="error" && (
        <img src={url} alt={altText} style={{width:"100%",height:"100%",objectFit:"cover",opacity:state==="loaded"?1:0,transition:"opacity 0.2s"}}
          onLoad={()=>setState("loaded")}
          onError={()=>setState("error")}/>
      )}
      {/* Skeleton shimmer while loading */}
      {state==="loading" && (
        <div aria-hidden="true" style={{position:"absolute",inset:0,overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg, ${W.card}, ${W.border}, ${W.card})`,animation:"skeleton-shimmer 1.2s infinite linear",backgroundSize:"200% 100%"}}/>
        </div>
      )}
      {/* Visible fallback when load fails or URL is missing — show a film icon + first letters of title */}
      {isFailed && (
        <div role="img" aria-label={altText} style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:6,background:`linear-gradient(135deg, ${W.card}, ${W.border})`,textAlign:"center"}}>
          <div aria-hidden="true" style={{fontSize:Math.min(w*0.32,22),color:W.dim,opacity:0.6}}>🎬</div>
          {title && <div style={{fontSize:Math.max(7,Math.min(w*0.11,9)),color:W.dim,fontFamily:"monospace",fontWeight:700,lineHeight:1.2,letterSpacing:0.3,wordBreak:"break-word"}}>{title.length>24?title.slice(0,22)+"…":title}</div>}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCESSIBILITY PRIMITIVES
// TapTarget is the canonical "clickable thing" — keyboard-accessible, has a
// proper button role, activates on Enter/Space, shows a focus ring. Use this
// in preference to <div onClick=...> for any interactive element.
// ─────────────────────────────────────────────────────────────────────────────
const TapTarget = ({ children, onClick, label, role="button", disabled, style={}, minTap=true, ...rest }) => {
  const handleKey = (e) => {
    if (disabled || !onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  };
  const onClickGuarded = disabled ? undefined : onClick;
  // Ensure a minimum 44×44 hit area unless explicitly disabled (e.g. tightly packed icon rows)
  const merged = {
    cursor: disabled ? "not-allowed" : "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    ...(minTap ? { minWidth: 44, minHeight: 44 } : {}),
    ...style,
  };
  return (
    <div role={role} tabIndex={disabled ? -1 : 0} aria-disabled={disabled||undefined} aria-label={label}
         onClick={onClickGuarded} onKeyDown={handleKey} style={merged} {...rest}>
      {children}
    </div>
  );
};

// Focus trap — when isOpen, traps focus inside `containerRef`, restores on close.
// Also handles Escape to close. Use in every modal.
const useFocusTrap = (containerRef, isOpen, onClose) => {
  useEffect(() => {
    if (!isOpen || !containerRef?.current) return;
    const container = containerRef.current;
    const prevActive = document.activeElement;
    // Move initial focus into the modal
    const focusables = () => Array.from(
      container.querySelectorAll('a, button, [role="button"], input, textarea, select, [tabindex]:not([tabindex="-1"])')
    ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
    const initial = focusables()[0];
    if (initial && typeof initial.focus === "function") initial.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      // Restore focus to whatever was focused before the modal opened
      if (prevActive && typeof prevActive.focus === "function") {
        try { prevActive.focus(); } catch (e) {}
      }
    };
  }, [isOpen, containerRef, onClose]);
};

// Shared invite-link hook. Returns a stable set of handlers for sharing the
// user's invite URL via native share sheet / clipboard / email / SMS.
// Used by both the Find Friends modal (Search) and Settings → Find Friends.
const useShareInvite = (username, showToast) => {
  const inviteUrl = `https://rated.app/invite/${username||"rated"}`;
  const inviteMsg = `Join me on RATED — the movie-ranking app: ${inviteUrl}`;
  // Native share sheet → clipboard fallback
  const shareInvite = useCallback(async () => {
    haptic("medium");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Join me on RATED", text: inviteMsg, url: inviteUrl });
        return true;
      }
    } catch (e) {
      if (e?.name === "AbortError") return false; // user cancelled the share sheet
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        showToast && showToast("Invite link copied to clipboard", "ok");
        return true;
      }
    } catch (e) {}
    showToast && showToast("Couldn't share — your browser doesn't support this", "err");
    return false;
  }, [inviteUrl, inviteMsg, showToast]);
  const emailInvite = useCallback(() => {
    haptic("light");
    const subject = encodeURIComponent("Join me on RATED");
    const body = encodeURIComponent(inviteMsg);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [inviteMsg]);
  const smsInvite = useCallback(() => {
    haptic("light");
    const body = encodeURIComponent(inviteMsg);
    window.location.href = `sms:?&body=${body}`;
  }, [inviteMsg]);
  return { inviteUrl, inviteMsg, shareInvite, emailInvite, smsInvite };
};

const Btn = ({ children, accent, full, small, onClick, label, disabled }) => (
  <TapTarget onClick={onClick} label={label||(typeof children==="string"?children:undefined)} disabled={disabled} minTap={false}
    style={{background:accent?W.accent:"transparent",border:accent?"none":`1px solid ${W.border}`,color:accent?"#fff":W.dim,borderRadius:12,padding:small?"8px 14px":"12px 20px",fontSize:small?10:12,fontWeight:700,textAlign:"center",width:full?"100%":"auto",fontFamily:"monospace",display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:small?36:44,opacity:disabled?0.5:1}}>
    {children}
  </TapTarget>
);

const NavBar = ({ active, onNav }) => (
  <nav role="tablist" aria-label="Primary navigation" style={{height:58,background:"#09090c",borderTop:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"space-around",flexShrink:0}}>
    {[{key:"home",icon:"⌂",label:"Home"},{key:"upcoming",icon:"◈",label:"Soon"},{key:"search",icon:"⌕",label:"Search"},{key:"leaderboard",icon:"◆",label:"Board"},{key:"profile",icon:"●",label:"Me"}].map(item=>{
      const isActive = item.key===active;
      return (
        <TapTarget key={item.key} role="tab" onClick={()=>onNav(item.key)} label={item.label}
          aria-selected={isActive}
          minTap={false}
          style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,position:"relative",minWidth:58,minHeight:58,padding:"0 4px"}}>
          <span aria-hidden="true" style={{fontSize:18,color:isActive?W.accent:W.dim}}>{item.icon}</span>
          <span style={{fontSize:8,fontFamily:"monospace",color:isActive?W.accent:W.dim,fontWeight:isActive?700:400}}>{item.label}</span>
        </TapTarget>
      );
    })}
  </nav>
);

// Module-level scroll position cache, keyed by screen name
const SCROLL_POSITIONS = {};

// Hook that saves/restores scrollTop for a given screen key
const useScrollPersistence = (screenKey) => {
  const ref = useRef(null);
  useEffect(()=>{
    if (!ref.current || !screenKey) return;
    // Restore on mount
    const saved = SCROLL_POSITIONS[screenKey];
    if (saved != null) {
      // next tick to ensure content has rendered
      setTimeout(()=>{ if (ref.current) ref.current.scrollTop = saved; }, 0);
    }
    const el = ref.current;
    const onScroll = () => { if (el) SCROLL_POSITIONS[screenKey] = el.scrollTop; };
    el.addEventListener("scroll", onScroll, {passive:true});
    return ()=>el.removeEventListener("scroll", onScroll);
  },[screenKey]);
  return ref;
};

const ScreenWithNav = ({ children, active, onNav, scrollHandlers, pullIndicator, scrollKey }) => {
  const scrollRef = useScrollPersistence(scrollKey||active);
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",position:"relative"}}>
      {pullIndicator}
      <div ref={scrollRef} {...(scrollHandlers||{})} style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>{children}</div>
      <NavBar active={active} onNav={onNav}/>
    </div>
  );
};

const Badge = ({ color, children }) => (
  <span style={{padding:"2px 7px",borderRadius:4,fontSize:7,fontWeight:900,fontFamily:"monospace",
    background:color==="red"?W.accentDim:color==="gold"?W.goldDim:color==="green"?W.greenDim:color==="blue"?W.blueDim:color==="orange"?W.orangeDim:W.purpleDim,
    color:color==="red"?W.accent:color==="gold"?W.gold:color==="green"?W.green:color==="blue"?W.blue:color==="orange"?W.orange:W.purple,
    border:`1px solid ${color==="red"?W.accent+"33":color==="gold"?W.gold+"33":color==="green"?W.green+"33":color==="blue"?W.blue+"33":color==="orange"?W.orange+"33":W.purple+"33"}`}}>{children}</span>
);

const calcElo = (wElo,lElo,k=32) => {
  const exp=1/(1+Math.pow(10,(lElo-wElo)/400));
  return [Math.round(wElo+k*(1-exp)),Math.round(lElo+k*(0-(1-exp)))];
};

// Compute days until a release date from today. Returns 0 or negative for released.
const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(isoDate+"T00:00:00");
  const now = new Date();
  now.setHours(0,0,0,0);
  const msPerDay = 1000*60*60*24;
  return Math.round((target.getTime()-now.getTime())/msPerDay);
};

// ───── Streak system ────────────────────────────────────────────────────────
// A streak counts consecutive weeks (Mon-start) where the user has ranked
// at least one movie. Current week "grace period": if you haven't ranked
// this week yet but last week had a rank, the streak is still alive (and
// will break at the start of next week if you don't rank by Sunday).

// Return a Date at 00:00:00 on the Monday of the week containing `ts`.
// Monday is ISO weekday 1 (JS getDay: Sun=0, Mon=1, ... Sat=6).
const getMondayOfWeek = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay(); // 0..6
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
};

// Walk backward from this week, counting consecutive weeks with ≥1 rank.
// Stops at the first empty week.
//   rankHistory: array of { movieId, ts }
// Returns:
//   { count, status }
//   status: "active"       — ranked this week, streak fully healthy
//           "at-risk"      — last week had rank, this week doesn't (rank by Sunday or it dies)
//           "none"         — no rank in 2+ weeks, streak is 0
const computeStreak = (rankHistory) => {
  if (!rankHistory || rankHistory.length === 0) {
    return { count: 0, status: "none" };
  }
  // Build a Set of "week keys" (Monday ms) that have at least one rank
  const weekSet = new Set(rankHistory.map(r => getMondayOfWeek(r.ts).getTime()));
  const thisWeek = getMondayOfWeek(Date.now()).getTime();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const thisWeekRanked = weekSet.has(thisWeek);
  const lastWeekRanked = weekSet.has(thisWeek - msPerWeek);
  // Determine starting point: this week (if ranked) OR last week (grace period)
  let startWeek;
  let status;
  if (thisWeekRanked) {
    startWeek = thisWeek;
    status = "active";
  } else if (lastWeekRanked) {
    startWeek = thisWeek - msPerWeek;
    status = "at-risk";
  } else {
    return { count: 0, status: "none" };
  }
  // Count consecutive weeks working backward from startWeek
  let count = 0;
  let cursor = startWeek;
  while (weekSet.has(cursor)) {
    count++;
    cursor -= msPerWeek;
  }
  return { count, status };
};

// Format a release date nicely (e.g., "May 15, 2026")
const formatReleaseDate = (isoDate) => {
  if (!isoDate) return "";
  const d = new Date(isoDate+"T00:00:00");
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT MODERATION — profanity + rate limits
// ─────────────────────────────────────────────────────────────────────────────

// Basic bad-word list. Production would use a real library (bad-words, better-profanity)
// plus ML (Perspective API / OpenAI Moderation). This catches obvious slurs and f-words
// but intentionally misses creative bypasses (those need ML).
const BAD_WORDS = [
  "fuck","shit","cunt","bitch","bastard","asshole","dick","piss","cock","pussy","slut","whore",
  "nigger","nigga","faggot","fag","retard","tranny","spic","chink","kike","wetback","gook",
  "rape","raping","kys","kms","killyourself",
];
// Leetspeak substitutions attackers use to bypass simple filters
const LEET_MAP = {"0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","@":"a","$":"s","!":"i","+":"t"};
const normalizeForProfanity = (text) => {
  return (text||"").toLowerCase()
    .split("").map(c=>LEET_MAP[c]||c).join("")
    .replace(/[^a-z0-9]/g," ")  // strip punctuation, keep word boundaries
    .replace(/\s+/g," ").trim();
};
const checkProfanity = (text) => {
  if(!text) return null;
  const normalized = normalizeForProfanity(text);
  // Check both whole-word matches and substring matches (stricter for usernames)
  for(const w of BAD_WORDS){
    // Whole word match OR contains the bad word (catches "fuckusername")
    if(normalized.includes(w)) return w;
  }
  return null; // clean
};

// Rate limit tracker. In production this would live server-side (Redis).
// We use in-memory counters in the App shell.
const FOLLOW_LIMIT_PER_HOUR = 200;
const FOLLOW_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─────────────────────────────────────────────────────────────────────────────
// REPORT/BLOCK MENU — reusable, mounts as a dot trigger + sheet
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_REASONS = [
  {key:"spam",        label:"Spam",                  desc:"Repetitive, misleading, or promotional"},
  {key:"harassment",  label:"Harassment or bullying",desc:"Targeted abuse or unwanted contact"},
  {key:"hate",        label:"Hate speech",           desc:"Attacks a protected group or identity"},
  {key:"inappropriate",label:"Inappropriate content",desc:"Sexual, violent, or graphic material"},
  {key:"impersonation",label:"Impersonation",        desc:"Pretending to be someone else"},
  {key:"other",       label:"Something else",        desc:"Doesn't fit the categories above"},
];

const ReportBlockMenu = ({ targetType, targetId, targetLabel, targetUser, onReport, onBlock, blockedUsers, size="sm" }) => {
  const [open,setOpen]=useState(false);
  const [stage,setStage]=useState("menu"); // menu | report | report-confirm | block-confirm
  const [reason,setReason]=useState(null);

  const close=()=>{setOpen(false);setStage("menu");setReason(null);};
  const isBlocked=targetUser&&blockedUsers?.has(targetUser);

  // Trigger size matches the adjacent share button (32×32 circle) so all action
  // buttons in a feed-card row line up at the same visual weight.
  const triggerSize = size === "md" ? 36 : 32;
  const iconSize = size === "md" ? 16 : 14;

  return (
    <>
      <TapTarget onClick={e=>{e.stopPropagation();setOpen(true);}} label="More options" minTap={false}
        style={{display:"flex",alignItems:"center",justifyContent:"center",width:triggerSize,height:triggerSize,borderRadius:"50%",background:W.card,border:`1px solid ${W.border}`,fontSize:iconSize,color:W.dim,flexShrink:0,lineHeight:1,userSelect:"none"}}>
        <span aria-hidden="true">⋯</span>
      </TapTarget>
      {open&&<div onClick={close} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",zIndex:80,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"16px 20px 24px",borderTop:`1px solid ${W.border}`}}>

          {stage==="menu"&&<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:800,color:W.text,fontFamily:"monospace"}}>
                {targetUser||(targetType==="review"?"Review":targetType==="feed"?"Post":targetType==="comment"?"Comment":"Item")}
              </div>
              <TapTarget onClick={close} label="Close menu" minTap={false}
                style={{fontSize:16,color:W.dim,minWidth:32,minHeight:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <TapTarget onClick={()=>setStage("report")} label="Report this content" minTap={false}
                style={{padding:"10px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:40}}>
                <span style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Report</span>
              </TapTarget>
              {targetUser&&!isBlocked&&<TapTarget onClick={()=>setStage("block-confirm")} label={`Block ${targetUser}`} minTap={false}
                style={{padding:"10px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:40}}>
                <span style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>Block {targetUser}</span>
              </TapTarget>}
              {targetUser&&isBlocked&&<div style={{padding:"10px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:40}}>
                <span style={{fontSize:12,fontWeight:700,color:W.dim,fontFamily:"monospace"}}>Already blocked</span>
              </div>}
            </div>
          </>}

          {stage==="report"&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <TapTarget onClick={()=>setStage("menu")} label="Back to menu" minTap={false}
                style={{fontSize:11,color:W.dim,fontFamily:"monospace",padding:"6px 4px",minHeight:32,display:"flex",alignItems:"center"}}>
                ← Back
              </TapTarget>
              <div style={{flex:1,textAlign:"center",fontSize:12,fontWeight:800,color:W.text,fontFamily:"monospace"}}>Why report this?</div>
              <div style={{width:40}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {REPORT_REASONS.map(r=>(
                <TapTarget key={r.key} onClick={()=>{setReason(r);setStage("report-confirm");}} label={`Report reason: ${r.label}`} minTap={false}
                  style={{padding:"9px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:36}}>
                  <span style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{r.label}</span>
                </TapTarget>
              ))}
            </div>
          </>}

          {stage==="report-confirm"&&reason&&<>
            <div style={{textAlign:"center",padding:"6px 0 12px"}}>
              <div style={{fontSize:28,marginBottom:6}}>🚩</div>
              <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",marginBottom:4}}>Submit this report?</div>
              <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>
                Reason: <span style={{color:W.text,fontWeight:700}}>{reason.label}</span> · Your identity stays private
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <TapTarget onClick={()=>setStage("report")} label="Cancel" minTap={false}
                style={{flex:1,padding:"11px",textAlign:"center",fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>Cancel</TapTarget>
              <TapTarget onClick={()=>{onReport&&onReport(targetType,targetId,targetLabel,reason);close();}} label="Submit report" minTap={false}
                style={{flex:1,padding:"11px",textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",background:W.accent,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>Submit Report</TapTarget>
            </div>
          </>}

          {stage==="block-confirm"&&<>
            <div style={{textAlign:"center",padding:"6px 0 12px"}}>
              <div style={{fontSize:28,marginBottom:6}}>🚫</div>
              <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",marginBottom:6}}>Block {targetUser}?</div>
              <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>
                You won't see their posts. They can't see yours. Unblock anytime in Settings.
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <TapTarget onClick={()=>setStage("menu")} label="Cancel" minTap={false}
                style={{flex:1,padding:"11px",textAlign:"center",fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>Cancel</TapTarget>
              <TapTarget onClick={()=>{onBlock&&onBlock(targetUser);close();}} label={`Block ${targetUser}`} minTap={false}
                style={{flex:1,padding:"11px",textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",background:W.accent,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>Block</TapTarget>
            </div>
          </>}

        </div>
      </div>}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const LoginScreen = ({ onLogin }) => (
  <div style={{height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 28px"}}>
    <div style={{textAlign:"center",marginBottom:40}}>
      <div style={{fontSize:42,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-2}}>RATED</div>
      <div style={{fontSize:10,color:W.dim,marginTop:8,fontFamily:"monospace",letterSpacing:3}}>YOUR TASTE. RANKED.</div>
    </div>
    <div onClick={()=>onLogin("apple")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#fff",borderRadius:12,padding:"13px 20px",cursor:"pointer",marginBottom:10}}>
      <span style={{fontSize:18,color:"#000"}}></span>
      <span style={{fontSize:13,fontWeight:600,color:"#000"}}>Continue with Apple</span>
    </div>
    <div onClick={()=>onLogin("google")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"13px 20px",cursor:"pointer"}}>
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      <span style={{fontSize:13,fontWeight:600,color:W.text}}>Continue with Google</span>
    </div>
    <div style={{textAlign:"center",marginTop:28}}>
      <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>By continuing you agree to Rated's <span style={{color:W.accent}}>Terms</span> & <span style={{color:W.accent}}>Privacy</span></div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// USERNAME SCREEN — checks server for availability, falls back to local set
// ─────────────────────────────────────────────────────────────────────────────

const UsernameScreen = ({ provider, session, onComplete }) => {
  // Two-step onboarding:
  //   step="name"     → user enters their display name, taps Continue
  //   step="username" → user picks their @handle (with name shown small at top)
  // Splitting these reduces cognitive load — one decision at a time, standard
  // onboarding pattern across modern social apps.
  const [step,setStep]=useState("name");
  const [name,setName]=useState("");
  const [value,setValue]=useState("");
  const [touched,setTouched]=useState(false);
  const [checking,setChecking]=useState(false);
  const [serverAvailable,setServerAvailable]=useState(null);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [nameError,setNameError]=useState("");
  const timerRef=useRef(null);
  // Cancel any pending username-availability check on unmount
  useEffect(()=>()=>{if(timerRef.current)clearTimeout(timerRef.current);},[]);

  const localError = (v) => {
    const val = v !== undefined ? v : value;
    if (!val) return null;
    if (val.length < 4) return "At least 4 characters";
    if (val.length > 20) return "Max 20 characters";
    if (!/^[a-z0-9_]+$/.test(val)) return "Only lowercase letters, numbers, and _";
    if (checkProfanity(val)) return "Username contains inappropriate language";
    if (TAKEN_USERNAMES.has(val)) return "Username already taken";
    return null;
  };

  const handleChange = (e) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"");
    setValue(raw); setTouched(true); setServerAvailable(null); setError("");
    clearTimeout(timerRef.current);
    if (raw.length >= 4) {
      setChecking(true);
      timerRef.current = setTimeout(async () => {
        if (localError(raw)) { setChecking(false); return; }
        const res = await API.checkUsername(raw);
        setServerAvailable(res ? res.available : !TAKEN_USERNAMES.has(raw));
        setChecking(false);
      }, 500);
    } else { setChecking(false); }
  };

  const localErr = touched ? localError(value) : null;
  const nameHasProfanity = !!(name && checkProfanity(name));
  const isAvailable = !localErr && serverAvailable === true && !checking && !nameHasProfanity;
  const showError = localErr || (touched && serverAvailable === false && !checking);
  const errorMsg = localErr || (serverAvailable === false ? "Username already taken" : "");

  // Step 1 → Step 2 transition. Validates name before advancing.
  const handleContinueFromName = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError("Please enter your name"); return; }
    if (trimmed.length < 2) { setNameError("Name must be at least 2 characters"); return; }
    if (checkProfanity(trimmed)) { setNameError("Name contains inappropriate language"); return; }
    setNameError("");
    setStep("username");
  };

  const handleSubmit = async () => {
    if (!isAvailable) return;
    if (session) {
      try { await API.setUsername(value, session); }
      catch(e) { setError(e.message || "Could not claim username"); return; }
    }
    TAKEN_USERNAMES.add(value);
    setConfirmed(true);
    setTimeout(() => onComplete(value, name.trim()), 900);
  };

  if (confirmed) return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:12}}>
      <div style={{fontSize:48}}>🎬</div>
      <div style={{fontSize:22,fontWeight:900,color:W.accent,fontFamily:"monospace"}}>@{value}</div>
      <div style={{fontSize:12,color:W.dim,fontFamily:"monospace"}}>Welcome to RATED</div>
    </div>
  );

  // ───── STEP 1: Name ─────
  if (step === "name") {
    const nameValid = name.trim().length >= 2 && !checkProfanity(name);
    return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 28px"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:28,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1,marginBottom:16}}>RATED</div>
          <div style={{width:52,height:52,borderRadius:"50%",background:W.card,border:`2px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px"}}>👋</div>
          <div style={{fontSize:15,fontWeight:800,color:W.text,fontFamily:"monospace"}}>What's your name?</div>
          <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:8,lineHeight:1.6}}>Signed in with {provider==="apple"?"Apple":"Google"}.<br/>This is how you'll appear on your profile.</div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace"}}>YOUR NAME</div>
            <div style={{fontSize:9,color:name.length>=27?W.accent:W.dim,fontFamily:"monospace"}}>{name.length} / 30</div>
          </div>
          <input value={name} onChange={e=>{setName(e.target.value);setNameError("");}} placeholder="e.g. Stephanie" maxLength={30}
            autoFocus enterKeyHint="next"
            onKeyDown={e=>{ if(e.key==="Enter" && nameValid){ e.preventDefault(); handleContinueFromName(); } }}
            style={{width:"100%",background:W.card,border:`1px solid ${nameError||(name&&checkProfanity(name))?W.accent:W.border}`,borderRadius:12,padding:"13px 14px",fontSize:14,color:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"}}/>
          <div style={{fontSize:9,fontFamily:"monospace",marginTop:6,color:nameError||(name&&checkProfanity(name))?W.accent:W.dim,lineHeight:1.5}}>
            {nameError ? `✗ ${nameError}` : (name && checkProfanity(name)) ? "✗ Name contains inappropriate language" : "Can be your real name or a nickname · changeable later"}
          </div>
        </div>
        <TapTarget onClick={handleContinueFromName} label="Continue to username" minTap={false}
          style={{background:nameValid?W.accent:W.card,border:nameValid?"none":`1px solid ${W.border}`,color:nameValid?"#fff":W.dim,borderRadius:12,padding:"13px",textAlign:"center",fontSize:13,fontWeight:700,fontFamily:"monospace",opacity:nameValid?1:0.5,transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",minHeight:48}}>
          CONTINUE →
        </TapTarget>
      </div>
    );
  }

  // ───── STEP 2: Username ─────
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 28px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:28,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1,marginBottom:12}}>RATED</div>
        {/* Greeting with the name they just entered + small "edit" affordance to step back */}
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,background:W.card,border:`1px solid ${W.border}`,marginBottom:14}}>
          <span style={{fontSize:11,color:W.dim,fontFamily:"monospace"}}>Hi,</span>
          <span style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{name.trim()}</span>
          <TapTarget onClick={()=>setStep("name")} label="Edit name" minTap={false}
            style={{fontSize:9,color:W.dim,fontFamily:"monospace",padding:"2px 4px",borderRadius:4}}>
            <span aria-hidden="true">✎</span>
          </TapTarget>
        </div>
        <div style={{fontSize:15,fontWeight:800,color:W.text,fontFamily:"monospace"}}>Now pick a username</div>
        <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:8,lineHeight:1.6}}>This is your unique @handle on RATED.</div>
      </div>
      <div style={{position:"relative",marginBottom:8}}>
        <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:W.dim,fontFamily:"monospace",pointerEvents:"none"}}>@</div>
        <input value={value} onChange={handleChange} onBlur={()=>setTouched(true)} placeholder="username" maxLength={20} autoFocus
          enterKeyHint="go"
          onKeyDown={e=>{ if(e.key==="Enter" && isAvailable){ e.preventDefault(); handleSubmit(); } }}
          style={{width:"100%",background:W.card,border:`1.5px solid ${showError?W.accent:isAvailable?W.green:W.border}`,borderRadius:12,padding:"13px 42px 13px 30px",fontSize:14,color:W.text,fontFamily:"monospace",outline:"none",letterSpacing:0.5,transition:"border-color 0.15s",boxSizing:"border-box"}}/>
        <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",fontSize:14}}>
          {checking&&<span style={{color:W.dim,fontSize:11,fontFamily:"monospace"}}>...</span>}
          {!checking&&isAvailable&&<span style={{color:W.green}}>✓</span>}
          {!checking&&showError&&value.length>0&&<span style={{color:W.accent}}>✗</span>}
        </div>
      </div>
      <div style={{marginBottom:16,paddingLeft:2,display:"flex",flexDirection:"column",gap:4}}>
        {/* Always-visible rules */}
        <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>4–20 chars · lowercase letters, numbers, underscore only</div>
        {/* Live status feedback below */}
        {!checking&&showError&&<div style={{fontSize:10,color:W.accent,fontFamily:"monospace"}}>✗ {errorMsg}</div>}
        {!checking&&isAvailable&&<div style={{fontSize:10,color:W.green,fontFamily:"monospace"}}>@{value} is available ✓</div>}
        {error&&<div style={{fontSize:10,color:W.accent,fontFamily:"monospace"}}>{error}</div>}
      </div>
      {!checking&&errorMsg==="Username already taken"&&value.length>=4&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:6}}>TRY ONE OF THESE</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[`${value}_`,`${value}1`,`${value}42`,`the_${value}`].filter(s=>!TAKEN_USERNAMES.has(s)&&s.length<=20).slice(0,4).map(s=>(
              <div key={s} onClick={()=>{setValue(s);setTouched(true);setChecking(true);setServerAvailable(null);setTimeout(async()=>{const r=await API.checkUsername(s);setServerAvailable(r?r.available:true);setChecking(false);},400);}}
                style={{padding:"5px 12px",borderRadius:10,background:W.card,border:`1px solid ${W.border}`,fontSize:10,fontFamily:"monospace",color:W.dim,cursor:"pointer"}}>@{s}</div>
            ))}
          </div>
        </div>
      )}
      <TapTarget onClick={handleSubmit} label={`Claim @${value||"username"}`} minTap={false}
        style={{background:isAvailable?W.accent:W.card,border:isAvailable?"none":`1px solid ${W.border}`,color:isAvailable?"#fff":W.dim,borderRadius:12,padding:"13px",textAlign:"center",fontSize:13,fontWeight:700,fontFamily:"monospace",opacity:isAvailable?1:0.5,transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",minHeight:48}}>
        CLAIM @{value||"username"} →
      </TapTarget>
      <div style={{textAlign:"center",marginTop:14,fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>Your username is public · You can change it once every 30 days</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_FEED = [
  {id:"g-001",type:"rating",user:"@cinephile99",avatar:"C",action:"rated",movie_title:"Parasite",movie_id:"m-002",rating:10,time:"5m",likes:34,liked:false},
  {id:"g-002",type:"ranking",user:"@reeltalks",avatar:"R",action:"ranked",movie_title:"Whiplash",movie_id:"m-004",rating:10,preview:"New #1 · dethroned Interstellar",rank_position:1,time:"22m",likes:18,liked:false},
  {id:"g-003",type:"rating",user:"@filmfreak",avatar:"F",action:"rated",movie_title:"The Dark Knight",movie_id:"m-003",rating:10,time:"1h",likes:9,liked:false},
  {id:"g-004",type:"review",user:"@lina",avatar:"L",action:"reviewed",movie_title:"RRR",movie_id:"m-005",preview:"S.S. Rajamouli delivers pure spectacle unlike anything Hollywood would greenlight...",rating:9,time:"2h",likes:27,liked:false},
  {id:"g-005",type:"streak",user:"@cinephile99",avatar:"C",action:"hit a 34-week streak 💎",time:"4h",likes:89,liked:false},
];

const HomeScreen = ({ onNav, onSelectMovie, session, userId, username, unreadCount=0, blockedUsers=new Set(), blockUser, reportContent, rateLimitedFollow, followingHandles=new Set(), toggleFollowHandle, onSelectUser, userFeedItems=[], onRank, savedMovies=new Set(), toggleSavedMovie, feedLikes={}, toggleFeedLike, showToast }) => {
  const [loaded,setLoaded]=useState(false);
  // Hydrate feed items with real timestamps derived from their "time" strings, once on mount.
  // After this, formatRelativeTime(item.ts) gives live-ticking labels.
  const [feedItems,setFeedItems]=useState(()=>MOCK_FEED.map(i=>({...i,ts:parseRelativeToTs(i.time)})));
  const [feedTab,setFeedTab]=useState("following");
  // Hydrate GLOBAL_FEED with real timestamps once
  const hydratedGlobalFeed = useRef(GLOBAL_FEED.map(i=>({...i,ts:parseRelativeToTs(i.time)}))).current;
  // likes and saved now come from props (App shell) so they persist across navigation
  const likes = feedLikes;
  const saved = savedMovies;
  const [replyOpen,setReplyOpen]=useState(null);
  const [replyText,setReplyText]=useState("");
  const [viewerImage,setViewerImage]=useState(null);
  const [shareItem,setShareItem]=useState(null);
  const [visibleCount,setVisibleCount]=useState(10); // pagination: start with 10, +10 on each load-more
  // Track which feed items have expanded reply threads (Everyone tab collapses by default)
  const [expandedReplies,setExpandedReplies]=useState(new Set());
  // Public replies — seeded with sample threads, keyed by feed item id. Hydrate ts on mount.
  const [replies,setReplies]=useState(()=>({
    "f-001":[
      {user:"@maya",avatar:"M",text:"Whiplash is an all-timer for me too",time:"3m ago",ts:parseRelativeToTs("3m")},
      {user:"@josh",avatar:"J",text:"Better than Birdman? Bold take 🔥",time:"12m ago",ts:parseRelativeToTs("12m")},
    ],
    "g-001":[
      {user:"@reeltalks",avatar:"R",text:"Parasite deserves every 10/10 it gets",time:"8m ago",ts:parseRelativeToTs("8m")},
    ],
    "g-004":[
      {user:"@maya",avatar:"M",text:"Rajamouli is a master, fully agree",time:"3h ago",ts:parseRelativeToTs("3h")},
      {user:"@carlos",avatar:"C",text:"Need to rewatch this one",time:"2h ago",ts:parseRelativeToTs("2h")},
      {user:"@filmfreak",avatar:"F",text:"That dance sequence lives in my head rent free",time:"45m ago",ts:parseRelativeToTs("45m")},
    ],
  }));

  const rawFeed = feedTab==="following"
    ? [...userFeedItems, ...feedItems.filter(item=>followingHandles.has(item.user))]
    : [...userFeedItems, ...hydratedGlobalFeed];
  const activeFeed = rawFeed.filter(item=>!blockedUsers.has(item.user));

  const [loadError,setLoadError]=useState(null);
  const [retryCount,setRetryCount]=useState(0);

  // Pull-to-refresh — re-runs the load effect
  const handleRefresh = async () => {
    setRetryCount(c=>c+1);
    await new Promise(r=>setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  useEffect(()=>{
    const load = async () => {
      setLoadError(null);
      try {
        if (userId && session) {
          const apiFeed = await API.getFeed(userId, session);
          if (apiFeed && apiFeed.length > 0) {
            setFeedItems(apiFeed.map(r=>{
              // Backend returns `ranked_at` as Unix seconds, frontend wants ms.
              const tsMs = (r.ranked_at || 0) * 1000;
              // Prefer @username (handle) for display; fall back to display name.
              const handle = r.user?.username ? `@${r.user.username}` : `@${r.user?.name||"user"}`;
              return {
                id:`api-${r.movie.movie_id}-${r.ranked_at}`,
                type:"rating",
                user: handle,
                avatar: (r.user?.username || r.user?.name || "?")[0].toUpperCase(),
                action:"rated",
                movie_title:r.movie.title,
                movie_id:r.movie.movie_id,
                rating:r.score,
                ts: tsMs,
                time: "", // formatRelativeTime(tsMs) is computed in the render path
                likes:0,
                liked:false,
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
    return ()=>clearTimeout(timer);
  },[userId, session, retryCount]);

  const handleRetry = ()=>{setLoaded(false);setLoadError(null);setRetryCount(c=>c+1);};

  const toggleSave=(id)=>toggleSavedMovie&&toggleSavedMovie(id);
  const toggleFollow=async(friend)=>{
    const handle=`@${friend.username}`;
    const isFollowingNow = followingHandles.has(handle);
    // toggleFollowHandle handles both the local state and the backend write
    // (with optimistic update + rollback). For the unfollow path we skip the
    // rate limiter; for the follow path we wrap in the limiter.
    if (isFollowingNow) {
      toggleFollowHandle&&toggleFollowHandle(handle);
      return;
    }
    if (rateLimitedFollow) {
      rateLimitedFollow(()=>toggleFollowHandle&&toggleFollowHandle(handle));
    } else {
      toggleFollowHandle&&toggleFollowHandle(handle);
    }
  };
  const submitReply=(itemId)=>{
    const trimmed = replyText.trim();
    if (!trimmed) return;
    // Hard cap at 280 chars — matches the input maxLength, guards against any path
    // that could bypass the input (paste handler, autofill, etc.)
    if (trimmed.length > 280) return;
    const myHandle = username ? `@${username}` : "@you";
    const myAvatar = (username||"Y")[0].toUpperCase();
    setReplies(p=>({...p,[itemId]:[...(p[itemId]||[]),{user:myHandle,avatar:myAvatar,text:trimmed,time:"just now",ts:Date.now()}]}));
    setReplyText("");
    setReplyOpen(null);
  };
  // Highlights — fetch real popular films from TMDB, fall back to hardcoded MOVIES on failure.
  const [tmdbPopularMovies,setTmdbPopularMovies]=useState(null);
  useEffect(()=>{
    let cancelled = false;
    tmdbPopular().then(data=>{ if (!cancelled && data && data.length>0) setTmdbPopularMovies(data); });
    return ()=>{ cancelled = true; };
  },[]);
  const highlights = tmdbPopularMovies
    ? tmdbPopularMovies.slice(0, 4)
    : [...MOVIES]
        .sort((a,b)=>{
          if (a.is_highlighted && !b.is_highlighted) return -1;
          if (!a.is_highlighted && b.is_highlighted) return 1;
          return (a.trending_rank||99)-(b.trending_rank||99);
        })
        .slice(0,4);
  if(!loaded) return <ScreenWithNav active="home" onNav={onNav}>
    <div style={{padding:"6px 22px 0",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:18,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1}}>RATED</div>
      <Skeleton w={32} h={32} radius={16}/>
    </div>
    <div style={{padding:"0 22px 10px"}}>
      <Skeleton w={90} h={11} style={{marginBottom:10}}/>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        {[0,1,2,3].map(i=><Skeleton key={i} w={105} h={148} radius={12}/>)}
      </div>
    </div>
    <FeedSkeleton/>
  </ScreenWithNav>;

  return (
    <ScreenWithNav active="home" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{padding:"6px 22px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:18,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1}}>RATED</div>
        <div onClick={()=>onNav("notifications")} style={{position:"relative",cursor:"pointer",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",background:W.card,border:`1px solid ${W.border}`,borderRadius:"50%"}}>
          <span style={{fontSize:16}}>🔔</span>
          {unreadCount>0&&<div style={{position:"absolute",top:-1,right:-1,background:W.accent,borderRadius:"50%",width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:"#fff",fontFamily:"monospace"}}>{unreadCount>9?"9+":unreadCount}</div>}
        </div>
      </div>
      <div style={{padding:"10px 22px 16px",display:"flex",flexDirection:"column",gap:12}}>
        {loadError&&<div style={{background:W.card,border:`1px solid ${W.accent}66`,borderRadius:12,padding:"11px 13px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>Couldn't load your feed</div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2,lineHeight:1.5}}>{loadError} · Showing cached content.</div>
          </div>
          <TapTarget onClick={handleRetry} label="Retry loading feed" minTap={false}
            style={{padding:"7px 14px",borderRadius:8,background:W.accent,color:"#fff",fontSize:10,fontWeight:700,fontFamily:"monospace",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",minHeight:36}}>
            Retry
          </TapTarget>
        </div>}
        <div style={{fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1.5}}>HIGHLIGHTS</div>
        <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4}}>
          {highlights.map(m=>(
            <div key={m.id} style={{flexShrink:0,width:105}}>
              <div style={{position:"relative",cursor:"pointer"}} onClick={()=>onSelectMovie(m)}>
                <Poster url={m.poster_url} title={m.title} w={105} h={148} radius={12}/>
                {m.trending_rank<=3&&<div style={{position:"absolute",top:6,left:6,background:W.accent,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>#{m.trending_rank}</div>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.title}</div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year}</div>
                </div>
                <div onClick={e=>{e.stopPropagation();toggleSave(m.id);}} style={{cursor:"pointer",fontSize:14,flexShrink:0,marginLeft:4}}>
                  <span style={{color:saved.has(m.id)?W.blue:W.dim}}>{saved.has(m.id)?"◆":"◇"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1.5}}>ACTIVITY</div>
        <div style={{display:"flex",borderBottom:`1px solid ${W.border}`,marginBottom:4}}>
          {[{key:"following",label:"Following"},{key:"everyone",label:"Everyone"}].map(t=>(
            <div key={t.key} onClick={()=>setFeedTab(t.key)} style={{flex:1,textAlign:"center",padding:"6px 0",fontSize:10,fontFamily:"monospace",fontWeight:600,color:feedTab===t.key?W.accent:W.dim,borderBottom:`2px solid ${feedTab===t.key?W.accent:"transparent"}`,cursor:"pointer"}}>{t.label}</div>
          ))}
        </div>
        {feedTab==="following"&&activeFeed.length===0&&<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:28,marginBottom:8}}>👥</div><div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Nobody followed yet</div><div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6}}>Follow people to see their activity here</div></div>}
        {activeFeed.slice(0, visibleCount).map(item=>{
          const isLiked=likes[item.id]??item.liked;
          const likeCount=(item.likes||0)+(likes[item.id]&&!item.liked?1:0)-(!likes[item.id]&&item.liked?1:0);
          const friend=MOCK_FRIENDS.find(u=>`@${u.username}`===item.user);
          const isFollowing=followingHandles.has(item.user);
          const itemReplies=replies[item.id]||[];
          const isOwnUser = item.user==="@you" || item.user===`@${username}`;
          const canSelectUser = item.user && !isOwnUser;
          const handleSelectUser = () => {
            if (canSelectUser) { haptic("light"); onSelectUser && onSelectUser(item.user); }
          };
          return (
            <div key={item.id} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:12,position:"relative"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                {canSelectUser ? (
                  <TapTarget onClick={handleSelectUser} label={`View ${item.user}'s profile`} minTap={false}
                    style={{width:30,height:30,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>
                    <span aria-hidden="true">{item.avatar}</span>
                  </TapTarget>
                ) : (
                  <div aria-hidden="true" style={{width:30,height:30,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{item.avatar}</div>
                )}
                {/* Username + timestamp column. FOLLOW/share/⋯ are siblings in the outer
                    row below — keeping them separate prevents the follow pill from
                    crowding the username on narrow screens. */}
                <div style={{flex:1,minWidth:0}}>
                  {canSelectUser ? (
                    <TapTarget onClick={handleSelectUser} label={`View ${item.user}'s profile`} minTap={false}
                      style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace",padding:"2px 0",borderRadius:4,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {item.user}
                    </TapTarget>
                  ) : (
                    <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.user}</div>
                  )}
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{item.ts?formatRelativeTime(item.ts):item.time}</div>
                </div>
                {/* Follow/Unfollow — on Everyone tab, never on own posts. Now a sibling
                    of the share/⋯ buttons so it gets consistent spacing (gap:8 between
                    all trailing action buttons). */}
                {feedTab==="everyone"&&!isOwnUser&&(()=>{
                  const handleFollowToggle = (e) => {
                    e.stopPropagation();
                    if (friend) {
                      toggleFollow(friend);
                    } else if (isFollowing) {
                      toggleFollowHandle && toggleFollowHandle(item.user);
                    } else if (rateLimitedFollow) {
                      rateLimitedFollow(()=>toggleFollowHandle && toggleFollowHandle(item.user));
                    } else {
                      toggleFollowHandle && toggleFollowHandle(item.user);
                    }
                  };
                  return (
                    <TapTarget onClick={handleFollowToggle}
                      label={isFollowing?`Unfollow ${item.user}`:`Follow ${item.user}`}
                      minTap={false}
                      style={{padding:"0 12px",borderRadius:16,fontSize:9,fontWeight:700,fontFamily:"monospace",background:isFollowing?W.accentDim:"transparent",border:`1px solid ${isFollowing?W.accent:W.border}`,color:isFollowing?W.accent:W.dim,minHeight:32,height:32,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {isFollowing?"FOLLOWING":"+ FOLLOW"}
                    </TapTarget>
                  );
                })()}
                {/* Share button */}
                {item.movie_id&&<TapTarget onClick={e=>{e.stopPropagation();haptic("medium");setShareItem({type:"movie",id:item.movie_id,title:item.movie_title});}} label={`Share ${item.movie_title||"post"}`} minTap={false}
                  style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:"50%",background:W.card,border:`1px solid ${W.border}`,flexShrink:0}}>
                  <ShareIcon size={14} color={W.dim}/>
                </TapTarget>}
                <ReportBlockMenu
                  targetType="feed" targetId={item.id} targetLabel={`${item.user} - ${item.movie_title||item.action}`}
                  targetUser={item.user}
                  onReport={reportContent} onBlock={blockUser} blockedUsers={blockedUsers}
                />
              </div>
              <div style={{fontSize:11,color:W.text,fontFamily:"monospace",lineHeight:1.5,marginBottom:6}}>
                {item.type==="rating"&&<span>{item.action} <span style={{color:W.gold,fontWeight:700}}>{item.movie_title}</span> <span style={{color:W.gold}}>★ {item.rating}/10</span></span>}
                {item.type==="review"&&<div><span>{item.action} <span onClick={e=>{e.stopPropagation();const mv=findMovieSync(item.movie_id, item.movie_title);if(mv){haptic("light");onSelectMovie(mv);}}} style={{color:W.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",textDecorationColor:`${W.gold}55`,textUnderlineOffset:2}}>{item.movie_title}</span>{item.rating&&<span style={{color:W.gold,fontWeight:700,marginLeft:6}}>★ {item.rating}/10</span>}</span><div style={{fontSize:10,color:W.dim,marginTop:4,fontStyle:"italic"}}>"{item.preview?.slice(0,90)}..."</div></div>}
                {item.type==="ranking"&&<div><span>{item.action}{item.movie_title&&<span onClick={e=>{e.stopPropagation();const mv=findMovieSync(item.movie_id, item.movie_title);if(mv){haptic("light");onSelectMovie(mv);}}} style={{color:W.accent,fontWeight:700,cursor:"pointer",textDecoration:"underline",textDecorationColor:`${W.accent}55`,textUnderlineOffset:2,marginLeft:4}}>{item.movie_title}</span>}{item.rating&&<span style={{color:W.gold,fontWeight:700,marginLeft:6}}>★ {item.rating}/10</span>}</span><div onClick={e=>{e.stopPropagation();const mv=findMovieSync(item.movie_id, item.movie_title);if(mv){haptic("light");onSelectMovie(mv);}}} style={{fontSize:10,color:item.movie_id?W.dim:W.dim,marginTop:2,cursor:item.movie_id?"pointer":"default"}}>{item.preview}</div></div>}
                {item.type==="save"&&<span>saved <span onClick={e=>{e.stopPropagation();const mv=findMovieSync(item.movie_id, item.movie_title);if(mv){haptic("light");onSelectMovie(mv);}}} style={{color:W.blue,fontWeight:700,cursor:"pointer",textDecoration:"underline",textDecorationColor:`${W.blue}55`,textUnderlineOffset:2}}>{item.movie_title}</span> to watch later 🎬</span>}
                {item.type==="streak"&&<span>{item.action}</span>}
              </div>
              {/* Public reply thread — collapsed on Everyone tab (shows only most recent) */}
              {itemReplies.length>0&&(()=>{
                const isExpanded = expandedReplies.has(item.id);
                const shouldCollapse = feedTab==="everyone" && !isExpanded && itemReplies.length>1;
                const visibleReplies = shouldCollapse ? [itemReplies[itemReplies.length-1]] : itemReplies;
                const hiddenCount = itemReplies.length - visibleReplies.length;
                return (
                  <div style={{borderTop:`1px solid ${W.border}`,paddingTop:8,marginBottom:6,display:"flex",flexDirection:"column",gap:6}}>
                    {shouldCollapse&&<div onClick={()=>setExpandedReplies(p=>{const n=new Set(p);n.add(item.id);return n;})} style={{fontSize:9,color:W.dim,fontFamily:"monospace",cursor:"pointer",paddingLeft:28}}>
                      — View {hiddenCount} earlier {hiddenCount===1?"reply":"replies"}
                    </div>}
                    {visibleReplies.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                        <div onClick={()=>r.user&&r.user!=="@you"&&onSelectUser&&onSelectUser(r.user)} style={{width:22,height:22,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0,cursor:r.user&&r.user!=="@you"?"pointer":"default"}}>{r.avatar||"?"}</div>
                        <div style={{background:W.bg,borderRadius:8,padding:"5px 9px",flex:1,minWidth:0}}>
                          <div style={{display:"flex",gap:6,alignItems:"baseline",marginBottom:1}}>
                            <span onClick={()=>r.user&&r.user!=="@you"&&onSelectUser&&onSelectUser(r.user)} style={{fontSize:9,fontWeight:700,color:W.accent,fontFamily:"monospace",cursor:r.user&&r.user!=="@you"?"pointer":"default"}}>{r.user||"@you"}</span>
                            <span style={{fontSize:8,color:W.dim,fontFamily:"monospace"}}>{r.ts?formatRelativeTime(r.ts):r.time}</span>
                          </div>
                          <div style={{fontSize:10,color:W.text,fontFamily:"monospace",lineHeight:1.4}}>{r.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {/* Reply input — capped at 280 chars (matches Twitter/X) so the input
                  stays useful as a quick reaction and doesn't break card layout. */}
              {replyOpen===item.id&&(()=>{
                const replyLen = replyText.length;
                const replyValid = replyText.trim().length > 0 && replyLen <= 280;
                const counterColor = replyLen >= 252 ? W.accent : W.dim; // warn at 90%
                return (
                  <div style={{borderTop:`1px solid ${W.border}`,paddingTop:8,marginBottom:6}}>
                    <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                      <input value={replyText} onChange={e=>setReplyText(e.target.value)}
                        onKeyDown={e=>{ if(e.key==="Enter" && replyValid){ submitReply(item.id); } }}
                        placeholder="Write a reply..." autoFocus aria-label="Write a reply"
                        enterKeyHint="send" maxLength={280}
                        style={{flex:1,background:W.bg,border:`1px solid ${W.border}`,borderRadius:8,padding:"6px 10px",fontSize:10,color:W.text,fontFamily:"monospace",outline:"none"}}/>
                      <TapTarget onClick={()=>{ if(replyValid) submitReply(item.id); }}
                        label="Send reply" disabled={!replyValid} minTap={false}
                        style={{background:W.accent,borderRadius:8,padding:"6px 10px",fontSize:10,fontWeight:700,color:"#fff",fontFamily:"monospace",flexShrink:0,minHeight:36,minWidth:36,display:"flex",alignItems:"center",justifyContent:"center",opacity:replyValid?1:0.4}}>
                        <span aria-hidden="true">→</span>
                      </TapTarget>
                    </div>
                    {/* Counter only appears once user starts typing — no clutter when empty */}
                    {replyLen>0&&(
                      <div style={{fontSize:8,color:counterColor,fontFamily:"monospace",textAlign:"right",marginTop:3}}>
                        {replyLen} / 280
                      </div>
                    )}
                  </div>
                );
              })()}
              <div role="group" aria-label="Post actions" style={{display:"flex",gap:6,alignItems:"center",paddingTop:6,borderTop:`1px solid ${W.border}`}}>
                <TapTarget onClick={()=>{toggleFeedLike&&toggleFeedLike(item.id);}} label={`${isLiked?"Unlike":"Like"} post${typeof likeCount==="number"?`, ${likeCount} ${likeCount===1?"like":"likes"}`:""}`} minTap={false}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"6px 8px",borderRadius:8,minHeight:36}}>
                  <span aria-hidden="true" style={{fontSize:14,color:isLiked?W.accent:W.dim}}>{isLiked?"♥":"♡"}</span>
                  <span style={{fontSize:10,color:isLiked?W.accent:W.dim,fontFamily:"monospace",fontWeight:isLiked?700:400}}>{likeCount}</span>
                </TapTarget>
                <TapTarget onClick={()=>{
                    haptic("light");
                    const isCollapsed = feedTab==="everyone" && itemReplies.length>1 && !expandedReplies.has(item.id);
                    if (isCollapsed) {
                      setExpandedReplies(p=>{const n=new Set(p);n.add(item.id);return n;});
                    } else {
                      setReplyOpen(replyOpen===item.id?null:item.id);
                      setReplyText("");
                    }
                  }} label={itemReplies.length>0?`${itemReplies.length} ${itemReplies.length===1?"reply":"replies"}`:"Reply to post"} minTap={false}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"6px 8px",borderRadius:8,minHeight:36}}>
                  <span aria-hidden="true" style={{fontSize:12,color:replyOpen===item.id?W.accent:W.dim}}>💬</span>
                  <span style={{fontSize:10,color:replyOpen===item.id?W.accent:W.dim,fontFamily:"monospace",fontWeight:replyOpen===item.id?700:400}}>
                    {itemReplies.length>0?itemReplies.length:"Reply"}
                  </span>
                </TapTarget>
                {item.movie_id&&onRank&&(()=>{
                  const movie=findMovieSync(item.movie_id, item.movie_title);
                  if(!movie) return null;
                  return <TapTarget onClick={e=>{e.stopPropagation();haptic("medium");onRank(movie);}} label={`Rank ${movie.title}`} minTap={false}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"6px 8px",borderRadius:8,minHeight:36}}>
                    <span aria-hidden="true" style={{fontSize:12,color:W.accent}}>⚡</span>
                    <span style={{fontSize:10,color:W.accent,fontFamily:"monospace",fontWeight:700}}>Rank</span>
                  </TapTarget>;
                })()}
                {item.movie_id&&<TapTarget onClick={()=>{haptic("light");toggleSave(item.movie_id);}} label={`${saved.has(item.movie_id)?"Remove from saved":"Save"} ${item.movie_title||"movie"}`} minTap={false}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",borderRadius:8,minHeight:36,marginLeft:"auto"}}>
                  <span aria-hidden="true" style={{fontSize:13,color:saved.has(item.movie_id)?W.blue:W.dim}}>{saved.has(item.movie_id)?"◆":"◇"}</span>
                  <span style={{fontSize:10,fontFamily:"monospace",fontWeight:saved.has(item.movie_id)?700:400,color:saved.has(item.movie_id)?W.blue:W.dim}}>
                    {saved.has(item.movie_id)?"Saved":"Save"}
                  </span>
                </TapTarget>}
              </div>
            </div>
          );
        })}
        {activeFeed.length > visibleCount && <TapTarget onClick={()=>{haptic("light");setVisibleCount(c=>c+10);}} label={`Load ${Math.min(10, activeFeed.length - visibleCount)} more posts`} minTap={false}
          style={{padding:"11px",textAlign:"center",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",minHeight:44}}>
          Load {Math.min(10, activeFeed.length - visibleCount)} more
        </TapTarget>}
      </div>
      <ImageViewer url={viewerImage} onClose={()=>setViewerImage(null)}/>
      <ShareSheet item={shareItem} onClose={()=>setShareItem(null)} showToast={showToast}/>
    </ScreenWithNav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────

// ReviewModal — used for both new reviews AND editing existing ones.
// When `existing` is passed (an object with {ts, text, rating, movie_id, movie_title}),
// the modal pre-fills and routes submission to onSubmit(updatedFields, existing.ts).
// For new reviews, existing is undefined and onSubmit receives just the review object.
const ReviewModal = ({ movie, onClose, onSubmit, existing }) => {
  const isEdit = !!existing;
  const [text,setText]=useState(existing?.text||"");
  const [rating,setRating]=useState(existing?.rating||0);
  const [hover,setHover]=useState(0);
  const [submitted,setSubmitted]=useState(false);
  const [error,setError]=useState(null);
  const submit=()=>{
    if(!rating||!text.trim())return;
    // Hard block on profanity in review text
    if(checkProfanity(text)){
      setError("Review contains inappropriate language. Please revise it.");
      return;
    }
    setError(null);
    if (isEdit) {
      onSubmit && onSubmit(text.trim(), rating);
    } else {
      onSubmit && onSubmit({movie_id:movie.id, movie_title:movie.title, rating, text:text.trim(), time:"just now"});
    }
    setSubmitted(true);
    setTimeout(onClose,1200);
  };
  return (
    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:50,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"20px 22px 32px",display:"flex",flexDirection:"column",gap:14}}>
        {submitted?<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:8}}>✓</div><div style={{fontSize:14,fontWeight:900,color:W.green,fontFamily:"monospace"}}>{isEdit?"Review Updated":"Review Posted!"}</div></div>:<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace"}}>✎ {isEdit?"EDIT REVIEW":"WRITE REVIEW"}</div>
            <div onClick={onClose} style={{fontSize:18,color:W.dim,cursor:"pointer"}}>✕</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Poster url={movie.poster_url} title={movie.title} w={40} h={56} radius={6}/>
            <div><div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{movie.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{movie.release_year} · {movie.directors?.[0]?.name}</div></div>
          </div>
          <div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>YOUR RATING</div>
            <div style={{display:"flex",gap:3}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <div key={n} onClick={()=>setRating(n)} onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)}
                  style={{flex:1,textAlign:"center",padding:"5px 0",borderRadius:6,fontSize:10,fontWeight:900,fontFamily:"monospace",cursor:"pointer",background:(hover||rating)>=n?W.goldDim:W.card,border:`1px solid ${(hover||rating)>=n?W.gold:W.border}`,color:(hover||rating)>=n?W.gold:W.dim}}>{n}</div>
              ))}
            </div>
            {rating>0&&<div style={{fontSize:9,color:W.gold,fontFamily:"monospace",marginTop:4,textAlign:"center"}}>★ {rating}/10</div>}
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>YOUR REVIEW</div>
              <div style={{fontSize:9,color:text.length>=450?W.accent:W.dim,fontFamily:"monospace"}}>{text.length} / 500</div>
            </div>
            <textarea value={text} onChange={e=>{setText(e.target.value);setError(null);}} placeholder="What did you think? Be honest..." maxLength={500}
              onKeyDown={e=>{ if(e.key==="Enter" && (e.metaKey||e.ctrlKey) && rating && text.trim()){ e.preventDefault(); submit(); } }}
              style={{width:"100%",minHeight:80,background:W.card,border:`1px solid ${error?W.accent:W.border}`,borderRadius:12,padding:"10px 14px",fontSize:11,fontFamily:"monospace",outline:"none",resize:"none",lineHeight:1.6}}/>
          </div>
          {error&&<div style={{padding:"8px 10px",borderRadius:8,background:W.accentDim,border:`1px solid ${W.accent}`,fontSize:10,color:W.accent,fontFamily:"monospace",lineHeight:1.5}}>✗ {error}</div>}
          <div onClick={submit} style={{background:rating&&text.trim()?W.accent:W.card,border:`1px solid ${rating&&text.trim()?W.accent:W.border}`,color:rating&&text.trim()?"#fff":W.dim,borderRadius:12,padding:"12px",fontSize:12,fontWeight:700,textAlign:"center",fontFamily:"monospace",cursor:rating&&text.trim()?"pointer":"default"}}>{isEdit?"SAVE CHANGES":"POST REVIEW"}</div>
        </>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MOVIE DETAIL SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const MovieDetailScreen = ({ movie, onBack, onRank, isUpcoming, watchlist, onToggleWatchlist, followingHandles=new Set(), onSelectUser, onSubmitReview, savedMovies=new Set(), toggleSavedMovie, showToast }) => {
  const [loaded,setLoaded]=useState(false);
  const [showReview,setShowReview]=useState(false);
  const [viewerImage,setViewerImage]=useState(null);
  const [shareOpen,setShareOpen]=useState(false);
  const [trailerOpen,setTrailerOpen]=useState(false);
  const edgeSwipe = useEdgeSwipeBack(onBack);
  // For TMDB movies, fetch the full detail (cast, trailers, backdrop) on open.
  // Local hardcoded movies already have this data.
  const [enrichedMovie,setEnrichedMovie]=useState(movie);
  useEffect(()=>{
    setEnrichedMovie(movie);
    if (!movie) return;
    let cancelled = false;
    if (movie.tmdb_id) {
      tmdbMovieDetail(movie.tmdb_id).then(full=>{
        if (!cancelled && full) {
          // Defensive merge: spread original first, then full, then explicitly
          // re-apply any URL fields that might have been nulled out by the TMDB
          // detail endpoint (some entries are missing poster_path/backdrop_path
          // in the detail response even when they're present in the list response).
          // Preserve the app's id (tmdb-123) so comparisons with savedMovies/watchlist still work.
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
    return ()=>{ cancelled = true; };
  },[movie?.id, movie?.tmdb_id]);
  const m = enrichedMovie || movie;
  // saved derives from the global set — updates reflect everywhere
  const saved = movie ? savedMovies.has(movie.id) : false;
  const setSaved = (val) => {
    if (!movie || !toggleSavedMovie) return;
    if (saved !== val) toggleSavedMovie(movie.id);
  };
  useEffect(()=>{setLoaded(false);setShowReview(false);setTrailerOpen(false);setTimeout(()=>setLoaded(true),300);},[movie?.id]);
  if(!movie) return null;
  if(!loaded) return (
    <div style={{padding:0}}>
      <Skeleton w="100%" h={180} radius={0}/>
      <div style={{padding:"48px 22px 28px",display:"flex",flexDirection:"column",gap:10}}>
        <Skeleton w="70%" h={18}/>
        <Skeleton w="40%" h={10}/>
        <div style={{display:"flex",gap:6,marginTop:4}}>
          <Skeleton w={60} h={44} radius={10}/>
          <Skeleton w={60} h={44} radius={10}/>
          <Skeleton w={60} h={44} radius={10}/>
        </div>
        <Skeleton w="100%" h={10} style={{marginTop:8}}/>
        <Skeleton w="100%" h={10}/>
        <Skeleton w="80%" h={10}/>
      </div>
    </div>
  );
  const trailer=m.trailers?.find(t=>t.is_primary)||m.trailers?.[0];
  const inWatchlist=watchlist?watchlist.has(m.id):false;
  return (
    <div {...edgeSwipe} style={{position:"relative"}}>
      {showReview&&<ReviewModal movie={m} onClose={()=>setShowReview(false)} onSubmit={onSubmitReview}/>}
      <ImageViewer url={viewerImage} onClose={()=>setViewerImage(null)}/>
      {shareOpen&&<ShareSheet item={{type:"movie",id:m.id,title:m.title}} onClose={()=>setShareOpen(false)} showToast={showToast}/>}
      {trailerOpen&&trailer&&trailer.video_key&&<TrailerModal videoKey={trailer.video_key} title={m.title} onClose={()=>setTrailerOpen(false)}/>}
      <div style={{position:"relative",height:180,background:`linear-gradient(180deg,#1a1a28,${W.bg})`,overflow:"hidden"}}>
        {m.backdrop_url&&<img src={m.backdrop_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.3,cursor:"pointer"}} onClick={()=>{haptic("light");setViewerImage(m.backdrop_url);}} onError={e=>e.target.style.display="none"}/>}
        <div style={{position:"absolute",top:10,left:16,fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}} onClick={()=>{haptic("light");onBack();}}>← Back</div>
        <TapTarget onClick={()=>{haptic("medium");setShareOpen(true);}} label={`Share ${m.title}`} minTap={false}
          style={{position:"absolute",top:10,right:16,width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ShareIcon size={14} color="#fff"/>
        </TapTarget>
        {trailer&&trailer.video_key&&<div onClick={()=>{haptic("medium");setTrailerOpen(true);}} style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
          <div style={{width:44,height:44,background:`${W.accent}cc`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",boxShadow:"0 4px 12px rgba(0,0,0,0.4)"}}>▶</div>
          <span style={{fontSize:9,color:"#fff",fontFamily:"monospace",fontWeight:600,textShadow:"0 1px 6px rgba(0,0,0,0.8)"}}>PLAY TRAILER</span>
        </div>}
        <div style={{position:"absolute",bottom:-40,left:22}}><Poster url={m.poster_url} title={m.title} w={72} h={100} radius={10} onClick={()=>{haptic("light");setViewerImage(m.poster_url);}}/></div>
      </div>
      <div style={{padding:"48px 22px 28px",display:"flex",flexDirection:"column",gap:8}}>
        <div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:18,fontWeight:900,color:W.text,fontFamily:"monospace",letterSpacing:-0.5}}>{m.title}</span>
            {m.is_international&&<Badge color="purple">{m.original_language?.toUpperCase()}</Badge>}
            {isUpcoming&&<Badge color="orange">UPCOMING</Badge>}
          </div>
          {m.original_title&&m.original_title!==m.title&&<div style={{fontSize:10,color:W.dim,fontFamily:"monospace",fontStyle:"italic"}}>{m.original_title}</div>}
          <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:3}}>
            {m.release_year}{m.runtime_minutes?` · ${Math.floor(m.runtime_minutes/60)}h ${m.runtime_minutes%60}m`:""}{m.content_rating?` · ${m.content_rating}`:""}
            {m.directors?.[0]?.name&&` · ${m.directors[0].name}`}
          </div>
          {isUpcoming&&m.release_date&&(()=>{
            const d=daysUntil(m.release_date);
            const label=d>0?`${d}d away`:d===0?"TODAY":"Released";
            return <div style={{fontSize:10,color:W.accent,fontFamily:"monospace",fontWeight:700,marginTop:4}}>📅 {formatReleaseDate(m.release_date)} · {label}</div>;
          })()}
          {isUpcoming&&m.must_see_reason&&<div style={{fontSize:10,color:W.gold,fontFamily:"monospace",marginTop:3}}>{m.must_see_reason}</div>}
        </div>
        {!isUpcoming&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {m.global_rank&&<div style={{background:W.accentDim,border:`1px solid ${W.accent}33`,borderRadius:10,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:900,color:W.accent,fontFamily:"monospace"}}>#{m.global_rank}</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>RATED</div></div>}
          {m.imdb_rating&&<div style={{background:W.goldDim,border:`1px solid ${W.gold}33`,borderRadius:10,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:900,color:W.gold,fontFamily:"monospace"}}>{m.imdb_rating}</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>IMDb</div></div>}
          {m.rotten_tomatoes_score&&<div style={{background:W.greenDim,border:`1px solid ${W.green}33`,borderRadius:10,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:900,color:W.green,fontFamily:"monospace"}}>{m.rotten_tomatoes_score}%</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>RT</div></div>}
          {m.global_elo_score&&<div style={{background:W.blueDim,border:`1px solid ${W.blue}33`,borderRadius:10,padding:"6px 12px",textAlign:"center",flex:1}}><div style={{fontSize:16,fontWeight:900,color:W.blue,fontFamily:"monospace"}}>{m.global_elo_score}</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>ELO</div></div>}
        </div>}
        {isUpcoming&&m.anticipation_score&&<div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"10px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>ANTICIPATION</span><span style={{fontSize:9,color:W.gold,fontFamily:"monospace",fontWeight:700}}>{m.anticipation_score}/1000</span></div>
          <div style={{height:4,background:W.border,borderRadius:2}}><div style={{height:"100%",background:`linear-gradient(90deg,${W.gold},${W.accent})`,borderRadius:2,width:`${m.anticipation_score/10}%`}}/></div>
          <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:6}}>👀 {m.watchlist_count?.toLocaleString()} watching</div>
        </div>}
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {m.genres?.map(g=><span key={g.name} style={{padding:"3px 10px",borderRadius:16,fontSize:9,fontFamily:"monospace",fontWeight:600,background:W.card,border:`1px solid ${W.border}`,color:W.dim}}>{g.name}</span>)}
        </div>
        <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>
          {m.synopsis?.slice(0,200)}{m.synopsis?.length>200&&<span style={{color:W.accent,fontWeight:600}}> read more</span>}
        </div>
        {isUpcoming?(
          <div style={{display:"flex",gap:6}}>
            <div style={{flex:1}} onClick={()=>onToggleWatchlist&&onToggleWatchlist(m.id)}>
              <div style={{background:inWatchlist?W.blueDim:W.accent,border:inWatchlist?`1px solid ${W.blue}`:"none",color:inWatchlist?W.blue:"#fff",borderRadius:12,padding:"9px 14px",fontSize:10,fontWeight:700,textAlign:"center",fontFamily:"monospace",cursor:"pointer"}}>{inWatchlist?"◆ IN WATCHLIST":"+ ADD TO WATCHLIST"}</div>
            </div>
          </div>
        ):(
          <div style={{display:"flex",gap:6}}>
            <div style={{flex:1}} onClick={()=>onRank&&onRank(m)}><Btn accent full small>⚡ RANK</Btn></div>
            <div style={{flex:1}} onClick={()=>setSaved(!saved)}>
              {/* SAVE button matches Btn's small full styling exactly so all three buttons
                  in this row are the same height/padding. The only difference is color:
                  blue tint when saved (◆), default border when not (◇). */}
              <TapTarget label={saved?"Unsave movie":"Save movie"} minTap={false}
                style={{background:saved?W.blueDim:"transparent",border:saved?`1px solid ${W.blue}`:`1px solid ${W.border}`,color:saved?W.blue:W.dim,borderRadius:12,padding:"8px 14px",fontSize:10,fontWeight:700,textAlign:"center",width:"100%",fontFamily:"monospace",display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:36}}>
                {saved?"◆ SAVED":"◇ SAVE"}
              </TapTarget>
            </div>
            <div style={{flex:1}} onClick={()=>setShowReview(true)}><Btn full small>✎ REVIEW</Btn></div>
          </div>
        )}
        {m.cast?.length>0&&m.cast[0].name!=="TBA"&&<>
          <div style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:4}}>CAST</div>
          <div style={{display:"flex",gap:10,overflowX:"auto"}}>
            {m.cast.slice(0,5).map((c,i)=>(
              <div key={i} style={{textAlign:"center",flexShrink:0}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:W.card,border:`1px solid ${W.border}`,margin:"0 auto 3px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>👤</div>
                <div style={{fontSize:9,fontWeight:700,color:W.text,fontFamily:"monospace",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name.split(" ").pop()}</div>
                <div style={{fontSize:8,color:W.dim,fontFamily:"monospace"}}>{c.character_name}</div>
              </div>
            ))}
          </div>
        </>}
        {!isUpcoming&&<div style={{display:"flex",gap:8,marginTop:4}}>
          {[{n:m.user_rating_count||0,l:"Ratings"},{n:m.review_count||0,l:"Reviews"},{n:m.watchlist_count||0,l:"Watchlisted"},{n:m.seen_count||0,l:"Seen"}].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",background:W.card,borderRadius:8,padding:"6px 4px",border:`1px solid ${W.border}`}}>
              <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>{s.n>999?`${(s.n/1000).toFixed(1)}k`:s.n}</div>
              <div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>{s.l}</div>
            </div>
          ))}
        </div>}

        {/* People you follow who rated/reviewed this movie */}
        {!isUpcoming&&(()=>{
          // Mock: for each followed user, derive a rating/review for this movie based on handle+movie hash
          const followedActivity = Array.from(followingHandles).map(handle=>{
            const prof = USER_PROFILES[handle];
            if(!prof) return null;
            // Pseudo-random: use char codes to decide if this user ranked this movie + what score
            const seed = (handle+m.id).split("").reduce((a,c)=>a+c.charCodeAt(0),0);
            const rated = seed % 3 !== 0; // 2/3 of followed users have rated this
            if(!rated) return null;
            const score = 6 + (seed % 5); // 6-10
            const hasReview = seed % 4 === 0; // 1/4 also wrote a review
            const reviewBits = ["A masterclass in tension and pacing.","Exactly the kind of film I come back to.","Beautifully shot, emotionally wrecking.","Overrated but still compelling.","Genre-defining performance from the lead.","Visually stunning but narratively uneven."];
            const review = hasReview ? reviewBits[seed % reviewBits.length] : null;
            return { handle, prof, score, review };
          }).filter(Boolean);

          if(followedActivity.length===0) return null;
          return (
            <>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
                <span style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>👥 PEOPLE YOU FOLLOW</span>
                <span style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>· {followedActivity.length}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {followedActivity.map(a=>(
                  <div key={a.handle} onClick={()=>onSelectUser&&onSelectUser(a.handle)} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{a.prof.avatar}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{a.handle}</span>
                          {a.prof.badge&&<span style={{fontSize:11}}>{a.prof.badge}</span>}
                        </div>
                        <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:1}}>{a.review?"reviewed":"ranked"}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace"}}>{a.score}/10</div>
                      </div>
                    </div>
                    {a.review&&<div style={{fontSize:10,color:W.dim,fontFamily:"monospace",fontStyle:"italic",marginTop:6,lineHeight:1.5,borderTop:`1px solid ${W.border}`,paddingTop:6}}>"{a.review}"</div>}
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {m.keywords&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:2}}>
          {m.keywords.slice(0,6).map(k=><span key={k} style={{padding:"2px 8px",borderRadius:10,fontSize:8,fontFamily:"monospace",background:W.card,border:`1px solid ${W.border}`,color:W.dim}}>#{k}</span>)}
        </div>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UPCOMING SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const UpcomingScreen = ({ onNav, onSelectUpcoming, watchlist, onToggleWatchlist }) => {
  const [genre,setGenre]=useState("All");
  // Fetch upcoming films from TMDB; fall back to hardcoded UPCOMING if unavailable
  const [tmdbUpcomingMovies,setTmdbUpcomingMovies]=useState(null);
  const [refreshNonce,setRefreshNonce]=useState(0); // bump to re-fetch
  useEffect(()=>{
    let cancelled = false;
    tmdbUpcoming().then(data=>{ if (!cancelled && data && data.length>0) setTmdbUpcomingMovies(data); });
    return ()=>{ cancelled = true; };
  },[refreshNonce]);
  // Pull-to-refresh re-runs the TMDB fetch (or just animates if no backend/TMDB).
  const handleRefresh = async () => {
    setRefreshNonce(n=>n+1);
    await new Promise(r=>setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);
  const source = tmdbUpcomingMovies || UPCOMING;
  const filtered=[...source].filter(u=>genre==="All"||(u.genres||[]).some(g=>g.name===genre)).sort((a,b)=>(daysUntil(a.release_date)||0)-(daysUntil(b.release_date)||0));
  return (
    <ScreenWithNav active="upcoming" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{padding:"8px 22px 6px",fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>◈ UPCOMING · MUST SEE</div>
      <div style={{display:"flex",gap:6,padding:"0 22px 10px",overflowX:"auto"}}>
        {ALL_GENRES.map(g=>(
          <span key={g} onClick={()=>setGenre(g)} style={{flexShrink:0,padding:"4px 12px",borderRadius:16,fontSize:9,fontFamily:"monospace",fontWeight:600,cursor:"pointer",background:genre===g?W.accentDim:W.card,border:`1px solid ${genre===g?W.accent:W.border}`,color:genre===g?W.accent:W.dim}}>{g}</span>
        ))}
      </div>
      <div style={{padding:"0 22px 16px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:W.dim,fontFamily:"monospace",fontSize:11}}>No upcoming {genre} films</div>}
        {filtered.map(u=>(
          <div key={u.id} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:14}}>
            <div style={{display:"flex",gap:12,cursor:"pointer"}} onClick={()=>onSelectUpcoming(u)}>
              <Poster url={u.poster_url} title={u.title} w={56} h={78} radius={8}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>{u.title}</span>
                </div>
                <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{u.directors?.[0]?.name||(u.genres?.[0]?.name)} · {u.genres?.map(g=>g.name).filter(Boolean).join(", ")}</div>
                {u.must_see_reason&&<div style={{fontSize:10,color:W.gold,fontFamily:"monospace",marginTop:4}}>{u.must_see_reason}</div>}
                <div style={{display:"flex",gap:10,marginTop:6}}>
                  <div style={{fontSize:10,color:W.dim,fontFamily:"monospace"}}>📅 {u.release_date}</div>
                  <div style={{fontSize:10,color:W.accent,fontFamily:"monospace",fontWeight:700}}>{(()=>{const d=daysUntil(u.release_date);return d>0?`${d}d away`:d===0?"TODAY":"Released";})()}</div>
                </div>
                {(u.watchlist_count||u.anticipation_score)&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:3}}>{u.watchlist_count?`👀 ${u.watchlist_count.toLocaleString()} watching`:""}{u.watchlist_count&&u.anticipation_score?" · ":""}{u.anticipation_score?`📊 ${u.anticipation_score} hype`:""}</div>}
              </div>
            </div>
            <div style={{marginTop:10}} onClick={()=>onToggleWatchlist(u.id)}>
              <div style={{background:watchlist.has(u.id)?W.blueDim:W.accent,border:watchlist.has(u.id)?`1px solid ${W.blue}`:"none",color:watchlist.has(u.id)?W.blue:"#fff",borderRadius:10,padding:"7px 0",fontSize:9,fontWeight:700,textAlign:"center",fontFamily:"monospace",cursor:"pointer"}}>{watchlist.has(u.id)?"◆ IN WATCHLIST":"+ WATCHLIST"}</div>
            </div>
          </div>
        ))}
      </div>
    </ScreenWithNav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS = [
  {id:"n-001",type:"follow",     read:false,time:"2m ago",  user:"@cinephile99",avatar:"C", text:"started following you"},
  {id:"n-002",type:"follow_req", read:false,time:"14m ago", user:"@filmfreak",  avatar:"F", text:"requested to follow you"},
  {id:"n-003",type:"watchlist",  read:false,time:"1h ago",  movie:"Sinners",    icon:"🎬",  text:"is releasing in 7 days · Add to your watchlist"},
  {id:"n-004",type:"follow",     read:true, time:"3h ago",  user:"@maya",       avatar:"M", text:"started following you"},
  {id:"n-005",type:"watchlist",  read:true, time:"1d ago",  movie:"Mission: Impossible 8", icon:"🎬", text:"is releasing in 42 days"},
  {id:"n-006",type:"follow_req", read:true, time:"2d ago",  user:"@josh",       avatar:"J", text:"requested to follow you"},
  {id:"n-007",type:"follow",     read:true, time:"3d ago",  user:"@carlos",     avatar:"C", text:"started following you"},
];

const NotificationsScreen = ({ onNav, isPrivate, onMarkAllRead, blockedUsers=new Set(), toggleFollowHandle, followingHandles=new Set(), approveFollower, onSelectUser, rateLimitedFollow }) => {
  // Hydrate notifications with real timestamps so formatRelativeTime ticks live
  const [notifications,setNotifications]=useState(()=>MOCK_NOTIFICATIONS.map(n=>({...n,ts:parseRelativeToTs(n.time)})));
  const [tab,setTab]=useState("all");
  const {confirm, ConfirmDialog} = useConfirm();
  // Auto-mark all read when screen opens. Using a no-deps effect so it fires once on mount.
  // onMarkAllRead is captured from initial render — if the parent stabilized it with useCallback
  // (which setUnreadCount is), this is safe without a ref.
  useEffect(()=>{
    setNotifications(p=>p.map(n=>({...n,read:true})));
    onMarkAllRead&&onMarkAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const markRead=(id)=>setNotifications(p=>p.map(n=>n.id===id?{...n,read:true}:n));

  const approveRequest=(id)=>{
    const notif = notifications.find(n=>n.id===id);
    setNotifications(p=>p.map(n=>n.id===id?{...n,type:"follow",read:true,text:"is now following you"}:n));
    // Add them as a follower (boosts your followers count on Profile)
    if (notif?.user && approveFollower) {
      approveFollower(notif.user);
    }
  };
  const declineRequest=(id)=>{
    const notif = notifications.find(n=>n.id===id);
    confirm({
      icon:"✕",
      title:"Decline follow request?",
      message:notif?.user?`${notif.user} won't be notified, but they can send another request.`:"This person will be able to send another follow request.",
      confirmLabel:"Decline",
      onConfirm:()=>setNotifications(p=>p.filter(n=>n.id!==id))
    });
  };

  const notBlocked = n => !n.user || !blockedUsers.has(n.user);
  const filtered = (tab==="all" ? notifications
    : tab==="followers" ? notifications.filter(n=>n.type==="follow"||n.type==="follow_req")
    : notifications.filter(n=>n.type==="watchlist")).filter(notBlocked);

  const unread = notifications.filter(n=>!n.read).length;

  const pendingRequests = notifications.filter(n=>n.type==="follow_req"&&notBlocked(n));

  // Pull-to-refresh — re-hydrates timestamps so "5m ago" updates if the user has been away.
  // No backend yet; this just animates the indicator and refreshes the relative-time labels.
  const handleRefresh = async () => {
    setNotifications(p=>p.map(n=>({...n,ts:n.ts||parseRelativeToTs(n.time)})));
    await new Promise(r=>setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  return (
    <ScreenWithNav active="notifications" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{padding:"8px 22px 6px",display:"flex",alignItems:"center",gap:10}}>
        <TapTarget onClick={()=>onNav("home")} label="Go back to home" minTap={false}
          style={{fontSize:11,color:W.dim,fontFamily:"monospace",flexShrink:0,padding:"8px 4px",minHeight:36,display:"flex",alignItems:"center"}}>
          ← Back
        </TapTarget>
        <h1 style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",margin:0}}>🔔 NOTIFICATIONS</h1>
      </div>

      {/* Follow requests banner — shown at top when private account has pending requests */}
      {isPrivate&&pendingRequests.length>0&&<div style={{margin:"0 22px 8px",background:W.purpleDim,border:`1px solid ${W.purple}44`,borderRadius:12,padding:"10px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span aria-hidden="true" style={{fontSize:14}}>⏳</span>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:700,color:W.purple,fontFamily:"monospace"}}>Follow Requests</div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:1}}>{pendingRequests.length} people waiting for approval</div>
          </div>
        </div>
        {pendingRequests.map(n=>(
          <div key={n.id} style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,borderTop:`1px solid ${W.purple}22`}}>
            <div aria-hidden="true" style={{width:28,height:28,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{n.avatar}</div>
            <span style={{flex:1,fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{n.user}</span>
            <TapTarget onClick={()=>approveRequest(n.id)} label={`Approve follow request from ${n.user}`} minTap={false}
              style={{padding:"8px 12px",borderRadius:8,background:W.accent,fontSize:9,fontWeight:700,color:"#fff",fontFamily:"monospace",minWidth:40,minHeight:36,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span aria-hidden="true">✓</span>
            </TapTarget>
            <TapTarget onClick={()=>declineRequest(n.id)} label={`Decline follow request from ${n.user}`} minTap={false}
              style={{padding:"8px 12px",borderRadius:8,background:W.card,border:`1px solid ${W.border}`,fontSize:9,fontWeight:700,color:W.dim,fontFamily:"monospace",minWidth:40,minHeight:36,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span aria-hidden="true">✕</span>
            </TapTarget>
          </div>
        ))}
      </div>}

      {/* Tabs */}
      <div role="tablist" aria-label="Notification categories" style={{display:"flex",borderBottom:`1px solid ${W.border}`,margin:"0 22px"}}>
        {[{key:"all",label:"All"},{key:"followers",label:"Followers"},{key:"watchlist",label:"Watchlist"}].map(t=>{
          const isActive = tab===t.key;
          const unreadCountForTab =
            t.key==="all" ? unread :
            t.key==="followers" ? notifications.filter(n=>!n.read&&(n.type==="follow"||n.type==="follow_req")).length :
            notifications.filter(n=>!n.read&&n.type==="watchlist").length;
          const tabLabel = unreadCountForTab>0 ? `${t.label}, ${unreadCountForTab} unread` : t.label;
          return (
            <TapTarget key={t.key} role="tab" aria-selected={isActive} onClick={()=>setTab(t.key)} label={tabLabel} minTap={false}
              style={{flex:1,textAlign:"center",padding:"9px 0",fontSize:9,fontFamily:"monospace",fontWeight:600,color:isActive?W.accent:W.dim,borderBottom:`2px solid ${isActive?W.accent:"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center",minHeight:36}}>
              {t.label}
              {t.key==="all"&&unread>0&&<span aria-hidden="true" style={{marginLeft:4,background:W.accent,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:7,fontWeight:900}}>{unread}</span>}
              {t.key==="followers"&&unreadCountForTab>0&&<span aria-hidden="true" style={{marginLeft:4,background:W.accent,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:7,fontWeight:900}}>{unreadCountForTab}</span>}
              {t.key==="watchlist"&&unreadCountForTab>0&&<span aria-hidden="true" style={{marginLeft:4,background:W.blue,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:7,fontWeight:900}}>{unreadCountForTab}</span>}
            </TapTarget>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={`${tab} notifications`} style={{padding:"6px 22px 16px",display:"flex",flexDirection:"column",gap:6}}>
        {/* Pending requests shown at top of Followers tab when private */}
        {tab==="followers"&&pendingRequests.length>0&&<div style={{background:W.purpleDim,border:`1px solid ${W.purple}44`,borderRadius:12,padding:"10px 14px",marginBottom:4}}>
          <div style={{fontSize:10,fontWeight:700,color:W.purple,fontFamily:"monospace",marginBottom:8}}>⏳ PENDING REQUESTS · {pendingRequests.length}</div>
          {pendingRequests.map(n=>(
            <div key={n.id} style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,borderTop:`1px solid ${W.purple}22`}}>
              <div aria-hidden="true" style={{width:28,height:28,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{n.avatar}</div>
              <span style={{flex:1,fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{n.user}</span>
              <TapTarget onClick={()=>approveRequest(n.id)} label={`Approve follow request from ${n.user}`} minTap={false}
                style={{width:40,height:40,borderRadius:"50%",background:W.greenDim,border:`1px solid ${W.green}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                <span aria-hidden="true">✓</span>
              </TapTarget>
              <TapTarget onClick={()=>declineRequest(n.id)} label={`Decline follow request from ${n.user}`} minTap={false}
                style={{width:40,height:40,borderRadius:"50%",background:W.accentDim,border:`1px solid ${W.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
          ))}
        </div>}
        {filtered.length===0&&!(tab==="followers"&&pendingRequests.length>0)&&<div role="status" style={{textAlign:"center",padding:"32px 0"}}><div aria-hidden="true" style={{fontSize:28,marginBottom:8}}>🔔</div><div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>All caught up</div><div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6}}>No notifications in this category</div></div>}

        {filtered.map(n=>{
          const notifText = `${n.user||n.movie||""} ${n.text}${n.read?"":", unread"}`.trim();
          return (
            <TapTarget key={n.id} onClick={()=>{markRead(n.id);if(n.type==="follow_req")setTab("followers");}} label={notifText} minTap={false}
              style={{background:n.read?W.card:`${W.accent}08`,border:`1px solid ${n.read?W.border:W.accent+"33"}`,borderRadius:12,padding:12,display:"block",textAlign:"left"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                {/* Avatar or icon */}
                {n.avatar?(
                  <TapTarget onClick={e=>{if(n.user){e.stopPropagation();haptic("light");onSelectUser&&onSelectUser(n.user);}}} label={n.user?`View ${n.user}'s profile`:undefined} minTap={false}
                    style={{width:36,height:36,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0,position:"relative"}}>
                    <span aria-hidden="true">{n.avatar}</span>
                    <div aria-hidden="true" style={{position:"absolute",bottom:-2,right:-2,fontSize:12,lineHeight:1}}>
                      {n.type==="follow"?"👤":n.type==="follow_req"?"⏳":""}
                    </div>
                  </TapTarget>
                ):(
                  <div aria-hidden="true" style={{width:36,height:36,borderRadius:10,background:W.blueDim,border:`1px solid ${W.blue}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{n.icon}</div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:W.text,fontFamily:"monospace",lineHeight:1.5}}>
                    {n.user&&<span onClick={e=>{e.stopPropagation();haptic("light");onSelectUser&&onSelectUser(n.user);}} style={{fontWeight:700,color:W.accent,cursor:onSelectUser?"pointer":"default"}}>{n.user} </span>}
                    {n.movie&&<span style={{fontWeight:700,color:W.gold}}>{n.movie} </span>}
                    <span style={{color:W.dim}}>{n.text}</span>
                  </div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:3}}>{n.ts?formatRelativeTime(n.ts):n.time}</div>
                  {/* Follow request approve/decline buttons — only while still pending */}
                  {n.type==="follow_req"&&isPrivate&&<div style={{display:"flex",gap:6,marginTop:8}}>
                    <TapTarget onClick={e=>{e.stopPropagation();approveRequest(n.id);}} label={`Approve ${n.user}`} minTap={false}
                      style={{flex:1,background:W.accent,borderRadius:8,padding:"9px 0",textAlign:"center",fontSize:10,fontWeight:700,color:"#fff",fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:36}}>
                      <span aria-hidden="true">✓ </span>Approve
                    </TapTarget>
                    <TapTarget onClick={e=>{e.stopPropagation();declineRequest(n.id);}} label={`Decline ${n.user}`} minTap={false}
                      style={{flex:1,background:W.card,border:`1px solid ${W.border}`,borderRadius:8,padding:"9px 0",textAlign:"center",fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:36}}>
                      <span aria-hidden="true">✕ </span>Decline
                    </TapTarget>
                  </div>}
                  {/* Follow Back / Following — single unified button.
                      Follow path is rate-limited (matches Everyone tab + Search).
                      Unfollow path is not rate-limited (intentional: undo should be instant). */}
                  {n.type==="follow"&&n.user&&(()=>{
                    const following = followingHandles.has(n.user);
                    const onClick = (e) => {
                      e.stopPropagation();
                      if (following) {
                        toggleFollowHandle && toggleFollowHandle(n.user);
                      } else if (rateLimitedFollow) {
                        rateLimitedFollow(()=>toggleFollowHandle && toggleFollowHandle(n.user));
                      } else {
                        toggleFollowHandle && toggleFollowHandle(n.user);
                      }
                    };
                    return (
                      <TapTarget onClick={onClick}
                        label={following?`Unfollow ${n.user}`:`Follow ${n.user} back`}
                        minTap={false}
                        style={{marginTop:6,background:following?W.accentDim:W.accent,border:following?`1px solid ${W.accent}`:"none",borderRadius:6,padding:following?"5px 10px":"6px 10px",fontSize:9,fontWeight:700,color:following?W.accent:"#fff",fontFamily:"monospace",display:"inline-flex",alignItems:"center",minHeight:28,width:"auto"}}>
                        {following?"✓ Following":"+ Follow Back"}
                      </TapTarget>
                    );
                  })()}
                </div>
                {!n.read&&<div aria-label="Unread" role="img" style={{width:8,height:8,borderRadius:"50%",background:W.accent,flexShrink:0,marginTop:4}}/>}
              </div>
            </TapTarget>
          );
        })}
      </div>
      <ConfirmDialog/>
    </ScreenWithNav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SETTINGS (used inside Settings → Notifications)
// ─────────────────────────────────────────────────────────────────────────────

const Toggle = ({ on, onToggle }) => (
  <div onClick={onToggle} style={{width:44,height:26,borderRadius:13,background:on?W.accent:W.border,position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}>
    <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?21:3,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
  </div>
);

const NotificationSettings = () => {
  const [push,setPush]=useState({
    new_follower:true, follow_req:true, watchlist_release:true,
    friend_ranked:true, friend_review:false, streak_reminder:true,
  });
  const [email,setEmail]=useState({
    weekly_digest:true, new_follower:false, watchlist_release:true, marketing:false,
  });
  const [activity,setActivity]=useState({
    likes:true, replies:true, rankings_milestone:true, streak_at_risk:true,
  });

  const Row = ({label, sub, on, onToggle}) => (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderBottom:`1px solid ${W.border}`}}>
      <div style={{flex:1}}>
        <div style={{fontSize:11,fontWeight:600,color:W.text,fontFamily:"monospace"}}>{label}</div>
        {sub&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{sub}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle}/>
    </div>
  );

  const Section = ({title, children}) => (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:9,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:6,paddingLeft:2}}>{title}</div>
      <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,overflow:"hidden"}}>
        {children}
      </div>
    </div>
  );

  return (
    <div>
      <Section title="PUSH NOTIFICATIONS">
        <Row label="New follower"          sub="When someone follows you"                   on={push.new_follower}      onToggle={()=>setPush(p=>({...p,new_follower:!p.new_follower}))}/>
        <Row label="Follow requests"       sub="When someone requests to follow you"        on={push.follow_req}        onToggle={()=>setPush(p=>({...p,follow_req:!p.follow_req}))}/>
        <Row label="Watchlist releases"    sub="When a saved upcoming movie is out"         on={push.watchlist_release} onToggle={()=>setPush(p=>({...p,watchlist_release:!p.watchlist_release}))}/>
        <Row label="Friend ranked a movie" sub="Activity from people you follow"            on={push.friend_ranked}     onToggle={()=>setPush(p=>({...p,friend_ranked:!p.friend_ranked}))}/>
        <Row label="Friend wrote a review" sub="When someone you follow posts a review"     on={push.friend_review}     onToggle={()=>setPush(p=>({...p,friend_review:!p.friend_review}))}/>
        <Row label="Streak reminder"       sub="Reminder to rank before your streak breaks" on={push.streak_reminder}   onToggle={()=>setPush(p=>({...p,streak_reminder:!p.streak_reminder}))}/>
      </Section>

      <Section title="EMAIL ALERTS">
        <Row label="Weekly digest"     sub="Your ranking activity summary every Monday" on={email.weekly_digest}      onToggle={()=>setEmail(p=>({...p,weekly_digest:!p.weekly_digest}))}/>
        <Row label="New follower"      sub="Email when someone follows you"             on={email.new_follower}       onToggle={()=>setEmail(p=>({...p,new_follower:!p.new_follower}))}/>
        <Row label="Watchlist release" sub="Email when a watchlist movie drops"         on={email.watchlist_release}  onToggle={()=>setEmail(p=>({...p,watchlist_release:!p.watchlist_release}))}/>
        <Row label="Product updates"   sub="News and feature announcements from Rated"  on={email.marketing}          onToggle={()=>setEmail(p=>({...p,marketing:!p.marketing}))}/>
      </Section>

      <Section title="ACTIVITY ALERTS">
        <Row label="Likes"               sub="When someone likes your review or ranking" on={activity.likes}               onToggle={()=>setActivity(p=>({...p,likes:!p.likes}))}/>
        <Row label="Replies"             sub="When someone replies to your activity"     on={activity.replies}             onToggle={()=>setActivity(p=>({...p,replies:!p.replies}))}/>
        <Row label="Ranking milestones"  sub="When you hit 10, 50, 100 films ranked"    on={activity.rankings_milestone}  onToggle={()=>setActivity(p=>({...p,rankings_milestone:!p.rankings_milestone}))}/>
        <Row label="Streak at risk"      sub="Alert 1 day before your streak resets"    on={activity.streak_at_risk}      onToggle={()=>setActivity(p=>({...p,streak_at_risk:!p.streak_at_risk}))}/>
      </Section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const SettingsScreen = ({ onBack, username, displayName, userBio, profilePic, isPrivate, onUpdateUsername, onUpdatePrivacy, onUpdateDisplayName, onUpdateBio, onUpdateProfilePic, initialSection=null, blockedUsers=new Set(), onUnblock, onDeleteAccount, themeMode="dark", fontScale=1.0, onSetThemeMode, onSetFontScale, lastUsernameChangeTs=null, onUsernameChanged, showToast }) => {
  const [section,setSection]=useState(initialSection);
  const [newUsername,setNewUsername]=useState(username);
  const [newDisplayName,setNewDisplayName]=useState(displayName||"");
  const [newBio,setNewBio]=useState(userBio||"");
  const [savedProfile,setSavedProfile]=useState(false);
  const [usernameStatus,setUsernameStatus]=useState(null);
  const [savingUsername,setSavingUsername]=useState(false);
  const [savedUsername,setSavedUsername]=useState(false);
  const [showBlockedModal,setShowBlockedModal]=useState(false);
  const [showDeleteModal,setShowDeleteModal]=useState(false);
  const [deleteStep,setDeleteStep]=useState(1); // 1=warning, 2=confirm text, 3=deleting
  const [deleteConfirmText,setDeleteConfirmText]=useState("");
  const timerRef=useRef(null);
  // Cancel any pending username-availability check on unmount
  useEffect(()=>()=>{if(timerRef.current)clearTimeout(timerRef.current);},[]);

  // Invite helpers — shared with Search → Find Friends modal
  const { inviteUrl, shareInvite, emailInvite, smsInvite } = useShareInvite(username, showToast);
  // Phone Contacts stub — real impl requires native app (React Native + hash-based matching).
  // TODO: in React Native, use expo-contacts / react-native-contacts. Hash each email/phone
  //       (SHA-256 with a per-user salt), POST hashes to backend /users/me/find_friends.
  const handleSyncContactsSettings = () => {
    haptic("light");
    showToast && showToast("Contact sync is available in the RATED mobile app", "ok");
  };

  // Profile pic flow:
  // 1. User picks file → set pendingCropSrc to the raw dataURL
  // 2. CropperModal renders → user crops, taps "Use Photo"
  // 3. Cropped dataURL → onUpdateProfilePic, modal closes
  const [pendingCropSrc, setPendingCropSrc] = useState(null);
  const handleProfilePicChange=(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>setPendingCropSrc(ev.target.result);
    reader.readAsDataURL(file);
    // Reset the input so picking the same file again still triggers onChange
    e.target.value = "";
  };

  const [profileError,setProfileError]=useState(null);

  const saveProfile=()=>{
    const dnProfanity = checkProfanity(newDisplayName);
    if (dnProfanity) {
      setProfileError("Display name contains inappropriate language. Please revise it.");
      return;
    }
    const bioProfanity = checkProfanity(newBio);
    if (bioProfanity) {
      setProfileError("Bio contains inappropriate language. Please revise it.");
      return;
    }
    setProfileError(null);
    onUpdateDisplayName(newDisplayName.trim());
    onUpdateBio(newBio.trim());
    setSavedProfile(true);
    setTimeout(()=>setSavedProfile(false),2000);
  };

  const checkNew=(val)=>{
    const raw=val.toLowerCase().replace(/[^a-z0-9_]/g,"");
    setNewUsername(raw);setSavedUsername(false);
    clearTimeout(timerRef.current);
    if(raw===username){setUsernameStatus("same");return;}
    if(raw.length<4){setUsernameStatus("invalid");return;}
    if(checkProfanity(raw)){setUsernameStatus("profane");return;}
    setUsernameStatus("checking");
    timerRef.current=setTimeout(async()=>{
      const res=await API.checkUsername(raw);
      setUsernameStatus((res?res.available:!TAKEN_USERNAMES.has(raw))?"available":"taken");
    },500);
  };

  // Username change rate limit: once per 30 days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const daysUntilNextChange = lastUsernameChangeTs
    ? Math.max(0, Math.ceil((lastUsernameChangeTs + THIRTY_DAYS_MS - Date.now()) / (24*60*60*1000)))
    : 0;
  const usernameLocked = daysUntilNextChange > 0;

  const saveUsername=async()=>{
    if(usernameStatus!=="available")return;
    if(usernameLocked)return;
    setSavingUsername(true);
    TAKEN_USERNAMES.add(newUsername);
    await new Promise(r=>setTimeout(r,600));
    onUpdateUsername(newUsername);
    onUsernameChanged&&onUsernameChanged();
    setSavingUsername(false);setSavedUsername(true);setUsernameStatus("same");
  };

  const SECTIONS=[
    {key:"account", icon:"👤",label:"Account",    sub:"Username, connected accounts"},
    {key:"privacy", icon:"🔒",label:"Privacy",    sub:"Account visibility, follow requests"},
    {key:"find_friends",icon:"👥",label:"Find Friends",sub:"Sync contacts, invite friends"},
    {key:"notifications",icon:"🔔",label:"Notifications",sub:"Push, email, activity alerts"},
    {key:"appearance",icon:"🎨",label:"Appearance",sub:"Theme, text size"},
    {key:"about",        icon:"ℹ️", label:"About",        sub:"Version 1.0.0 · Terms · Privacy"},
  ];

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{padding:"10px 22px 8px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${W.border}`,flexShrink:0}}>
        <div onClick={section?()=>setSection(null):onBack} style={{fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer",flexShrink:0,minWidth:40}}>← {section?"Settings":"Back"}</div>
        <div style={{flex:1,textAlign:"center",fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>{section?SECTIONS.find(s=>s.key===section)?.label:"SETTINGS"}</div>
        <div style={{minWidth:40}}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 22px 24px",display:"flex",flexDirection:"column",gap:section?10:6}}>

        {!section&&<>
          {SECTIONS.map(s=>(
            <div key={s.key} onClick={()=>setSection(s.key)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:W.card,borderRadius:12,border:`1px solid ${W.border}`,cursor:"pointer"}}>
              <span style={{fontSize:20,flexShrink:0}}>{s.icon}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{s.label}</div>
                  {s.key==="privacy"&&isPrivate&&<Badge color="purple">PRIVATE</Badge>}
                </div>
                <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{s.sub}</div>
              </div>
              <span style={{color:W.dim,fontSize:16}}>›</span>
            </div>
          ))}
          <div style={{marginTop:8,padding:"12px 14px",background:W.accentDim,border:`1px solid ${W.accent}33`,borderRadius:12,cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>Sign Out</div>
          </div>
          <div style={{textAlign:"center",marginTop:4,fontSize:9,color:W.dim,fontFamily:"monospace"}}>RATED v1.0.0</div>
        </>}

        {section==="account"&&<>
          {/* Unified Account card — profile pic, name, bio, username — all on one screen */}
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,overflow:"hidden"}}>

            {/* Header: save button */}
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${W.border}`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>EDIT PROFILE</div>
              <div onClick={saveProfile} style={{background:W.accent,color:"#fff",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:700,fontFamily:"monospace",cursor:"pointer"}}>
                {savedProfile?"✓ SAVED":"SAVE"}
              </div>
            </div>

            {profileError&&<div style={{margin:"8px 14px 0",padding:"6px 10px",borderRadius:8,background:W.accentDim,border:`1px solid ${W.accent}`,fontSize:9,color:W.accent,fontFamily:"monospace",lineHeight:1.4}}>✗ {profileError}</div>}

            {/* Profile pic + name row */}
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${W.border}`,display:"flex",alignItems:"center",gap:10}}>
              <label style={{cursor:"pointer",position:"relative",flexShrink:0}}>
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleProfilePicChange}/>
                <div style={{width:46,height:46,borderRadius:"50%",background:W.bg,border:`2px solid ${W.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,overflow:"hidden",position:"relative"}}>
                  {profilePic?<img src={profilePic} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"👤"}
                  <div style={{position:"absolute",bottom:-2,right:-2,width:18,height:18,borderRadius:"50%",background:W.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",border:`2px solid ${W.card}`}}>✎</div>
                </div>
              </label>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:9,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>DISPLAY NAME</div>
                  <div style={{fontSize:8,color:newDisplayName.length>=27?W.accent:W.dim,fontFamily:"monospace"}}>{newDisplayName.length}/30</div>
                </div>
                <input value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} maxLength={30}
                  placeholder="Your full name" enterKeyHint="done"
                  onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); e.target.blur(); } }}
                  style={{width:"100%",background:W.bg,border:`1px solid ${W.border}`,borderRadius:8,padding:"6px 10px",fontSize:12,color:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>

            {/* Bio */}
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${W.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:9,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>BIO</div>
                <div style={{fontSize:8,color:newBio.length>=130?W.accent:W.dim,fontFamily:"monospace"}}>{newBio.length}/130</div>
              </div>
              <textarea value={newBio} onChange={e=>setNewBio(e.target.value)} maxLength={130}
                placeholder="Tell people about your taste in film..."
                style={{width:"100%",background:W.bg,border:`1px solid ${W.border}`,borderRadius:8,padding:"6px 10px",fontSize:11,color:W.text,fontFamily:"monospace",outline:"none",resize:"none",minHeight:54,lineHeight:1.5,boxSizing:"border-box"}}/>
            </div>

            {/* Username — inline, smaller */}
            <div style={{padding:"10px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:9,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>CHANGE USERNAME</div>
                <div style={{fontSize:8,color:usernameLocked?W.orange:usernameStatus==="available"?W.green:(usernameStatus==="taken"||usernameStatus==="invalid"||usernameStatus==="profane")?W.accent:W.dim,fontFamily:"monospace"}}>
                  {usernameLocked&&`🔒 ${daysUntilNextChange}d left`}
                  {!usernameLocked&&usernameStatus==="available"&&"available ✓"}
                  {!usernameLocked&&usernameStatus==="taken"&&"taken"}
                  {!usernameLocked&&usernameStatus==="invalid"&&"too short"}
                  {!usernameLocked&&usernameStatus==="profane"&&"blocked"}
                  {!usernameLocked&&(!usernameStatus||usernameStatus==="same")&&(savedUsername?"updated ✓":"")}
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <div style={{position:"relative",flex:1}}>
                  <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:W.dim,fontFamily:"monospace",pointerEvents:"none"}}>@</div>
                  <input value={newUsername} onChange={e=>checkNew(e.target.value)} maxLength={20} disabled={usernameLocked}
                    enterKeyHint="go"
                    onKeyDown={e=>{ if(e.key==="Enter" && usernameStatus==="available" && !usernameLocked){ e.preventDefault(); saveUsername(); } }}
                    style={{width:"100%",background:W.bg,border:`1px solid ${usernameLocked?W.border:usernameStatus==="available"?W.green:(usernameStatus==="taken"||usernameStatus==="invalid"||usernameStatus==="profane")?W.accent:W.border}`,borderRadius:8,padding:"6px 10px 6px 22px",fontSize:12,color:usernameLocked?W.dim:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box",opacity:usernameLocked?0.6:1,cursor:usernameLocked?"not-allowed":"text"}}/>
                </div>
                <div onClick={saveUsername} style={{background:(usernameStatus==="available"&&!usernameLocked)?W.accent:W.card,color:(usernameStatus==="available"&&!usernameLocked)?"#fff":W.dim,border:`1px solid ${(usernameStatus==="available"&&!usernameLocked)?W.accent:W.border}`,borderRadius:8,padding:"6px 12px",fontSize:10,fontWeight:700,fontFamily:"monospace",cursor:(usernameStatus==="available"&&!usernameLocked)?"pointer":"default",opacity:(usernameStatus==="available"&&!usernameLocked)?1:0.5,whiteSpace:"nowrap"}}>
                  {savingUsername?"...":"SAVE"}
                </div>
              </div>
              {/* Always-visible 30-day rate-limit notice. Second sentence only appears
                  when the user is currently locked out, so the copy stays accurate. */}
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:6,lineHeight:1.5,padding:"8px 10px",background:usernameLocked?W.orangeDim:W.bg,border:`1px solid ${usernameLocked?W.orange+"33":W.border}`,borderRadius:8}}>
                🔒 Username can be changed once every 30 days.{usernameLocked?` You can change it again in ${daysUntilNextChange} ${daysUntilNextChange===1?"day":"days"}.`:""}
              </div>
            </div>

          </div>

          {/* Connected account — collapsed, read-only */}
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"8px 14px",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:W.bg,border:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:"monospace",color:W.text}}>G</div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace"}}>user@gmail.com</div>
              <div style={{fontSize:8,color:W.dim,fontFamily:"monospace"}}>Connected via Google</div>
            </div>
            <span style={{fontSize:8,color:W.green,fontFamily:"monospace",fontWeight:700}}>✓</span>
          </div>

          {/* Danger zone */}
          <div onClick={()=>{setShowDeleteModal(true);setDeleteStep(1);setDeleteConfirmText("");}} style={{marginTop:8,background:W.card,border:`1px solid ${W.accent}44`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <span style={{fontSize:16}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>Delete Account</div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>Permanently erase your account and all data</div>
            </div>
            <span style={{color:W.accent,fontSize:14}}>›</span>
          </div>
        </>}

        {/* Delete account confirmation modal */}
        {showDeleteModal&&<div onClick={()=>deleteStep!==3&&setShowDeleteModal(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.88)",zIndex:70,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 22px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:W.card,border:`1px solid ${W.accent}44`,borderRadius:18,padding:"20px 18px",width:"100%"}}>

            {deleteStep===1&&<>
              <div style={{textAlign:"center",marginBottom:12}}>
                <div style={{fontSize:32,marginBottom:6}}>⚠️</div>
                <div style={{fontSize:14,fontWeight:900,color:W.accent,fontFamily:"monospace"}}>Delete Account?</div>
              </div>
              <div style={{background:W.bg,borderRadius:10,padding:"12px",marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace",marginBottom:8}}>This will permanently:</div>
                {[
                  "Erase all your rankings and reviews",
                  "Remove your profile and username",
                  "Delete your watchlist and saved films",
                  "Remove you from your followers' feeds",
                  "Cancel any active subscriptions",
                ].map(t=>(
                  <div key={t} style={{display:"flex",gap:6,alignItems:"flex-start",marginTop:4}}>
                    <span style={{color:W.accent,fontSize:10,fontFamily:"monospace",flexShrink:0}}>✗</span>
                    <span style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:14,textAlign:"center"}}>
                This cannot be undone. Your username will become available for someone else after 30 days.
              </div>
              <div style={{display:"flex",gap:8}}>
                <div onClick={()=>setShowDeleteModal(false)} style={{flex:1,padding:"11px",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",cursor:"pointer"}}>Keep Account</div>
                <div onClick={()=>setDeleteStep(2)} style={{flex:1,padding:"11px",borderRadius:10,background:W.accent,textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",cursor:"pointer"}}>Continue</div>
              </div>
            </>}

            {deleteStep===2&&<>
              <div style={{textAlign:"center",marginBottom:12}}>
                <div style={{fontSize:24,marginBottom:6}}>🔒</div>
                <div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace"}}>Final Confirmation</div>
              </div>
              <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:12,textAlign:"center"}}>
                To confirm, type <span style={{color:W.accent,fontWeight:700}}>DELETE</span> below. This cannot be undone.
              </div>
              <input value={deleteConfirmText} onChange={e=>setDeleteConfirmText(e.target.value)} placeholder="Type DELETE to confirm"
                style={{width:"100%",background:W.bg,border:`1.5px solid ${deleteConfirmText==="DELETE"?W.accent:W.border}`,borderRadius:10,padding:"10px 12px",fontSize:12,color:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box",marginBottom:14,textAlign:"center",letterSpacing:1}}/>
              <div style={{display:"flex",gap:8}}>
                <div onClick={()=>{setShowDeleteModal(false);setDeleteStep(1);setDeleteConfirmText("");}} style={{flex:1,padding:"11px",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",cursor:"pointer"}}>Cancel</div>
                <div onClick={()=>{
                    if(deleteConfirmText==="DELETE"){
                      setDeleteStep(3);
                      setTimeout(()=>{onDeleteAccount&&onDeleteAccount();},1800);
                    }
                  }} style={{flex:1,padding:"11px",borderRadius:10,background:deleteConfirmText==="DELETE"?W.accent:W.card,textAlign:"center",fontSize:11,fontWeight:700,color:deleteConfirmText==="DELETE"?"#fff":W.dim,fontFamily:"monospace",cursor:deleteConfirmText==="DELETE"?"pointer":"default",opacity:deleteConfirmText==="DELETE"?1:0.5}}>Delete Forever</div>
              </div>
            </>}

            {deleteStep===3&&<div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:28,marginBottom:10}}>👋</div>
              <div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginBottom:6}}>Account Deleted</div>
              <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>Your data is being erased. Signing you out...</div>
            </div>}

          </div>
        </div>}

        {section==="privacy"&&<>
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"14px",borderBottom:`1px solid ${W.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Private Account</span>
                    {isPrivate&&<Badge color="purple">ON</Badge>}
                  </div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>Only approved followers can see your rankings, reviews, and activity.</div>
                </div>
                <div onClick={()=>onUpdatePrivacy(!isPrivate)} style={{width:44,height:26,borderRadius:13,background:isPrivate?W.accent:W.border,position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:isPrivate?21:3,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
                </div>
              </div>
              {isPrivate&&<div style={{marginTop:12,padding:"10px 12px",background:W.purpleDim,border:`1px solid ${W.purple}33`,borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:700,color:W.purple,fontFamily:"monospace",marginBottom:4}}>🔒 Private Mode Active</div>
                <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>New followers need your approval before they can see your content. Existing approved followers are unaffected.</div>
              </div>}
            </div>
          </div>
          <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.7,padding:"0 4px"}}>Switching to private won't remove existing followers. To remove a follower, go to your Followers list.</div>

          {/* Blocked users — tappable row opens modal */}
          <div onClick={()=>setShowBlockedModal(true)} style={{marginTop:14,background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:"14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>🚫</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Blocked Users</div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{blockedUsers.size===0?"You haven't blocked anyone":`${blockedUsers.size} blocked`}</div>
            </div>
            <span style={{color:W.dim,fontSize:16}}>›</span>
          </div>
        </>}

        {/* Blocked users popup modal */}
        {showBlockedModal&&<div onClick={()=>setShowBlockedModal(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",zIndex:60,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"18px 20px 24px",maxHeight:"75%",overflowY:"auto",borderTop:`1px solid ${W.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>🚫</span>
                <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>Blocked Users</div>
                <span style={{fontSize:10,color:W.dim,fontFamily:"monospace",fontWeight:700}}>{blockedUsers.size}</span>
              </div>
              <div onClick={()=>setShowBlockedModal(false)} style={{fontSize:16,color:W.dim,cursor:"pointer"}}>✕</div>
            </div>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:14}}>
              People you've blocked can't see your profile, posts, or reviews. They also can't follow you or send you notifications.
            </div>
            {blockedUsers.size===0?(
              <div style={{textAlign:"center",padding:"28px 0"}}>
                <div style={{fontSize:28,marginBottom:10}}>🌿</div>
                <div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",marginBottom:4}}>Nobody blocked</div>
                <div style={{fontSize:10,color:W.dim,fontFamily:"monospace"}}>You haven't blocked anyone yet.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {Array.from(blockedUsers).map(handle=>{
                  const prof = USER_PROFILES[handle];
                  const avatar = prof?.avatar || handle[1]?.toUpperCase() || "?";
                  return (
                    <div key={handle} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{avatar}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{handle}</div>
                        {prof?.bio&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{prof.bio}</div>}
                      </div>
                      <div onClick={()=>onUnblock&&onUnblock(handle)} style={{padding:"5px 12px",borderRadius:8,background:W.card,border:`1px solid ${W.border}`,cursor:"pointer",fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",flexShrink:0}}>Unblock</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div onClick={()=>setShowBlockedModal(false)} style={{marginTop:14,padding:"11px",textAlign:"center",fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>Close</div>
          </div>
        </div>}

        {section==="find_friends"&&(
          <>
            <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:"14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span aria-hidden="true" style={{fontSize:18}}>👥</span>
                <div style={{fontSize:12,fontWeight:800,color:W.text,fontFamily:"monospace"}}>Find People You Know</div>
              </div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>See which of your friends are already on RATED, or invite them to join. We never post on your behalf.</div>
            </div>

            <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,overflow:"hidden"}}>
              <TapTarget onClick={handleSyncContactsSettings} label="Sync phone contacts to find friends" minTap={false}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",minHeight:60}}>
                <div aria-hidden="true" style={{width:36,height:36,borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📇</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Phone Contacts</div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:1}}>Match emails and phone numbers privately</div>
                </div>
                <div aria-hidden="true" style={{padding:"7px 12px",borderRadius:8,background:W.accent,color:"#fff",fontSize:10,fontWeight:700,fontFamily:"monospace",flexShrink:0}}>Sync</div>
              </TapTarget>
            </div>

            <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:"14px"}}>
              <div style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:10}}>INVITE FRIENDS</div>
              <div style={{display:"flex",gap:8}}>
                <TapTarget onClick={shareInvite} label="Share invite link" minTap={false}
                  style={{flex:1,padding:"10px",textAlign:"center",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,fontSize:10,fontWeight:700,color:W.accent,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
                  <span aria-hidden="true">🔗 </span>Share link
                </TapTarget>
                <TapTarget onClick={emailInvite} label="Invite via email" minTap={false}
                  style={{flex:1,padding:"10px",textAlign:"center",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,fontSize:10,fontWeight:700,color:W.accent,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
                  <span aria-hidden="true">✉️ </span>Email
                </TapTarget>
                <TapTarget onClick={smsInvite} label="Invite via SMS" minTap={false}
                  style={{flex:1,padding:"10px",textAlign:"center",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,fontSize:10,fontWeight:700,color:W.accent,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
                  <span aria-hidden="true">💬 </span>SMS
                </TapTarget>
              </div>
              <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:10,textAlign:"center",lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis"}}>Invite link: {inviteUrl}</div>
            </div>

            <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",lineHeight:1.7,padding:"0 4px",textAlign:"center"}}>RATED only uses contact info to match you with friends already on the app. Contact data stays private and is hashed before leaving your device. <span style={{color:W.accent}}>Privacy Policy</span></div>
          </>
        )}

        {section==="notifications"&&<NotificationSettings/>}
        {section==="appearance"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:10}}>THEME</div>
            <div style={{display:"flex",gap:6}}>
              {[
                {key:"dark",label:"🌙 Dark"},
                {key:"light",label:"☀️ Light"},
                {key:"system",label:"⚙️ System"},
              ].map(t=>(
                <div key={t.key} onClick={()=>onSetThemeMode&&onSetThemeMode(t.key)} style={{flex:1,padding:"9px 0",borderRadius:8,textAlign:"center",fontSize:10,fontWeight:700,fontFamily:"monospace",cursor:"pointer",background:themeMode===t.key?W.accentDim:W.bg,border:`1px solid ${themeMode===t.key?W.accent:W.border}`,color:themeMode===t.key?W.accent:W.dim}}>{t.label}</div>
              ))}
            </div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:10,lineHeight:1.5}}>System follows your device's iOS setting.</div>
          </div>
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"14px"}}>
            <div style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:10}}>TEXT SIZE</div>
            <div style={{display:"flex",gap:6}}>
              {[
                {key:0.9,label:"A",fsize:11},
                {key:1.0,label:"A",fsize:13},
                {key:1.15,label:"A",fsize:15},
                {key:1.3,label:"A",fsize:17},
              ].map(t=>(
                <div key={t.key} onClick={()=>onSetFontScale&&onSetFontScale(t.key)} style={{flex:1,padding:"9px 0",borderRadius:8,textAlign:"center",fontWeight:700,fontFamily:"monospace",cursor:"pointer",background:fontScale===t.key?W.accentDim:W.bg,border:`1px solid ${fontScale===t.key?W.accent:W.border}`,color:fontScale===t.key?W.accent:W.dim,fontSize:t.fsize}}>{t.label}</div>
              ))}
            </div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:10,lineHeight:1.5}}>Scales all text. Current: {Math.round(fontScale*100)}%</div>
          </div>
        </div>}

        {section==="about"&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[["Version","1.0.0"],["Build","prototype"],["Terms of Service","rated.app/terms"],["Privacy Policy","rated.app/privacy"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:W.card,borderRadius:10,border:`1px solid ${W.border}`}}>
              <span style={{fontSize:11,color:W.dim,fontFamily:"monospace"}}>{k}</span>
              <span style={{fontSize:11,color:W.text,fontFamily:"monospace"}}>{v}</span>
            </div>
          ))}
        </div>}
      </div>
      {/* Profile photo cropper — mounted when user picks a file */}
      {pendingCropSrc&&<CropperModal
        src={pendingCropSrc}
        onSave={(croppedDataUrl)=>{
          onUpdateProfilePic(croppedDataUrl);
          setPendingCropSrc(null);
          showToast&&showToast("Photo updated","ok");
        }}
        onCancel={()=>setPendingCropSrc(null)}
      />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// USER PROFILE SCREEN — shown when tapping a user on leaderboard
// ─────────────────────────────────────────────────────────────────────────────

const USER_PROFILES = {
  "@cinephile99": {username:"cinephile99",avatar:"C",movies_rated:847,streak:34,badge:"💎",bio:"Seen everything twice.",followers:1204,following:88,isPrivate:false},
  "@filmfreak":   {username:"filmfreak",  avatar:"F",movies_rated:612,streak:21,badge:"🏆",bio:"35mm or nothing.",followers:892,following:120,isPrivate:false},
  "@maya":        {username:"maya",       avatar:"M",movies_rated:489,streak:12,badge:"🏆",bio:"Horror nerd. World cinema devotee.",followers:567,following:203,isPrivate:false},
  "@reeltalks":   {username:"reeltalks",  avatar:"R",movies_rated:356,streak:8, badge:"🔥",bio:"Film criticism is my cardio.",followers:341,following:77,isPrivate:false},
  "@jasonk":      {username:"jasonk",     avatar:"J",movies_rated:89, streak:7, badge:"🔥",bio:"Just getting started.",followers:12,following:34,isPrivate:false},
  "@josh":        {username:"josh",       avatar:"J",movies_rated:76, streak:4, badge:"",  bio:"Drama and thrillers mainly.",followers:45,following:60,isPrivate:false},
  "@lina":        {username:"lina",       avatar:"L",movies_rated:63, streak:3, badge:"",  bio:"International cinema fanatic.",followers:88,following:91,isPrivate:true},
  "@carlos":      {username:"carlos",     avatar:"C",movies_rated:41, streak:1, badge:"",  bio:"New here, loving it.",followers:9,following:22,isPrivate:false},
};

const UserProfileScreen = ({ user, onBack, onSelectMovie, blockedUsers=new Set(), blockUser, reportContent, rateLimitedFollow, followingHandles=new Set(), toggleFollowHandle }) => {
  const [followRequested,setFollowRequested]=useState(false);
  const {confirm, ConfirmDialog} = useConfirm();
  const isFollowing = followingHandles.has(user);
  const p = USER_PROFILES[user] || {username:user?.replace("@",""),avatar:user?.[1]?.toUpperCase()||"?",movies_rated:0,streak:0,badge:"",bio:"",followers:0,following:0,isPrivate:false};
  const isPrivate = p.isPrivate === true;
  const canSeeContent = isFollowing;
  const isBlocked = blockedUsers.has(user);

  const handleFollow=()=>{
    if(isFollowing){
      // Unfollow — show confirmation dialog
      confirm({
        icon:"👤",
        title:`Unfollow ${user}?`,
        message:`You'll stop seeing their posts in your Following feed. You can follow again anytime.`,
        confirmLabel:"Unfollow",
        onConfirm:()=>{
          toggleFollowHandle&&toggleFollowHandle(user);
          setFollowRequested(false);
        }
      });
    } else if(isPrivate&&followRequested){
      // Cancel request — not rate limited
      setFollowRequested(false);
    } else if(isPrivate&&!followRequested){
      // Private: send request — counts against limit
      if (rateLimitedFollow) {
        rateLimitedFollow(()=>setFollowRequested(true));
      } else {
        setFollowRequested(true);
      }
    } else {
      // Public: follow immediately — counts against limit
      if (rateLimitedFollow) {
        rateLimitedFollow(()=>toggleFollowHandle&&toggleFollowHandle(user));
      } else {
        toggleFollowHandle&&toggleFollowHandle(user);
      }
    }
  };

  return (
    <div style={{height:"100%",overflowY:"auto"}}>
      <div style={{padding:"10px 22px 6px",display:"flex",alignItems:"center",gap:10}}>
        <div onClick={onBack} style={{fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>← Back</div>
        <div style={{flex:1}}/>
        <ReportBlockMenu
          targetType="user" targetId={user} targetLabel={user}
          targetUser={user}
          onReport={reportContent} onBlock={blockUser} blockedUsers={blockedUsers}
          size="md"
        />
      </div>
      {isBlocked&&<div style={{margin:"0 22px 14px",padding:"12px 14px",background:W.accentDim,border:`1px solid ${W.accent}33`,borderRadius:12,textAlign:"center"}}>
        <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace",marginBottom:4}}>🚫 You blocked this user</div>
        <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>Unblock them in Settings → Privacy to see their content.</div>
      </div>}
      <div style={{padding:"0 22px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:58,height:58,borderRadius:"50%",background:W.card,border:`2px solid ${W.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{p.avatar}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:16,fontWeight:900,color:W.text,fontFamily:"monospace"}}>@{p.username}</span>
              {p.badge&&<span style={{fontSize:16}}>{p.badge}</span>}
              {isPrivate&&<Badge color="purple">🔒 Private</Badge>}
            </div>
            {p.bio&&<div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:3}}>{p.bio}</div>}
            {p.streak>0&&<div style={{display:"flex",gap:4,alignItems:"center",marginTop:4}}><span>🔥</span><span style={{fontSize:10,fontWeight:700,color:W.gold,fontFamily:"monospace"}}>{p.streak}-week streak</span></div>}
          </div>
        </div>
        {/* Stats — hide counts if private and not following */}
        <div style={{display:"flex",gap:0}}>
          {[
            {n:(!isPrivate||canSeeContent)?p.movies_rated:"—",l:"Ranked"},
            {n:p.followers+(isFollowing?1:0),l:"Followers"},
            {n:(!isPrivate||canSeeContent)?p.following:"—",l:"Following"},
          ].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${W.border}`:"none"}}>
              <div style={{fontSize:18,fontWeight:900,color:i===0?W.accent:W.text,fontFamily:"monospace"}}>{s.n}</div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{s.l}</div>
            </div>
          ))}
        </div>
        {/* Follow button */}
        <div onClick={handleFollow} style={{background:isFollowing?W.accentDim:followRequested?W.card:W.accent,border:`1px solid ${isFollowing||followRequested?W.accent:"transparent"}`,color:isFollowing||followRequested?W.accent:"#fff",borderRadius:12,padding:"10px",textAlign:"center",fontSize:12,fontWeight:700,fontFamily:"monospace",cursor:"pointer"}}>
          {isFollowing?"✓ FOLLOWING":followRequested?"⏳ REQUESTED — tap to cancel":"+ FOLLOW"}
        </div>
        {/* Locked content: only show lock wall if private AND not an approved follower */}
        {isPrivate&&!canSeeContent?(
          <div style={{textAlign:"center",padding:"28px 16px",background:W.card,border:`1px solid ${W.border}`,borderRadius:14}}>
            <div style={{fontSize:32,marginBottom:10}}>🔒</div>
            <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",marginBottom:6}}>This account is private</div>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.7}}>
              Follow {`@${p.username}`} to see their rankings, reviews, and activity.
              {followRequested&&<div style={{marginTop:8,color:W.accent,fontWeight:700}}>Follow request sent — waiting for approval</div>}
            </div>
          </div>
        ):(
          <>
            <UserContentTabs user={user} p={p} onSelectMovie={onSelectMovie}/>
          </>
        )}
      </div>
      <ConfirmDialog/>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// USER CONTENT TABS — Rankings / Reviews / Activity on another user's profile
// ─────────────────────────────────────────────────────────────────────────────

const UserContentTabs = ({ user, p, onSelectMovie }) => {
  const [tab,setTab]=useState("rankings");
  // Deterministic selection seeded by handle — same user always shows same content
  const seed = (user||"").split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  // Rankings: rotate MOVIES starting at a user-specific offset, show up to their movies_rated count
  const rotateStart = seed % MOVIES.length;
  const userRankings = [];
  const count = Math.min(p.movies_rated||0, MOVIES.length);
  for (let i=0;i<count;i++) userRankings.push(MOVIES[(rotateStart+i)%MOVIES.length]);
  // Reviews: pick 1-2 deterministic reviews
  const reviewMovies = userRankings.slice(0, Math.min(2, Math.max(1,(seed%3))));
  const reviewTexts = [
    "Absolutely floored. Direction, score, everything clicked.",
    "Overhyped in my opinion but still a solid watch.",
    "Couldn't look away. One of the best I've seen this year.",
    "The third act drags but the payoff makes it worthwhile.",
    "Not sure what all the fuss is about. Rewatched to be sure.",
  ];
  const userRatings = {}; // movie_id -> score
  userRankings.forEach((m,i)=>{userRatings[m.id] = Math.max(5, 10 - Math.floor(i / Math.max(userRankings.length/6,1)));});
  // Activity feed: synthesize from rankings and reviews
  const activity = [];
  if (userRankings[0]) activity.push({id:`ua-1`,type:"ranking",movie:userRankings[0],time:"2d ago"});
  if (reviewMovies[0]) activity.push({id:`ua-2`,type:"review",movie:reviewMovies[0],text:reviewTexts[seed%reviewTexts.length],rating:userRatings[reviewMovies[0].id],time:"4d ago"});
  if (userRankings[1]) activity.push({id:`ua-3`,type:"ranking",movie:userRankings[1],time:"1w ago"});
  if (userRankings[2]) activity.push({id:`ua-4`,type:"save",movie:userRankings[2],time:"2w ago"});

  return (
    <>
      {/* Tab bar */}
      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${W.border}`,marginBottom:6}}>
        {[{key:"rankings",label:`Rankings · ${userRankings.length}`},{key:"reviews",label:`Reviews · ${reviewMovies.length}`},{key:"activity",label:"Activity"}].map(t=>(
          <div key={t.key} onClick={()=>{haptic("light");setTab(t.key);}} style={{flex:1,textAlign:"center",padding:"8px 4px",fontSize:10,fontWeight:700,fontFamily:"monospace",color:tab===t.key?W.accent:W.dim,borderBottom:tab===t.key?`2px solid ${W.accent}`:"2px solid transparent",cursor:"pointer"}}>{t.label}</div>
        ))}
      </div>

      {/* Rankings tab */}
      {tab==="rankings"&&<>
        {userRankings.length===0&&<div style={{textAlign:"center",padding:"28px 0"}}>
          <div style={{fontSize:32,marginBottom:8}}>🎬</div>
          <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>No rankings yet</div>
          <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6}}>@{p.username} hasn't ranked any films</div>
        </div>}
        {userRankings.map((m,i)=>(
          <div key={m.id} onClick={()=>{haptic("light");onSelectMovie(m);}} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:i===0?W.goldDim:W.card,borderRadius:10,border:`1px solid ${i===0?W.gold+"44":W.border}`,cursor:"pointer"}}>
            <span style={{fontSize:i<3?13:11,fontWeight:900,color:W.dim,fontFamily:"monospace",width:18,textAlign:"center",flexShrink:0}}>
              {i<3?["🥇","🥈","🥉"][i]:i+1}
            </span>
            <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:W.text,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year}</div>
            </div>
            <span style={{fontSize:9,color:W.gold,fontFamily:"monospace",fontWeight:700,flexShrink:0}}>{userRatings[m.id]}/10</span>
          </div>
        ))}
      </>}

      {/* Reviews tab */}
      {tab==="reviews"&&<>
        {reviewMovies.length===0&&<div style={{textAlign:"center",padding:"28px 0"}}>
          <div style={{fontSize:32,marginBottom:8}}>✎</div>
          <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>No reviews yet</div>
          <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6}}>@{p.username} hasn't written any reviews</div>
        </div>}
        {reviewMovies.map((m,i)=>(
          <div key={m.id} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:12}}>
            <div onClick={()=>{haptic("light");onSelectMovie(m);}} style={{display:"flex",gap:10,alignItems:"center",marginBottom:8,cursor:"pointer"}}>
              <Poster url={m.poster_url} title={m.title} w={32} h={44} radius={6}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.title}</div>
                <div style={{fontSize:13,fontWeight:900,color:W.gold,fontFamily:"monospace",marginTop:3}}>{userRatings[m.id]}/10</div>
              </div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",flexShrink:0}}>{i===0?"3d ago":"1w ago"}</div>
            </div>
            <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>{reviewTexts[(seed+i)%reviewTexts.length]}</div>
          </div>
        ))}
      </>}

      {/* Activity tab */}
      {tab==="activity"&&<>
        {activity.length===0&&<div style={{textAlign:"center",padding:"28px 0"}}>
          <div style={{fontSize:32,marginBottom:8}}>📭</div>
          <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>No activity</div>
        </div>}
        {activity.map(a=>(
          <div key={a.id} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{p.avatar}</div>
              <div style={{flex:1,fontSize:10,color:W.dim,fontFamily:"monospace"}}>
                <span style={{color:W.accent,fontWeight:700}}>@{p.username}</span>
                {a.type==="ranking"&&" ranked a new film"}
                {a.type==="review"&&" posted a review"}
                {a.type==="save"&&" saved to watchlist"}
              </div>
              <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",flexShrink:0}}>{a.time}</div>
            </div>
            <div onClick={()=>{haptic("light");onSelectMovie(a.movie);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:W.bg,borderRadius:8,cursor:"pointer"}}>
              <Poster url={a.movie.poster_url} title={a.movie.title} w={26} h={36} radius={4}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.movie.title}</div>
                {a.type==="review"&&<div style={{fontSize:9,color:W.gold,fontFamily:"monospace",marginTop:1}}>★ {a.rating}/10</div>}
              </div>
            </div>
            {a.type==="review"&&a.text&&<div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginTop:6,fontStyle:"italic"}}>"{a.text}"</div>}
          </div>
        ))}
      </>}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const LeaderboardScreen = ({ onNav, onSelectMovie, onSelectUser, username="", displayName="", blockedUsers=new Set(), myRankedCount=0, myStreak=0 }) => {
  const [tab,setTab]=useState("global");
  const youLabel = displayName ? displayName : username ? `@${username}` : "@you";
  const youHandle = username ? `@${username}` : "@you";
  const youAvatar = (displayName||username||"Y")[0].toUpperCase();

  // Build leaderboard from USER_PROFILES (single source of truth) + insert current user with real count
  const otherUsers = Object.entries(USER_PROFILES)
    .filter(([handle])=>handle!==youHandle)  // Exclude current user's own profile entry
    .map(([handle,p])=>({user:handle,avatar:p.avatar,movies_rated:p.movies_rated,streak:p.streak,badge:p.badge}));

  // Insert YOU with accurate count from rankedIds
  const allUsers = [...otherUsers, {user:youHandle,avatar:youAvatar,label:youLabel,movies_rated:myRankedCount,streak:myStreak,badge:myRankedCount>=50?"🔥":"",isYou:true}];
  // Sort by movies_rated descending and assign rank
  const GLOBAL = allUsers
    .sort((a,b)=>b.movies_rated-a.movies_rated)
    .map((u,i)=>({...u,rank:i+1}));

  const FM=[
    {rank:1,title:"Interstellar",movie_id:"m-001",avg_rating:9.4,rated_by:["@maya","@josh"],rated_count:3},
    {rank:2,title:"Parasite",movie_id:"m-002",avg_rating:9.1,rated_by:["@maya","@carlos"],rated_count:2},
    {rank:3,title:"The Dark Knight",movie_id:"m-003",avg_rating:8.8,rated_by:["@josh","@lina"],rated_count:3},
    {rank:4,title:"Whiplash",movie_id:"m-004",avg_rating:8.7,rated_by:["@maya"],rated_count:1},
    {rank:5,title:"RRR",movie_id:"m-005",avg_rating:8.4,rated_by:["@carlos","@lina"],rated_count:2},
  ];
  // Top-rated globally — from TMDB. Only loaded when user switches to the tab.
  const [tmdbTopRatedMovies,setTmdbTopRatedMovies]=useState(null);
  const [refreshNonce,setRefreshNonce]=useState(0); // bump to re-fetch
  useEffect(()=>{
    if (tab!=="toprated") return;
    let cancelled = false;
    tmdbTopRated().then(data=>{ if (!cancelled && data) setTmdbTopRatedMovies(data); });
    return ()=>{ cancelled = true; };
  },[tab, refreshNonce]);
  const TOP_RATED = tmdbTopRatedMovies ? tmdbTopRatedMovies.slice(0, 20) : [];
  // Pull-to-refresh — clears the cached top-rated list so the effect re-fetches.
  const handleRefresh = async () => {
    setTmdbTopRatedMovies(null);
    setRefreshNonce(n=>n+1);
    await new Promise(r=>setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);
  return (
    <ScreenWithNav active="leaderboard" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      <div style={{padding:"8px 22px 6px",fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>◆ LEADERBOARD</div>
      <div style={{display:"flex",margin:"0 22px",borderBottom:`1px solid ${W.border}`}}>
        {[
          {key:"global",label:"Most Rated"},
          {key:"friends",label:"Friends' Picks"},
          ...(TMDB_ENABLED ? [{key:"toprated",label:"Top Rated"}] : [])
        ].map(t=>(
          <div key={t.key} onClick={()=>setTab(t.key)} style={{flex:1,textAlign:"center",padding:"8px 0",fontSize:10,fontFamily:"monospace",fontWeight:600,color:tab===t.key?W.accent:W.dim,borderBottom:`2px solid ${tab===t.key?W.accent:"transparent"}`,cursor:"pointer"}}>{t.label}</div>
        ))}
      </div>
      <div style={{padding:"10px 22px 16px",display:"flex",flexDirection:"column",gap:6}}>
        {tab==="global"&&GLOBAL.filter(u=>u.isYou||!blockedUsers.has(u.user)).map(u=>(
          <div key={u.rank} onClick={()=>!u.isYou&&onSelectUser&&onSelectUser(u.user)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:u.isYou?W.accentDim:u.rank<=3?`${W.gold}08`:W.card,borderRadius:10,border:`1px solid ${u.isYou?W.accent+"33":u.rank<=3?W.gold+"22":W.border}`,cursor:u.isYou?"default":"pointer"}}>
            <span style={{width:20,fontSize:u.rank<=3?14:11,fontWeight:900,color:W.dim,fontFamily:"monospace",textAlign:"center"}}>{u.rank<=3?["🥇","🥈","🥉"][u.rank-1]:u.rank}</span>
            <div style={{width:30,height:30,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{u.avatar}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{fontSize:11,fontWeight:700,color:u.isYou?W.accent:W.text,fontFamily:"monospace"}}>{u.isYou?(u.label||u.user):u.user}</span>
                {u.isYou&&<span style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>(you)</span>}
                {u.badge&&<span>{u.badge}</span>}
              </div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{u.streak>0&&`🔥 ${u.streak}w streak`}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace"}}>{u.movies_rated.toLocaleString()}</div>
              <div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>FILMS</div>
            </div>
          </div>
        ))}
        {tab==="friends"&&FM.map(m=>{
          const movie=MOVIES.find(c=>c.id===m.movie_id);
          return (
            <div key={m.rank} onClick={()=>movie&&onSelectMovie(movie)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:m.rank<=3?`${W.accent}08`:W.card,borderRadius:10,border:`1px solid ${m.rank<=3?W.accent+"22":W.border}`,cursor:"pointer"}}>
              <span style={{width:20,fontSize:m.rank<=3?14:11,fontWeight:900,color:W.dim,fontFamily:"monospace",textAlign:"center"}}>{m.rank<=3?["🥇","🥈","🥉"][m.rank-1]:m.rank}</span>
              <Poster url={movie?.poster_url} title={movie?.title} w={32} h={44} radius={6}/>
              <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{m.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>Rated by {m.rated_by.slice(0,2).join(", ")}{m.rated_count>2&&` +${m.rated_count-2} more`}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace"}}>★ {m.avg_rating}</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>AVG</div></div>
            </div>
          );
        })}
        {tab==="toprated"&&TOP_RATED.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:W.dim,fontFamily:"monospace",fontSize:11}}>Loading top rated films...</div>}
        {tab==="toprated"&&TOP_RATED.map((movie,i)=>{
          const rank = i+1;
          return (
            <div key={movie.id} onClick={()=>onSelectMovie(movie)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:rank<=3?`${W.accent}08`:W.card,borderRadius:10,border:`1px solid ${rank<=3?W.accent+"22":W.border}`,cursor:"pointer"}}>
              <span style={{width:20,fontSize:rank<=3?14:11,fontWeight:900,color:W.dim,fontFamily:"monospace",textAlign:"center"}}>{rank<=3?["🥇","🥈","🥉"][rank-1]:rank}</span>
              <Poster url={movie.poster_url} title={movie.title} w={32} h={44} radius={6}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{movie.title}</div>
                <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{movie.release_year}{movie.user_rating_count?` · ${movie.user_rating_count.toLocaleString()} votes`:""}</div>
              </div>
              <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace"}}>★ {movie.avg_user_rating}</div><div style={{fontSize:7,color:W.dim,fontFamily:"monospace"}}>TMDB</div></div>
            </div>
          );
        })}
      </div>
    </ScreenWithNav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const BROWSE_GENRES = [
  {label:"🎭 Drama",genre:"Drama"},{label:"🚀 Sci-Fi",genre:"Sci-Fi"},
  {label:"😱 Horror",genre:"Horror"},{label:"😂 Comedy",genre:"Comedy"},
  {label:"💥 Action",genre:"Action"},{label:"🌏 International",genre:"international"},
];

const SearchScreen = ({ onNav, onSelectMovie, onSelectUser, followingHandles=new Set(), toggleFollowHandle, rateLimitedFollow, searchHistory=[], addSearchHistory, clearSearchHistory, removeSearchHistoryItem, username="", showToast }) => {
  const [query,setQuery]=useState("");
  const [searchTab,setSearchTab]=useState("movies"); // "movies" | "users"
  const [browseGenre,setBrowseGenre]=useState(null);
  const [showFindFriends,setShowFindFriends]=useState(false);

  // Commit query to history when user has typed 2+ chars and then pauses
  useEffect(()=>{
    if (query.length >= 2 && addSearchHistory) {
      const t = setTimeout(()=>addSearchHistory(query), 1200);
      return ()=>clearTimeout(t);
    }
  },[query, addSearchHistory]);

  // TMDB movie search — debounced 400ms. Falls back to local MOVIES filter if TMDB disabled.
  const [tmdbSearchResults,setTmdbSearchResults]=useState(null);
  const [tmdbSearching,setTmdbSearching]=useState(false);
  useEffect(()=>{
    if (query.length < 2) { setTmdbSearchResults(null); setTmdbSearching(false); return; }
    let cancelled = false;
    setTmdbSearching(true);
    const t = setTimeout(async ()=>{
      const data = await tmdbSearch(query);
      if (!cancelled) {
        setTmdbSearchResults(data); // null if TMDB disabled/failed → falls back below
        setTmdbSearching(false);
      }
    }, 400);
    return ()=>{ cancelled = true; clearTimeout(t); };
  },[query]);

  const localTextResults = query.length>1?MOVIES.filter(m=>m.title.toLowerCase().includes(query.toLowerCase())):[];
  // Prefer TMDB results when available; otherwise fall back to local filter
  const textResults = tmdbSearchResults || localTextResults;
  const browseResults=browseGenre
    ? MOVIES.filter(m=>browseGenre==="international"?m.is_international:m.genres?.some(g=>g.name===browseGenre))
    : [];
  const showBrowse=browseGenre&&query.length<=1;

  // User search — matches username or bio
  const userResults = query.length>1 ? Object.entries(USER_PROFILES)
    .filter(([handle,p])=>
      handle.toLowerCase().includes(query.toLowerCase()) ||
      p.username.toLowerCase().includes(query.toLowerCase()) ||
      p.bio?.toLowerCase().includes(query.toLowerCase())
    )
    .map(([handle,p])=>({handle,...p})) : [];

  // Suggested users — pick 5 on first render, preferring people not yet followed,
  // then lock the list. This way, tapping Follow keeps them visible (with the
  // button toggling to "FOLLOWING") instead of making them disappear and
  // replacing them with someone new. User can unfollow from here if they change
  // their mind. List refreshes next time the user revisits the Search screen.
  const suggestedUsersRef = useRef(null);
  if (suggestedUsersRef.current === null) {
    suggestedUsersRef.current = Object.entries(USER_PROFILES)
      .map(([handle,p])=>({handle,...p}))
      .sort((a,b)=>{
        // On first render, show unfollowed users first
        const aFollowing = followingHandles.has(a.handle) ? 1 : 0;
        const bFollowing = followingHandles.has(b.handle) ? 1 : 0;
        return aFollowing - bFollowing;
      })
      .slice(0,5);
  }
  const suggestedUsers = suggestedUsersRef.current;

  // Invite helpers — shared with Settings → Find Friends
  const { inviteUrl, shareInvite } = useShareInvite(username, showToast);
  const handleShareInviteModal = async () => {
    const ok = await shareInvite();
    if (ok) setShowFindFriends(false);
  };
  const handleSyncContactsModal = () => {
    haptic("light");
    // TODO: in React Native, request CONTACTS permission, hash (SHA-256) each email/phone,
    //       POST hashes to backend /users/me/find_friends, render matches.
    showToast && showToast("Contact sync is available in the RATED mobile app", "ok");
    setShowFindFriends(false);
  };

  return (
    <ScreenWithNav active="search" onNav={onNav}>

      {/* Find Friends modal */}
      {showFindFriends&&(
        <div onClick={()=>setShowFindFriends(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",zIndex:60,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"18px 20px 24px",maxHeight:"80%",overflowY:"auto",borderTop:`1px solid ${W.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:900,color:W.text,fontFamily:"monospace"}}>👋 FIND FRIENDS</div>
              <TapTarget onClick={()=>setShowFindFriends(false)} label="Close find friends" minTap={false}
                style={{fontSize:16,color:W.dim,minWidth:40,minHeight:40,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6}}>
                <span aria-hidden="true">✕</span>
              </TapTarget>
            </div>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:14}}>
              See which of your friends are already on RATED, or invite them to join.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <TapTarget onClick={handleSyncContactsModal} label="Sync contacts to find friends on Rated" minTap={false}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:W.card,borderRadius:12,border:`1px solid ${W.border}`,minHeight:60}}>
                <div aria-hidden="true" style={{width:36,height:36,borderRadius:10,background:W.accent+"22",border:`1px solid ${W.accent}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📇</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Sync Contacts</div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>Find friends from your phone contacts</div>
                </div>
                <span aria-hidden="true" style={{color:W.dim,fontSize:14}}>›</span>
              </TapTarget>
              <TapTarget onClick={handleShareInviteModal} label={`Share your invite link: ${inviteUrl}`} minTap={false}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:W.card,borderRadius:12,border:`1px solid ${W.border}`,minHeight:60}}>
                <div aria-hidden="true" style={{width:36,height:36,borderRadius:10,background:W.blue+"22",border:`1px solid ${W.blue}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🔗</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Share Invite Link</div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inviteUrl}</div>
                </div>
                <span aria-hidden="true" style={{color:W.dim,fontSize:14}}>›</span>
              </TapTarget>
            </div>
            <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginTop:12,textAlign:"center"}}>
              We never post or message on your behalf. Contact data stays private and is only used to find matches.
              </div>
              <TapTarget onClick={()=>setShowFindFriends(false)} label="Close" minTap={false}
                style={{marginTop:12,padding:"11px",textAlign:"center",fontSize:11,color:W.dim,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
                Close
              </TapTarget>
            </div>
          </div>
        )}

      <div style={{padding:"8px 22px 6px",display:"flex",gap:8,alignItems:"center"}}>
        {browseGenre&&<div onClick={()=>setBrowseGenre(null)} style={{fontSize:11,color:W.dim,cursor:"pointer",flexShrink:0}}>←</div>}
        <input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder={searchTab==="users"?"⌕ Search users by name...":"⌕ Search movies, directors..."}
          type="search" enterKeyHint="search" aria-label="Search"
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); if(query.trim().length>=2&&addSearchHistory) addSearchHistory(query); e.target.blur(); } }}
          style={{flex:1,background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"11px 16px",fontSize:12,color:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box"}}/>
      </div>

      {/* Search type tabs */}
      <div style={{display:"flex",gap:0,margin:"0 22px 6px",background:W.card,borderRadius:10,padding:3}}>
        {[{key:"movies",label:"🎬 Movies"},{key:"users",label:"👥 Users"}].map(t=>(
          <div key={t.key} onClick={()=>{setSearchTab(t.key);setBrowseGenre(null);}} style={{flex:1,textAlign:"center",padding:"6px 0",fontSize:10,fontFamily:"monospace",fontWeight:600,borderRadius:8,background:searchTab===t.key?W.bg:"transparent",color:searchTab===t.key?W.accent:W.dim,cursor:"pointer"}}>{t.label}</div>
        ))}
      </div>

      <div style={{padding:"0 22px 16px"}}>
        {/* ===== MOVIES TAB ===== */}
        {searchTab==="movies"&&<>
          {/* Searching indicator — shown only during initial fetch when no results
              are visible yet, so it doesn't flash on every keystroke. */}
          {query.length>1&&tmdbSearching&&textResults.length===0&&(
            <div style={{textAlign:"center",padding:"16px 0",color:W.dim,fontFamily:"monospace",fontSize:10}}>
              <span aria-live="polite">Searching…</span>
            </div>
          )}
          {query.length>1&&textResults.map(m=>(
            <div key={m.id} onClick={()=>onSelectMovie(m)} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${W.border}`,cursor:"pointer"}}>
              <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{m.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year} · {m.directors?.[0]?.name}</div></div>
              <div style={{fontSize:10,fontWeight:800,color:W.gold,fontFamily:"monospace"}}>#{m.global_rank||"—"}</div>
            </div>
          ))}
          {/* "No results" only after we've stopped searching — otherwise this would
              flash on every keystroke before the debounced fetch even runs. */}
          {query.length>1&&!tmdbSearching&&textResults.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:W.dim,fontFamily:"monospace",fontSize:11}}>No results for "{query}"</div>}

          {showBrowse&&<>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:10}}>
              {BROWSE_GENRES.find(g=>g.genre===browseGenre)?.label} · {browseResults.length} films
            </div>
            {browseResults.map(m=>(
              <div key={m.id} onClick={()=>onSelectMovie(m)} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${W.border}`,cursor:"pointer"}}>
                <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{m.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year} · {m.directors?.[0]?.name}</div></div>
                <div style={{fontSize:10,fontWeight:800,color:W.gold,fontFamily:"monospace"}}>#{m.global_rank||"—"}</div>
              </div>
            ))}
            {browseResults.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:W.dim,fontFamily:"monospace",fontSize:11}}>No movies in catalog yet</div>}
          </>}

          {query.length<=1&&!browseGenre&&<>
            {searchHistory.length>0&&<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,marginBottom:4}}>
                <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>RECENT SEARCHES</div>
                <div onClick={()=>{haptic("light");clearSearchHistory&&clearSearchHistory();}} style={{fontSize:9,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>Clear</div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {searchHistory.slice(0,6).map(q=>(
                  <div key={q} style={{display:"flex",alignItems:"center",padding:"5px 6px 5px 10px",borderRadius:16,background:W.card,border:`1px solid ${W.border}`}}>
                    <div onClick={()=>{haptic("light");setQuery(q);}} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
                      <span style={{fontSize:10,color:W.dim}}>🕒</span>
                      <span style={{fontSize:10,color:W.text,fontFamily:"monospace"}}>{q}</span>
                    </div>
                    <TapTarget onClick={e=>{e.stopPropagation();haptic("light");removeSearchHistoryItem&&removeSearchHistoryItem(q);}} label={`Remove ${q} from search history`} minTap={false}
                      style={{marginLeft:4,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:W.dim}}>
                      <span aria-hidden="true">✕</span>
                    </TapTarget>
                  </div>
                ))}
              </div>
            </>}
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:8}}>TRENDING</div>
            {[...MOVIES].sort((a,b)=>(a.trending_rank||99)-(b.trending_rank||99)).slice(0,5).map(m=>(
              <div key={m.id} onClick={()=>onSelectMovie(m)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${W.border}`,cursor:"pointer"}}>
                <span style={{fontSize:11,color:W.dim}}>🔥</span>
                <span style={{fontSize:12,color:W.text,fontFamily:"monospace",flex:1}}>{m.title}</span>
                {m.is_international&&<Badge color="purple">{m.original_language}</Badge>}
                <span style={{fontSize:10,color:W.dim}}>→</span>
              </div>
            ))}
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:12}}>BROWSE</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
              {BROWSE_GENRES.map(c=>(
                <span key={c.genre} onClick={()=>setBrowseGenre(c.genre)}
                  style={{padding:"7px 14px",borderRadius:10,fontSize:10,fontFamily:"monospace",fontWeight:600,background:W.card,border:`1px solid ${W.border}`,color:W.dim,cursor:"pointer"}}>{c.label}</span>
              ))}
            </div>
          </>}
        </>}

        {/* ===== USERS TAB ===== */}
        {searchTab==="users"&&<>
          {/* Find Friends CTA */}
          <div onClick={()=>setShowFindFriends(true)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:`linear-gradient(135deg,${W.accent}22,${W.blue}22)`,border:`1px solid ${W.accent}44`,borderRadius:12,cursor:"pointer",marginBottom:10}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:W.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>👋</div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:800,color:W.text,fontFamily:"monospace"}}>Find your friends</div>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>Connect contacts, Instagram, X · or share an invite</div>
            </div>
            <span style={{color:W.accent,fontSize:14}}>›</span>
          </div>

          {/* User search results */}
          {query.length>1&&userResults.map(u=>{
            const isFollowing=followingHandles.has(u.handle);
            return (
              <div key={u.handle} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${W.border}`}}>
                <div onClick={()=>onSelectUser&&onSelectUser(u.handle)} style={{display:"flex",alignItems:"center",gap:10,flex:1,cursor:"pointer",minWidth:0}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{u.avatar}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{u.handle}</span>
                      {u.badge&&<span style={{fontSize:11}}>{u.badge}</span>}
                      {u.isPrivate&&<span style={{fontSize:9}}>🔒</span>}
                    </div>
                    {u.bio&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.bio}</div>}
                    <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:1}}>{u.movies_rated} ranked · {u.followers} followers</div>
                  </div>
                </div>
                <div onClick={()=>{
                    if(!isFollowing&&rateLimitedFollow){
                      rateLimitedFollow(()=>toggleFollowHandle&&toggleFollowHandle(u.handle));
                    } else {
                      toggleFollowHandle&&toggleFollowHandle(u.handle);
                    }
                  }} style={{padding:"5px 12px",borderRadius:10,fontSize:9,fontWeight:700,fontFamily:"monospace",cursor:"pointer",background:isFollowing?W.accentDim:W.card,border:`1px solid ${isFollowing?W.accent:W.border}`,color:isFollowing?W.accent:W.dim,flexShrink:0}}>
                  {isFollowing?"FOLLOWING":"+ FOLLOW"}
                </div>
              </div>
            );
          })}
          {query.length>1&&userResults.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:W.dim,fontFamily:"monospace",fontSize:11}}>No users matching "{query}"</div>}

          {/* Suggested when no query */}
          {query.length<=1&&<>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:4,marginBottom:2}}>SUGGESTED FOR YOU</div>
            {suggestedUsers.map(u=>{
              const isFollowing=followingHandles.has(u.handle);
              return (
                <div key={u.handle} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${W.border}`}}>
                  <div onClick={()=>onSelectUser&&onSelectUser(u.handle)} style={{display:"flex",alignItems:"center",gap:10,flex:1,cursor:"pointer",minWidth:0}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{u.avatar}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <span style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{u.handle}</span>
                        {u.badge&&<span style={{fontSize:11}}>{u.badge}</span>}
                      </div>
                      {u.bio&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.bio}</div>}
                      <div style={{fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:1}}>{u.movies_rated} ranked · {u.followers} followers</div>
                    </div>
                  </div>
                  <div onClick={()=>{
                      if(!isFollowing&&rateLimitedFollow){
                        rateLimitedFollow(()=>toggleFollowHandle&&toggleFollowHandle(u.handle));
                      } else {
                        toggleFollowHandle&&toggleFollowHandle(u.handle);
                      }
                    }} style={{padding:"5px 12px",borderRadius:10,fontSize:9,fontWeight:700,fontFamily:"monospace",cursor:"pointer",background:isFollowing?W.accentDim:W.card,border:`1px solid ${isFollowing?W.accent:W.border}`,color:isFollowing?W.accent:W.dim,flexShrink:0}}>
                    {isFollowing?"FOLLOWING":"+ FOLLOW"}
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

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const ProfileScreen = ({ onNav, onSelectMovie, rankedIds, eloScores, watchlist, onSelectUpcoming, onToggleWatchlist, username, displayName, userBio, profilePic, isPrivate, onOpenSettings, session, userId, reportContent, rateLimitedFollow, followingHandles=new Set(), toggleFollowHandle, approvedFollowers=new Set(), userReviews=[], onUnrank, onReorderRanking, onRank, onReRank, savedMovies=new Set(), toggleSavedMovie, onEditReview, onDeleteReview, showToast, streakInfo={count:0,status:"none"} }) => {
  const [tab,setTab]=useState("rankings");
  const [rankingsSort,setRankingsSort]=useState("ranked");
  const [showRankingsSort,setShowRankingsSort]=useState(false);
  const [editingRankings,setEditingRankings]=useState(false);
  const [unrankConfirm,setUnrankConfirm]=useState(null); // movie object or null
  const [socialModal,setSocialModal]=useState(null);
  const [showImportInfo,setShowImportInfo]=useState(false);
  const [showShareModal,setShowShareModal]=useState(false);
  const [savedGenreFilter,setSavedGenreFilter]=useState("All");
  const [savedSort,setSavedSort]=useState("default"); // "default"|"alpha"|"popular"|"unpopular"
  const [showSavedSort,setShowSavedSort]=useState(false);
  // Following count derives from shared followingHandles set — updates when user follows/unfollows anywhere
  const followingCount = followingHandles.size;
  // Followers = mock friends who follow you + mutuals from your following + anyone whose request you approved
  const mockFollowers = new Set(MOCK_FRIENDS.filter(f=>f.follows_me || followingHandles.has(`@${f.username}`)).map(f=>`@${f.username}`));
  approvedFollowers.forEach(h=>mockFollowers.add(h));
  const followersCount = mockFollowers.size;
  // Edit/delete review state — reviewBeingEdited holds the full review object when edit modal is open.
  // reviewMenuOpen holds the ts of the review whose ⋯ menu is currently expanded.
  // reviewPendingDelete holds the ts of the review we're confirming deletion for.
  const [reviewBeingEdited,setReviewBeingEdited]=useState(null);
  const [reviewMenuOpen,setReviewMenuOpen]=useState(null);
  const [reviewPendingDelete,setReviewPendingDelete]=useState(null);
  // Saved movies now come from App shell — syncs across Home/Profile/Detail
  const savedMovieObjects=MOVIES.filter(m=>savedMovies.has(m.id));
  const removeSaved=(id)=>{haptic("medium");toggleSavedMovie&&toggleSavedMovie(id);};

  const watchlistMovies=UPCOMING.filter(u=>watchlist.has(u.id));
  const totalSaved=savedMovieObjects.length+watchlistMovies.length;

  const MOCK_REVIEWS = [
    {id:"rv-003",movie_id:"m-003",movie_title:"The Dark Knight",poster_url:MOVIES.find(m=>m.id==="m-003")?.poster_url,rating:10,text:"Heath Ledger's Joker is one of the greatest performances ever committed to film. Every scene crackles with menace. Nolan at his absolute peak.",time:"2h ago"},
    {id:"rv-001",movie_id:"m-001",movie_title:"Interstellar",poster_url:MOVIES.find(m=>m.id==="m-001")?.poster_url,rating:9,text:"The third act loses me a bit but the docking scene and Hans Zimmer's score are genuinely transcendent. McConaughey carries this film.",time:"3d ago"},
    {id:"rv-002",movie_id:"m-002",movie_title:"Parasite",poster_url:MOVIES.find(m=>m.id==="m-002")?.poster_url,rating:10,text:"A masterpiece of genre-blending. The way Bong Joon-ho shifts tone without you ever noticing is pure craft. Second watch is even better.",time:"1w ago"},
  ];

  const allRankings=rankedIds.map(id=>findMovieSync(id)).filter(Boolean);

  // Saved movies filter + sort (operate on the filtered array of Movie objects)
  const savedGenres = ["All",...new Set(savedMovieObjects.flatMap(m=>m.genres?.map(g=>g.name)||[]))];
  const filteredSaved = savedGenreFilter==="All" ? savedMovieObjects : savedMovieObjects.filter(m=>m.genres?.some(g=>g.name===savedGenreFilter));
  const sortedSaved = [...filteredSaved].sort((a,b)=>{
    if(savedSort==="alpha") return a.title.localeCompare(b.title);
    if(savedSort==="popular") return (b.avg_user_rating||0)-(a.avg_user_rating||0);
    if(savedSort==="unpopular") return (a.avg_user_rating||0)-(b.avg_user_rating||0);
    return 0;
  });

  // Derive a score out of 10 from ranking position for reviews

  // Pull-to-refresh — no backend yet so just animates. Provides expected gesture feedback.
  const handleRefresh = async () => {
    await new Promise(r=>setTimeout(r, 700));
  };
  const { pullDist, isRefreshing, pullHandlers } = usePullToRefresh(handleRefresh);

  return (
    <ScreenWithNav active="profile" onNav={onNav}
      scrollHandlers={pullHandlers}
      pullIndicator={<PullIndicator pullDist={pullDist} isRefreshing={isRefreshing}/>}>
      {/* Share modal */}
      {showShareModal&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 28px"}} onClick={()=>setShowShareModal(false)}>
        <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"22px 20px",width:"100%"}} onClick={e=>e.stopPropagation()}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:28,marginBottom:6}}>👤</div>
            <div style={{fontSize:14,fontWeight:900,color:W.text,fontFamily:"monospace"}}>{displayName||`@${username}`}</div>
            {displayName&&<div style={{fontSize:11,color:W.dim,fontFamily:"monospace",marginTop:2}}>@{username}</div>}
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6}}>rated.app/{username}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[{icon:"🔗",label:"Copy Profile Link",action:()=>{navigator.clipboard?.writeText(`https://rated.app/${username}`);setShowShareModal(false);}},
              {icon:<ShareIcon size={18} color={W.text}/>,label:"Share via...",action:()=>{navigator.share?.({title:`${username} on RATED`,url:`https://rated.app/${username}`});setShowShareModal(false);}},
            ].map(o=>(
              <div key={o.label} onClick={o.action} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:W.bg,borderRadius:12,border:`1px solid ${W.border}`,cursor:"pointer"}}>
                <span style={{fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",width:24}}>{o.icon}</span>
                <span style={{fontSize:12,fontWeight:600,color:W.text,fontFamily:"monospace"}}>{o.label}</span>
              </div>
            ))}
          </div>
          <div onClick={()=>setShowShareModal(false)} style={{marginTop:12,padding:"10px",textAlign:"center",fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>Cancel</div>
        </div>
      </div>}

      {/* Import instructions modal */}
      {showImportInfo&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 24px"}} onClick={()=>setShowImportInfo(false)}>
        <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"22px 20px",maxHeight:"75%",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace"}}>📥 HOW TO IMPORT</div>
            <div onClick={()=>setShowImportInfo(false)} style={{fontSize:18,color:W.dim,cursor:"pointer"}}>✕</div>
          </div>
          {[
            {name:"Letterboxd",icon:"🎬",steps:["Go to letterboxd.com → Settings","Click Import & Export","Click Export Your Data","Download the ZIP and open diary.csv","Tap IMPORT → on Rated and upload the CSV"]},
            {name:"IMDb",icon:"⭐",steps:["Go to imdb.com → Your Ratings","Click the 3-dot menu → Export","Download the CSV file","Tap IMPORT → on Rated and upload it"]},
            {name:"Trakt",icon:"📺",steps:["Go to trakt.tv → Settings → Data","Click Export Data","Download history.json","Tap IMPORT → on Rated and upload it"]},
            {name:"Netflix",icon:"🔴",steps:["Go to netflix.com → Account","Click Get My Info under Privacy","Download ViewingActivity.csv","Tap IMPORT → on Rated and upload it"]},
          ].map((src,si)=>(
            <div key={src.name} style={{marginBottom:si<3?16:0}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:16}}>{src.icon}</span>
                <span style={{fontSize:11,fontWeight:800,color:W.text,fontFamily:"monospace"}}>{src.name}</span>
              </div>
              {src.steps.map((step,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:4,paddingLeft:4}}>
                  <span style={{fontSize:9,color:W.accent,fontFamily:"monospace",fontWeight:700,flexShrink:0,minWidth:14}}>{i+1}.</span>
                  <span style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.5}}>{step}</span>
                </div>
              ))}
            </div>
          ))}
          <div onClick={()=>setShowImportInfo(false)} style={{marginTop:16,background:W.accent,borderRadius:10,padding:"9px",textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",cursor:"pointer"}}>GOT IT</div>
        </div>
      </div>}

      {/* Social modal */}
      {socialModal&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={()=>setSocialModal(null)}>
        <div style={{background:W.bg,borderRadius:"20px 20px 0 0",padding:"20px 22px 32px",maxHeight:"70%",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace"}}>{socialModal==="following"?`FOLLOWING · ${followingCount}`:`FOLLOWERS · ${followersCount}`}</div>
            <div onClick={()=>setSocialModal(null)} style={{fontSize:18,color:W.dim,cursor:"pointer"}}>✕</div>
          </div>
          {(()=>{
            // Build unified list for modal. Each row needs: handle, avatar, movies_rated
            let handles;
            if (socialModal==="following") {
              handles = Array.from(followingHandles);
            } else {
              // Followers: mock friends who follow you, mutuals, and anyone whose request you approved
              const fHandles = new Set();
              MOCK_FRIENDS.forEach(f=>{
                if(f.follows_me||followingHandles.has(`@${f.username}`)) fHandles.add(`@${f.username}`);
              });
              approvedFollowers.forEach(h=>fHandles.add(h));
              handles = Array.from(fHandles);
            }
            return handles.map(handle=>{
              const friend=MOCK_FRIENDS.find(f=>`@${f.username}`===handle);
              const prof=USER_PROFILES[handle];
              const avatar = friend?.avatar || prof?.avatar || handle[1]?.toUpperCase() || "?";
              const ranked = prof?.movies_rated || 0;
              const isFollowing=followingHandles.has(handle);
              const row = (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:W.card,borderBottom:`1px solid ${W.border}`}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0}}>{avatar}</div>
                  <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{handle}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{ranked} films ranked</div></div>
                  <div onClick={()=>{
                      if (!isFollowing && rateLimitedFollow) {
                        rateLimitedFollow(()=>toggleFollowHandle&&toggleFollowHandle(handle));
                      } else {
                        toggleFollowHandle&&toggleFollowHandle(handle);
                      }
                    }}
                    style={{padding:"4px 10px",borderRadius:10,fontSize:9,fontWeight:700,fontFamily:"monospace",cursor:"pointer",
                      background:isFollowing?W.accentDim:W.card,
                      border:`1px solid ${isFollowing?W.accent:W.border}`,
                      color:isFollowing?W.accent:W.dim}}>
                    {isFollowing?"FOLLOWING":"+ FOLLOW"}
                  </div>
                </div>
              );
              // On the Following tab, wrap with swipe-to-unfollow. Skip on Followers tab.
              if (socialModal==="following" && isFollowing) {
                return (
                  <SwipeableRow key={handle} actions={[
                    {icon:"✕",label:"Unfollow",color:W.accent,onPress:()=>toggleFollowHandle&&toggleFollowHandle(handle)}
                  ]}>
                    {row}
                  </SwipeableRow>
                );
              }
              return <div key={handle}>{row}</div>;
            });
          })()}
          {(socialModal==="following"&&followingCount===0)&&<div style={{textAlign:"center",padding:"24px 0",color:W.dim,fontSize:11,fontFamily:"monospace"}}>You're not following anyone yet</div>}
          {(socialModal==="followers"&&followersCount===0)&&<div style={{textAlign:"center",padding:"24px 0",color:W.dim,fontSize:11,fontFamily:"monospace"}}>No followers yet</div>}
        </div>
      </div>}

      <div style={{padding:"8px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>MY PROFILE</span>
        <div onClick={()=>onOpenSettings()} style={{fontSize:14,cursor:"pointer",padding:"4px 8px",borderRadius:8,background:W.card,border:`1px solid ${W.border}`,color:W.dim}}>⚙</div>
      </div>
      <div style={{padding:"0 22px",display:"flex",gap:14,alignItems:"center"}}>
        <div onClick={()=>onOpenSettings("account")} style={{width:54,height:54,borderRadius:"50%",background:W.card,border:`2px solid ${W.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,overflow:"hidden",flexShrink:0,cursor:"pointer",position:"relative"}}>
          {profilePic ? <img src={profilePic} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : "👤"}
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.35)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",opacity:0}}>
            <span style={{fontSize:12,color:"#fff"}}>✏️</span>
          </div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          {displayName&&<div style={{fontSize:14,fontWeight:800,color:W.text,fontFamily:"monospace",marginBottom:1}}>{displayName}</div>}
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{fontSize:displayName?12:15,fontWeight:displayName?500:900,color:displayName?W.dim:W.text,fontFamily:"monospace"}}>@{username}</div>
            {isPrivate&&<Badge color="purple">🔒 Private</Badge>}
          </div>
          {userBio&&<div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:3,lineHeight:1.4}}>{userBio}</div>}
          {/* Streak badge — always visible. Automatic behavior:
              - active: gold 🔥 — you ranked this week, streak is healthy
              - at-risk: orange ⚠️ — last week ranked, this week hasn't. Streak is
                still alive but will break on Monday if you don't rank something
              - none: dim "0-week streak" — either you've never ranked, or you
                missed a full week and the streak was auto-reset
              No prompts, no modals. The counter just reflects reality. */}
          <div style={{display:"flex",gap:4,alignItems:"center",marginTop:4}}>
            <span>{streakInfo.status==="at-risk"?"⚠️":"🔥"}</span>
            <span style={{fontSize:10,fontWeight:700,fontFamily:"monospace",color:streakInfo.status==="active"?W.gold:streakInfo.status==="at-risk"?W.orange:W.dim}}>
              {streakInfo.count}-week streak
            </span>
            {streakInfo.status==="at-risk"&&<span style={{fontSize:9,fontFamily:"monospace",color:W.orange}}>· rank before Sunday</span>}
          </div>
        </div>
      </div>
      <div style={{display:"flex",padding:"14px 22px 8px"}}>
        {[{n:allRankings.length,l:"Ranked",click:null},{n:totalSaved,l:"Saved",click:null},{n:followingCount,l:"Following",click:"following"},{n:followersCount,l:"Followers",click:"followers"}].map((s,i)=>(
          <div key={i} onClick={()=>s.click&&setSocialModal(s.click)} style={{flex:1,textAlign:"center",cursor:s.click?"pointer":"default"}}>
            <div style={{fontSize:16,fontWeight:900,color:i===0?W.accent:s.click?W.blue:W.text,fontFamily:"monospace",textDecoration:s.click?"underline":"none"}}>{s.n}</div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{s.l}</div>
          </div>
        ))}
      </div>
      {/* Action buttons row */}
      <div style={{padding:"0 22px 10px",display:"flex",gap:8}}>
        <div onClick={()=>onOpenSettings("account")} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px",borderRadius:12,background:W.card,border:`1px solid ${W.border}`,cursor:"pointer"}}>
          <span style={{fontSize:14}}>✎</span>
          <span style={{fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace"}}>Edit Profile</span>
        </div>
        <div onClick={()=>setShowShareModal(true)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px",borderRadius:12,background:W.card,border:`1px solid ${W.border}`,cursor:"pointer"}}>
          <ShareIcon size={14} color={W.dim}/>
          <span style={{fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace"}}>Share Profile</span>
        </div>
      </div>
      <div style={{display:"flex",borderBottom:`1px solid ${W.border}`,margin:"0 22px"}}>
        {["rankings","saved","reviews"].map(t=>(
          <div key={t} onClick={()=>setTab(t)} style={{flex:1,textAlign:"center",padding:"8px 0",fontSize:9,fontFamily:"monospace",fontWeight:600,color:tab===t?W.accent:W.dim,borderBottom:`2px solid ${tab===t?W.accent:"transparent"}`,cursor:"pointer",textTransform:"capitalize"}}>{t}</div>
        ))}
      </div>
      <div style={{padding:"10px 22px 16px",display:"flex",flexDirection:"column",gap:5}}>
        {tab==="rankings"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,gap:8}}>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1,flex:1,minWidth:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>YOUR RANKINGS · {allRankings.length} films</div>
            {allRankings.length>0&&<div onClick={()=>setEditingRankings(p=>!p)} style={{padding:"3px 9px",borderRadius:8,background:editingRankings?W.accentDim:W.card,border:`1px solid ${editingRankings?W.accent:W.border}`,cursor:"pointer",flexShrink:0}}>
              <span style={{fontSize:9,color:editingRankings?W.accent:W.dim,fontFamily:"monospace",fontWeight:600}}>{editingRankings?"✓ Done":"✎ Edit"}</span>
            </div>}
            <div style={{position:"relative",flexShrink:0}}>
              <div onClick={()=>setShowRankingsSort(p=>!p)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:8,background:rankingsSort!=="ranked"?W.blueDim:W.card,border:`1px solid ${rankingsSort!=="ranked"?W.blue:W.border}`,cursor:"pointer"}}>
                <span style={{fontSize:9,color:rankingsSort!=="ranked"?W.blue:W.dim,fontFamily:"monospace",fontWeight:600}}>
                  {{ranked:"My Rank",alpha:"A–Z",popular:"Popular",unpopular:"Least Popular"}[rankingsSort]} ▾
                </span>
              </div>
              {showRankingsSort&&<div style={{position:"absolute",right:0,top:"110%",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,overflow:"hidden",zIndex:20,minWidth:130}}>
                {[{key:"ranked",label:"My Rank"},{key:"alpha",label:"A–Z"},{key:"popular",label:"Most Popular"},{key:"unpopular",label:"Least Popular"}].map(o=>(
                  <div key={o.key} onClick={()=>{setRankingsSort(o.key);setShowRankingsSort(false);}} style={{padding:"8px 12px",fontSize:10,fontFamily:"monospace",color:rankingsSort===o.key?W.blue:W.text,background:rankingsSort===o.key?W.blueDim:"transparent",cursor:"pointer",fontWeight:rankingsSort===o.key?700:400}}>{o.label}</div>
                ))}
              </div>}
            </div>
          </div>
          {allRankings.length===0&&<div style={{textAlign:"center",padding:"28px 0"}}><div style={{fontSize:32,marginBottom:8}}>🎬</div><div style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>No rankings yet</div><div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6,lineHeight:1.6}}>Open any movie and tap ⚡ RANK</div></div>}
          {(() => {
            const sorted = [...allRankings].sort((a,b)=>{
              if(rankingsSort==="alpha") return a.title.localeCompare(b.title);
              if(rankingsSort==="popular") return (b.avg_user_rating||0)-(a.avg_user_rating||0);
              if(rankingsSort==="unpopular") return (a.avg_user_rating||0)-(b.avg_user_rating||0);
              return 0;
            });
            // Render a single ranking row. dragHandleProps are spread onto the drag handle (☰).
            // When not provided (non-draggable mode), the handle is hidden.
            const renderRow = (m, i, dragHandleProps=null, isDragging=false) => {
              const origPos=allRankings.findIndex(r=>r.id===m.id);
              return (
                <div onClick={()=>!editingRankings&&onSelectMovie(m)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:origPos===0&&rankingsSort==="ranked"?W.goldDim:W.card,borderRadius:10,border:`1px solid ${origPos===0&&rankingsSort==="ranked"?W.gold+"44":W.border}`,cursor:editingRankings?"default":"pointer"}}>
                  {dragHandleProps&&<div {...dragHandleProps} style={{...dragHandleProps.style,width:20,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:W.dim,flexShrink:0,userSelect:"none"}} title="Drag to reorder">☰</div>}
                  <span style={{fontSize:origPos<3&&rankingsSort==="ranked"?13:11,fontWeight:900,color:W.dim,fontFamily:"monospace",width:18,textAlign:"center",flexShrink:0}}>
                    {rankingsSort==="ranked"?(origPos<3?["🥇","🥈","🥉"][origPos]:origPos+1):(i+1)}
                  </span>
                  <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.title}</div>
                    <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year}{rankingsSort!=="ranked"&&m.avg_user_rating?` · ★ ${m.avg_user_rating} avg`:""}</div>
                  </div>
                  {editingRankings?(
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      {/* Arrow buttons remain as keyboard-accessible fallback when sort is "ranked" */}
                      {rankingsSort==="ranked"&&origPos>0&&<TapTarget onClick={e=>{e.stopPropagation();onReorderRanking&&onReorderRanking(m.id,origPos-1);}} label={`Move ${m.title} up`} minTap={false}
                        style={{width:28,height:28,borderRadius:6,background:W.bg,border:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:W.dim}}>
                        <span aria-hidden="true">↑</span>
                      </TapTarget>}
                      {rankingsSort==="ranked"&&origPos<allRankings.length-1&&<TapTarget onClick={e=>{e.stopPropagation();onReorderRanking&&onReorderRanking(m.id,origPos+1);}} label={`Move ${m.title} down`} minTap={false}
                        style={{width:28,height:28,borderRadius:6,background:W.bg,border:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:W.dim}}>
                        <span aria-hidden="true">↓</span>
                      </TapTarget>}
                      <TapTarget onClick={e=>{e.stopPropagation();onReRank&&onReRank(m);}} label={`Re-rank ${m.title}`} minTap={false}
                        style={{width:28,height:28,borderRadius:6,background:W.blueDim,border:`1px solid ${W.blue}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:W.blue}}>
                        <span aria-hidden="true">↻</span>
                      </TapTarget>
                      <TapTarget onClick={e=>{e.stopPropagation();setUnrankConfirm(m);}} label={`Remove ${m.title}`} minTap={false}
                        style={{width:28,height:28,borderRadius:6,background:W.accentDim,border:`1px solid ${W.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:W.accent}}>
                        <span aria-hidden="true">✕</span>
                      </TapTarget>
                    </div>
                  ):(
                    <span style={{fontSize:9,color:W.blue,fontFamily:"monospace",fontWeight:700,flexShrink:0}}>
                      {eloScores[m.id]||1500}
                    </span>
                  )}
                </div>
              );
            };
            // Use DraggableList only in "ranked" sort + edit mode. Other sorts are virtual
            // orderings (alphabetical, popularity) so dragging would be misleading.
            if (editingRankings && rankingsSort==="ranked") {
              return <DraggableList
                items={sorted}
                keyOf={m=>m.id}
                renderItem={(m, dragHandleProps, isDragging)=>renderRow(m, sorted.indexOf(m), dragHandleProps, isDragging)}
                onReorder={(from, to)=>{
                  const movie = sorted[from];
                  if (movie && onReorderRanking) onReorderRanking(movie.id, to);
                }}
              />;
            }
            return sorted.map((m,i)=><div key={m.id}>{renderRow(m,i)}</div>);
          })()}

          <div style={{marginTop:14,background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:14,opacity:0.85}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>📥 IMPORT YOUR DATA</div>
              <span style={{fontSize:8,background:W.orangeDim,color:W.orange,padding:"2px 6px",borderRadius:3,fontFamily:"monospace",fontWeight:700,letterSpacing:0.5,border:`1px solid ${W.orange}44`}}>COMING SOON</span>
              <div onClick={()=>setShowImportInfo(true)} style={{width:16,height:16,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:W.dim,cursor:"pointer",fontWeight:700,flexShrink:0,marginLeft:"auto"}}>i</div>
            </div>
            <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.5,marginBottom:10}}>We're working on matching your imported history to our movie database. You'll be notified when it's ready.</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[
                {name:"Letterboxd",icon:"🎬",sub:"Upload diary.csv from letterboxd.com",accept:".csv"},
                {name:"IMDb",icon:"⭐",sub:"Upload ratings.csv from imdb.com",accept:".csv"},
                {name:"Trakt",icon:"📺",sub:"Upload history.json from trakt.tv",accept:".json"},
                {name:"Netflix",icon:"🔴",sub:"Upload ViewingActivity.csv",accept:".csv"},
              ].map(src=>(
                <div key={src.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:W.bg,borderRadius:10,border:`1px solid ${W.border}`,opacity:0.6}}>
                  <span style={{fontSize:18,flexShrink:0}}>{src.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{src.name}</div>
                    <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{src.sub}</div>
                  </div>
                  <span style={{fontSize:9,color:W.dim,fontFamily:"monospace",fontWeight:700,cursor:"not-allowed"}}>SOON</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {tab==="saved"&&<>
          {/* Genre filter chips */}
          <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4}}>
            {savedGenres.map(g=>(
              <span key={g} onClick={()=>setSavedGenreFilter(g)} style={{flexShrink:0,padding:"4px 11px",borderRadius:16,fontSize:9,fontFamily:"monospace",fontWeight:600,cursor:"pointer",background:savedGenreFilter===g?W.accentDim:W.card,border:`1px solid ${savedGenreFilter===g?W.accent:W.border}`,color:savedGenreFilter===g?W.accent:W.dim}}>{g}</span>
            ))}
          </div>
          {/* SAVED — already-released films bookmarked. Sort dropdown lives inline
              with the count for compactness (was a row of 4 pills below — see git history). */}
          {sortedSaved.length>0&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2,position:"relative"}}>
              <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>SAVED · {sortedSaved.length}</div>
              <div onClick={()=>setShowSavedSort(p=>!p)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:8,background:savedSort!=="default"?W.blueDim:W.card,border:`1px solid ${savedSort!=="default"?W.blue:W.border}`,cursor:"pointer"}}>
                <span style={{fontSize:9,color:savedSort!=="default"?W.blue:W.dim,fontFamily:"monospace",fontWeight:600}}>
                  {{default:"Default",alpha:"A–Z",popular:"Most Popular",unpopular:"Least Popular"}[savedSort]} ▾
                </span>
              </div>
              {showSavedSort&&<div style={{position:"absolute",right:0,top:"110%",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,overflow:"hidden",zIndex:20,minWidth:140}}>
                {[{key:"default",label:"Default"},{key:"alpha",label:"A–Z"},{key:"popular",label:"Most Popular"},{key:"unpopular",label:"Least Popular"}].map(o=>(
                  <div key={o.key} onClick={()=>{setSavedSort(o.key);setShowSavedSort(false);}} style={{padding:"8px 12px",fontSize:10,fontFamily:"monospace",color:savedSort===o.key?W.blue:W.text,background:savedSort===o.key?W.blueDim:"transparent",cursor:"pointer",fontWeight:savedSort===o.key?700:400}}>{o.label}</div>
                ))}
              </div>}
            </div>
          )}
          {sortedSaved.length===0&&watchlistMovies.length===0&&<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:28,marginBottom:8}}>◇</div><div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Nothing saved yet</div><div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:6,lineHeight:1.6}}>Tap ◇ on any movie to save it</div></div>}
          {sortedSaved.map(m=>(
            <SwipeableRow key={m.id} actions={[
              {icon:"🗑️",label:"Remove",color:W.accent,onPress:()=>removeSaved(m.id)}
            ]}>
              <div onClick={()=>onSelectMovie(m)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:W.card,borderRadius:10,border:`1px solid ${W.blue}22`,cursor:"pointer"}}>
                <Poster url={m.poster_url} title={m.title} w={36} h={50} radius={6}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{m.title}</div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{m.release_year} · {m.directors?.[0]?.name}</div>
                  {m.avg_user_rating&&<div style={{fontSize:9,color:W.gold,fontFamily:"monospace",marginTop:1}}>★ {m.avg_user_rating} avg</div>}
                </div>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:W.blue}}>◆</div><div style={{fontSize:7,color:W.blue,fontFamily:"monospace"}}>SAVED</div></div>
              </div>
            </SwipeableRow>
          ))}
          {/* WATCHLIST — upcoming/unreleased films */}
          {watchlistMovies.length>0&&<div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:sortedSaved.length>0?10:0,marginBottom:2}}>WATCHLIST · {watchlistMovies.length}</div>}
          {watchlistMovies.map(u=>(
            <SwipeableRow key={u.id} actions={[
              {icon:"🗑️",label:"Remove",color:W.accent,onPress:()=>onToggleWatchlist&&onToggleWatchlist(u.id)}
            ]}>
              <div onClick={()=>onSelectUpcoming(u)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:W.card,borderRadius:10,border:`1px solid ${W.accent}22`,cursor:"pointer"}}>
                <Poster url={u.poster_url} title={u.title} w={36} h={50} radius={6}/>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace"}}>{u.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{formatReleaseDate(u.release_date)} · {(()=>{const d=daysUntil(u.release_date);return d>0?`${d}d away`:d===0?"TODAY":"Released";})()}</div></div>
                <div style={{textAlign:"center"}}><div style={{fontSize:12,color:W.accent}}>◈</div><div style={{fontSize:7,color:W.accent,fontFamily:"monospace"}}>SOON</div></div>
              </div>
            </SwipeableRow>
          ))}
        </>}

        {tab==="reviews"&&<>
          <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>{(userReviews.length+MOCK_REVIEWS.length)} REVIEWS · MOST RECENT FIRST</div>
          {/* User's own written reviews first */}
          {userReviews.map(r=>{
            const movie=findMovieSync(r.movie_id, r.movie_title);
            const menuOpen = reviewMenuOpen===r.ts;
            return (
              <div key={`user-${r.ts}`} style={{background:W.card,border:`1px solid ${W.accent}44`,borderRadius:12,padding:12,position:"relative"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{if(movie)onSelectMovie(movie);}}>
                    <Poster url={movie?.poster_url} title={movie?.title} w={32} h={44} radius={6}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.movie_title}</div>
                        {r.edited?<span style={{fontSize:7,color:W.dim,fontFamily:"monospace",flexShrink:0}}>edited</span>:<span style={{fontSize:7,background:W.accent,color:"#fff",padding:"1px 5px",borderRadius:3,fontFamily:"monospace",fontWeight:700,flexShrink:0}}>NEW</span>}
                      </div>
                      <div style={{fontSize:13,fontWeight:900,color:W.gold,fontFamily:"monospace",marginTop:3}}>{r.rating}/10</div>
                    </div>
                  </div>
                  <TapTarget onClick={e=>{e.stopPropagation();haptic("light");setReviewMenuOpen(menuOpen?null:r.ts);}} label="Review options" minTap={false}
                    style={{fontSize:16,color:W.dim,minWidth:32,minHeight:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,flexShrink:0}}>
                    <span aria-hidden="true">⋯</span>
                  </TapTarget>
                </div>
                <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>{r.text}</div>
                {menuOpen&&<div onClick={()=>setReviewMenuOpen(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",zIndex:10,display:"flex",flexDirection:"column",justifyContent:"flex-end",borderRadius:12,overflow:"hidden"}}>
                  <div onClick={e=>e.stopPropagation()} style={{background:W.bg,padding:"12px",display:"flex",flexDirection:"column",gap:6,borderTop:`1px solid ${W.border}`}}>
                    <TapTarget onClick={()=>{setReviewBeingEdited(r);setReviewMenuOpen(null);}} label="Edit review" minTap={false}
                      style={{padding:"10px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:40}}>
                      <span style={{fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace"}}>Edit</span>
                    </TapTarget>
                    <TapTarget onClick={()=>{setReviewPendingDelete(r.ts);setReviewMenuOpen(null);}} label="Delete review" minTap={false}
                      style={{padding:"10px 14px",background:W.card,border:`1px solid ${W.border}`,borderRadius:10,display:"flex",alignItems:"center",minHeight:40}}>
                      <span style={{fontSize:12,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>Delete</span>
                    </TapTarget>
                  </div>
                </div>}
              </div>
            );
          })}
          {/* Mock reviews (fallback / demo content) */}
          {MOCK_REVIEWS.map(r=>{
            const rankPos=allRankings.findIndex(m=>m.id===r.movie_id);
            const score=rankPos>=0
              ? Math.min(10,Math.max(1,10-Math.round(rankPos/Math.max(allRankings.length-1,1)*9)))
              : r.rating;
            return (
              <div key={r.id} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:12}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8,cursor:"pointer"}} onClick={()=>{const m=MOVIES.find(m=>m.id===r.movie_id);if(m)onSelectMovie(m);}}>
                  <Poster url={r.poster_url} title={r.movie_title} w={32} h={44} radius={6}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.movie_title}</div>
                    <div style={{fontSize:13,fontWeight:900,color:W.gold,fontFamily:"monospace",marginTop:3}}>{score}/10</div>
                  </div>
                  <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",flexShrink:0}}>{r.time}</div>
                </div>
                <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>{r.text}</div>
              </div>
            );
          })}
        </>}
      </div>

      {/* Unrank confirmation modal */}
      {unrankConfirm&&<div onClick={()=>setUnrankConfirm(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:70,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 28px"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"22px 20px",width:"100%"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:28,marginBottom:8}}>🗑️</div>
            <div style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace",marginBottom:6}}>Remove from rankings?</div>
            <div style={{fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace"}}>{unrankConfirm.title}</div>
            <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:8,lineHeight:1.5}}>
              This will remove the film from your rankings and delete your ELO score for it. You can re-rank it anytime.
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <div onClick={()=>setUnrankConfirm(null)} style={{flex:1,padding:"11px",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",cursor:"pointer"}}>Cancel</div>
            <div onClick={()=>{onUnrank&&onUnrank(unrankConfirm.id);setUnrankConfirm(null);}} style={{flex:1,padding:"11px",borderRadius:10,background:W.accent,textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",cursor:"pointer"}}>Remove</div>
          </div>
        </div>
      </div>}

      {/* Edit review modal — reuses ReviewModal in edit mode */}
      {reviewBeingEdited&&<ReviewModal
        movie={findMovieSync(reviewBeingEdited.movie_id, reviewBeingEdited.movie_title)}
        existing={reviewBeingEdited}
        onSubmit={(text,rating)=>{
          onEditReview&&onEditReview(reviewBeingEdited.ts, text, rating);
          showToast&&showToast("Review updated","ok");
        }}
        onClose={()=>setReviewBeingEdited(null)}
      />}

      {/* Delete review confirmation */}
      {reviewPendingDelete&&<div onClick={()=>setReviewPendingDelete(null)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 28px"}}>
        <div onClick={e=>e.stopPropagation()} role="alertdialog" aria-labelledby="del-review-title" style={{background:W.card,border:`1px solid ${W.accent}66`,borderRadius:16,padding:"20px 22px",maxWidth:340,width:"100%"}}>
          <div id="del-review-title" style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginBottom:8,textAlign:"center"}}>Delete this review?</div>
          <div style={{fontSize:10,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:14,textAlign:"center"}}>This will remove your review and the corresponding activity from your feed. This can't be undone.</div>
          <div style={{display:"flex",gap:8}}>
            <TapTarget onClick={()=>setReviewPendingDelete(null)} label="Cancel" minTap={false}
              style={{flex:1,padding:"11px",borderRadius:10,background:W.bg,border:`1px solid ${W.border}`,textAlign:"center",fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
              Cancel
            </TapTarget>
            <TapTarget onClick={()=>{onDeleteReview&&onDeleteReview(reviewPendingDelete);setReviewPendingDelete(null);showToast&&showToast("Review deleted","ok");}} label="Delete review" minTap={false}
              style={{flex:1,padding:"11px",borderRadius:10,background:W.accent,textAlign:"center",fontSize:11,fontWeight:700,color:"#fff",fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:40}}>
              Delete
            </TapTarget>
          </div>
        </div>
      </div>}
    </ScreenWithNav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RANK SCREEN — sends pairwise results + final score to backend
// ─────────────────────────────────────────────────────────────────────────────

const RankScreen = ({ newMovie, rankedIds, eloScores, onComplete, onCancel, session, userId }) => {
  const [lo,setLo]=useState(0);
  const [hi,setHi]=useState(rankedIds.length);
  const [localElo,setLocalElo]=useState({...eloScores,[newMovie.id]:1500});
  const [result,setResult]=useState(null);
  const [insertPos,setInsertPos]=useState(null);
  const [done,setDone]=useState(false);
  useEffect(()=>{if(rankedIds.length===0){setInsertPos(0);setDone(true);}},[]);

  const midIdx=Math.floor((lo+hi)/2);
  const opponentId=rankedIds[midIdx];
  const opponent=MOVIES.find(m=>m.id===opponentId);

  const pick=async(winnerId)=>{
    const loserId=winnerId===newMovie.id?opponentId:newMovie.id;
    const [newW,newL]=calcElo(localElo[winnerId]||1500,localElo[loserId]||1500);
    setLocalElo(p=>({...p,[winnerId]:newW,[loserId]:newL}));
    const nextLo=winnerId===newMovie.id?lo:midIdx+1;
    const nextHi=winnerId===newMovie.id?midIdx:hi;
    setResult({chosenId:winnerId,otherId:loserId,nextLo,nextHi});
    if(userId&&session) await API.recordPairwise(userId,winnerId,loserId,session);
  };

  const advance=()=>{
    const {nextLo,nextHi}=result;
    setResult(null);
    if(nextLo>=nextHi){setInsertPos(nextLo);setDone(true);}
    else{setLo(nextLo);setHi(nextHi);}
  };

  const handleSave=async(localEloFinal,finalIds)=>{
    if(userId&&session){
      const score=Math.min(10,Math.max(1,Math.round((localEloFinal[newMovie.id]-1400)/20)));
      await API.addRanking(userId,newMovie.id,score,session);
    }
    onComplete(localEloFinal,finalIds);
  };

  if(done&&insertPos!==null){
    const finalIds=[...rankedIds];
    finalIds.splice(insertPos,0,newMovie.id);
    const ranked=finalIds.map(id=>MOVIES.find(m=>m.id===id)).filter(Boolean);
    return (
      <div style={{height:"100%",overflowY:"auto"}}>
        <div style={{padding:"8px 22px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>⚡ RANKED!</span>
          <div onClick={onCancel} style={{fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>✕</div>
        </div>
        <div style={{padding:"0 22px 20px"}}>
          <div style={{textAlign:"center",padding:"14px 0 10px"}}><div style={{fontSize:28}}>🏆</div><div style={{fontSize:13,fontWeight:900,color:W.gold,fontFamily:"monospace",marginTop:6}}>{newMovie.title} added!</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:3}}>Landed at #{insertPos+1}</div></div>
          <div style={{fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:8}}>YOUR UPDATED RANKINGS</div>
          {ranked.map((m,i)=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",marginBottom:5,borderRadius:10,border:`1px solid ${m.id===newMovie.id?W.accent+"66":W.border}`,background:m.id===newMovie.id?W.accentDim:i===0?W.goldDim:W.card}}>
              <span style={{fontSize:i<3?13:10,width:20,textAlign:"center",fontFamily:"monospace",fontWeight:900,color:W.dim,flexShrink:0}}>{i<3?["🥇","🥈","🥉"][i]:i+1}</span>
              <Poster url={m.poster_url} title={m.title} w={28} h={38} radius={4}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:m.id===newMovie.id?W.accent:W.text,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.title}</div></div>
              {m.id===newMovie.id&&<Badge color="red">NEW</Badge>}
              <div style={{fontSize:9,color:W.blue,fontFamily:"monospace",fontWeight:700,flexShrink:0}}>{localElo[m.id]||1500}</div>
            </div>
          ))}
          <div onClick={()=>handleSave(localElo,finalIds)} style={{marginTop:10,background:W.accent,borderRadius:12,padding:"13px",textAlign:"center",fontSize:12,fontWeight:900,color:"#fff",fontFamily:"monospace",cursor:"pointer"}}>SAVE TO PROFILE →</div>
        </div>
      </div>
    );
  }

  if(!opponent) return null;
  const chosen=result?MOVIES.find(m=>m.id===result.chosenId):null;
  const other=result?MOVIES.find(m=>m.id===result.otherId):null;
  const totalComps=Math.max(1,Math.ceil(Math.log2(rankedIds.length+1)));

  return (
    <div style={{height:"100%",overflowY:"auto"}}>
      <div style={{padding:"8px 22px 6px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace"}}>⚡ RANK IT</span>
        <div onClick={onCancel} style={{fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer"}}>✕ Cancel</div>
      </div>
      <div style={{padding:"0 22px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{background:`linear-gradient(135deg,${W.accent}10,${W.accent}04)`,border:`1px solid ${W.accent}33`,borderRadius:14,padding:"10px 14px",display:"flex",gap:12,alignItems:"center"}}>
          <Poster url={newMovie.poster_url} w={40} h={56} radius={6}/>
          <div><div style={{fontSize:8,color:W.accent,fontFamily:"monospace",fontWeight:700,letterSpacing:1}}>PLACING IN YOUR LIST</div><div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2}}>{newMovie.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace"}}>{newMovie.release_year} · {newMovie.directors?.[0]?.name}</div></div>
        </div>
        <div style={{textAlign:"center"}}><div style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1}}>WHICH DO YOU PREFER?</div><div style={{fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:2}}>~{totalComps} comparisons · {hi-lo} remaining</div></div>
        {!result?(
          <div role="radiogroup" aria-label={`Choose which movie you prefer: ${newMovie.title} or ${opponent.title}`} style={{display:"flex",gap:10}}>
            {[newMovie,opponent].map(m=>(
              <TapTarget key={m.id} role="radio" aria-checked="false" onClick={()=>pick(m.id)} label={`Pick ${m.title} over ${m.id===newMovie.id?opponent.title:newMovie.title}`} minTap={false}
                style={{flex:1,background:W.card,border:`1px solid ${W.border}`,borderRadius:16,padding:12,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <Poster url={m.poster_url} title={m.title} w={100} h={140} radius={10}/>
                <div style={{textAlign:"center"}}><div style={{fontSize:11,fontWeight:800,color:W.text,fontFamily:"monospace",lineHeight:1.3}}>{m.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>{m.release_year}</div>{m.id!==newMovie.id&&<div style={{fontSize:8,color:W.blue,fontFamily:"monospace",marginTop:3,fontWeight:700}}>#{rankedIds.indexOf(m.id)+1} in your list</div>}{m.id===newMovie.id&&<div style={{fontSize:8,color:W.accent,fontFamily:"monospace",marginTop:3,fontWeight:700}}>NEW</div>}</div>
                <div aria-hidden="true" style={{background:W.accentDim,border:`1px solid ${W.accent}44`,borderRadius:10,padding:"7px 0",width:"100%",textAlign:"center",fontSize:10,fontWeight:900,color:W.accent,fontFamily:"monospace"}}>THIS ONE ▶</div>
              </TapTarget>
            ))}
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:W.greenDim,border:`1px solid ${W.green}44`,borderRadius:14,padding:14,display:"flex",gap:12,alignItems:"center"}}><Poster url={chosen.poster_url} w={48} h={66} radius={8}/><div><div style={{fontSize:8,color:W.green,fontFamily:"monospace",fontWeight:700,letterSpacing:1}}>✓ YOU PREFERRED</div><div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2}}>{chosen.title}</div><div style={{fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2}}>Narrowing down further…</div></div></div>
            <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:14,display:"flex",gap:12,alignItems:"center",opacity:0.6}}><Poster url={other.poster_url} w={48} h={66} radius={8}/><div><div style={{fontSize:8,color:W.dim,fontFamily:"monospace",fontWeight:700,letterSpacing:1}}>✗ NOT THIS TIME</div><div style={{fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2}}>{other.title}</div></div></div>
            <TapTarget onClick={advance} label={result.nextLo>=result.nextHi?"Finish ranking":"Next comparison"} minTap={false}
              style={{background:W.accent,borderRadius:12,padding:"13px",textAlign:"center",fontSize:12,fontWeight:900,color:"#fff",fontFamily:"monospace",display:"flex",alignItems:"center",justifyContent:"center",minHeight:48}}>
              {result.nextLo>=result.nextHi?"FINISH RANKING →":"NEXT COMPARISON →"}
            </TapTarget>
          </div>
        )}
        {!result&&rankedIds.length>0&&<div style={{marginTop:4}}><div style={{height:3,background:W.border,borderRadius:2}}><div style={{height:"100%",background:W.accent,borderRadius:2,width:`${Math.max(5,100-((hi-lo)/Math.max(rankedIds.length,1)*100))}%`,transition:"width 0.3s"}}/></div></div>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY — catches render crashes and shows friendly fallback
// ─────────────────────────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={hasError:false, error:null};
  }
  static getDerivedStateFromError(error){
    return {hasError:true, error};
  }
  componentDidCatch(error, info){
    // In production: log to a service like Sentry here
    console.error("ErrorBoundary caught:", error, info);
  }
  handleReload=()=>{
    this.setState({hasError:false, error:null});
    // Force a remount by changing the key if needed
    if(typeof window!=="undefined") window.location.reload();
  };
  render(){
    if(this.state.hasError){
      return (
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",background:W.bg}}>
          <div style={{background:W.card,border:`1px solid ${W.border}`,borderRadius:18,padding:"24px 20px",maxWidth:380,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:10}}>💥</div>
            <div style={{fontSize:15,fontWeight:900,color:W.text,fontFamily:"monospace",marginBottom:6}}>Something went wrong</div>
            <div style={{fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6,marginBottom:18}}>
              The app hit an unexpected error. Your data is safe — try reloading.
            </div>
            <div onClick={this.handleReload} style={{background:W.accent,color:"#fff",borderRadius:12,padding:"11px",textAlign:"center",fontSize:12,fontWeight:700,fontFamily:"monospace",cursor:"pointer"}}>
              Reload App
            </div>
            {this.state.error?.message&&<div style={{marginTop:14,padding:"8px 10px",background:W.bg,borderRadius:8,fontSize:9,color:W.dim,fontFamily:"monospace",textAlign:"left",opacity:0.7}}>
              {String(this.state.error.message).slice(0,140)}
            </div>}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────────────────────────────────────

// Small helper shown when rank screen is opened for a film that's already ranked.
// Flips navigation state inside useEffect instead of during render (avoids React warning).
const AlreadyRankedFallback = ({ onDone }) => {
  useEffect(()=>{
    const t = setTimeout(onDone, 400);
    return ()=>clearTimeout(t);
  },[onDone]);
  return (
    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
      <div style={{fontSize:24}}>✓</div>
      <div style={{fontSize:11,color:W.green,fontFamily:"monospace"}}>Already ranked!</div>
    </div>
  );
};

function AppInner() {
  const [authState,setAuthState]=useState("logged-out");
  const [loginProvider,setLoginProvider]=useState(null);
  const [session,setSession]=useState(null);
  const [userId,setUserId]=useState(null);
  const [username,setUsername]=useState("");
  // Track when username was last changed for the 30-day rate limit
  const [lastUsernameChangeTs,setLastUsernameChangeTs]=useState(null);
  const [displayName,setDisplayName]=useState("");
  const [userBio,setUserBio]=useState("");
  const [profilePic,setProfilePic]=useState(null); // base64 data URL
  const [isPrivate,setIsPrivate]=useState(false);
  const [unreadCount,setUnreadCount]=useState(3);
  // Theme: "dark" | "light" | "system" (follows OS)
  const [themeMode,setThemeModeState]=useState("dark");
  // Dynamic type scale: 0.9 | 1.0 | 1.15 | 1.3
  const [fontScale,setFontScaleState]=useState(1.0);
  const online = useOnlineStatus();
  useMinuteTick(); // tick so relative times refresh
  useKeyboardAvoidance();
  // Apply theme + scale synchronously on every render. Since these values mutate module-level
  // vars that the W Proxy reads, we must set them BEFORE any component reads W this render.
  // State changes to themeMode/fontScale already trigger re-render, so no forced key remount needed.
  const effectiveTheme = themeMode==="system"
    ? (typeof window!=="undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : themeMode;
  setActiveTheme(effectiveTheme);
  setTypeScale(fontScale);
  const setThemeMode = useCallback((m)=>{haptic("light");setThemeModeState(m);},[]);
  const setFontScale = useCallback((s)=>{haptic("light");setFontScaleState(s);},[]);
  // Toast state lives near the top of AppInner because callbacks below
  // (toggleSavedMovie, follow handlers) close over showToast and would
  // otherwise hit a TDZ error.
  const [toast,setToast]=useState(null); // {msg, tone}
  const toastTimeoutRef = useRef(null);
  const showToast=useCallback((msg,tone="ok")=>{
    setToast({msg,tone});
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(()=>{setToast(null);toastTimeoutRef.current=null;}, 2600);
  },[]);
  // Clean up pending toast timeout on unmount
  useEffect(()=>()=>{if(toastTimeoutRef.current)clearTimeout(toastTimeoutRef.current);},[]);
  const [screen,setScreen]=useState("home");
  const [selectedMovie,setSelectedMovie]=useState(null);
  const [selectedUpcoming,setSelectedUpcoming]=useState(null);
  const [selectedUser,setSelectedUser]=useState(null);
  const [rankMovie,setRankMovie]=useState(null);
  const [rankedIds,setRankedIds]=useState([]);
  const [eloScores,setEloScores]=useState({});
  // Rank history — each entry {movieId, ts}. Drives the streak counter.
  // Persisted to localStorage so streak survives page reload.
  const [rankHistory, setRankHistory] = useState(() => {
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem("rated:rankHistory");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Sanity check — must be an array of {movieId, ts}
      return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.ts === "number") : [];
    } catch(_) { return []; }
  });
  // Persist rank history whenever it changes
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("rated:rankHistory", JSON.stringify(rankHistory));
      }
    } catch(_) {}
  }, [rankHistory]);
  // Compute streak on every render — cheap, pure function of rankHistory
  const streakInfo = computeStreak(rankHistory);
  const [watchlist,setWatchlist]=useState(new Set());
  // Reviews the current user has written — each: {movie_id, movie_title, rating, text, time, ts}
  const [userReviews,setUserReviews]=useState([]);
  // Activity the current user has generated (ranking, reviews) — prepended to feed
  const [userFeedItems,setUserFeedItems]=useState([]);
  // Global saved movies — shared across Home, Profile, MovieDetail
  const [savedMovies,setSavedMovies]=useState(new Set(["m-001","m-002","m-005"]));
  // Toggle a movie in the user's saved/bookmarked set. Optimistic update
  // (UI flips first, network call follows). Falls back to local-only when not
  // logged in. Rolls back if the backend call fails so UI matches truth.
  const toggleSavedMovie=useCallback(async(id)=>{
    haptic("light");
    const wasSaved = savedMovies.has(id);
    setSavedMovies(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
    if (!userId || !session) return; // local-only mode
    const result = wasSaved
      ? await API.removeSaved(userId, id, session)
      : await API.addSaved(userId, id, session);
    if (result === null) {
      // Backend write failed — revert
      setSavedMovies(p=>{const n=new Set(p);wasSaved?n.add(id):n.delete(id);return n;});
      showToast(wasSaved ? "Couldn't unsave" : "Couldn't save", "error");
    }
  },[savedMovies, userId, session, showToast]);
  // Global likes state — {feedItemId: boolean}, shared so likes persist across navigation
  const [feedLikes,setFeedLikes]=useState({});
  const toggleFeedLike=useCallback((itemId)=>{
    haptic("light");
    setFeedLikes(p=>({...p,[itemId]:!p[itemId]}));
  },[]);
  // Recent search history — most recent first, deduped, capped at 10
  const [searchHistory,setSearchHistory]=useState([]);
  const addSearchHistory=useCallback((q)=>{
    if(!q||q.trim().length<2) return;
    const trimmed=q.trim();
    setSearchHistory(p=>{
      const filtered=p.filter(x=>x.toLowerCase()!==trimmed.toLowerCase());
      return [trimmed,...filtered].slice(0,10);
    });
  },[]);
  const clearSearchHistory=useCallback(()=>setSearchHistory([]),[]);
  const removeSearchHistoryItem=useCallback((q)=>{
    setSearchHistory(p=>p.filter(x=>x!==q));
  },[]);
  // Global following set — handles like "@josh" that the current user follows
  const [followingHandles,setFollowingHandles]=useState(()=>{
    const s=new Set();
    MOCK_FRIENDS.forEach(f=>{if(f.is_following)s.add(`@${f.username}`);});
    return s;
  });
  // Toggle follow state for a user (by @handle). Optimistic UI update then
  // calls the backend. Backend needs the target's user_id (UUID), so we first
  // look it up via /users/by-username/{handle}, then call follow/unfollow.
  // If the backend lookup or write fails, roll back the optimistic change.
  const toggleFollowHandle=useCallback(async(handle)=>{
    const wasFollowing = followingHandles.has(handle);
    // Optimistic flip
    setFollowingHandles(p=>{
      const n=new Set(p);
      if(n.has(handle)) n.delete(handle);
      else n.add(handle);
      return n;
    });
    // Backend write — only if logged in
    if (!userId || !session) return;
    // Strip @ prefix for username lookup
    const cleanHandle = handle.replace(/^@/, "");
    const target = await API.getUserByUsername(cleanHandle, session);
    if (!target || !target.user_id) {
      // Target user doesn't exist in backend — that's OK for mock data, leave UI as-is
      return;
    }
    const result = wasFollowing
      ? await API.unfollow(userId, target.user_id, session)
      : await API.follow(userId, target.user_id, session);
    if (result === null) {
      // Backend write failed — roll back the optimistic flip
      setFollowingHandles(p=>{
        const n=new Set(p);
        if(wasFollowing) n.add(handle);
        else n.delete(handle);
        return n;
      });
      showToast(wasFollowing ? "Couldn't unfollow" : "Couldn't follow", "error");
    }
  },[followingHandles, userId, session, showToast]);
  const [blockedUsers,setBlockedUsers]=useState(new Set()); // Set of @handles
  // Local-only record of reports submitted by this user. Wire up to a real
  // /reports endpoint when moderation backend lands.
  const [reportedItems,setReportedItems]=useState([]);
  // Users whose follow requests you've approved — they follow you (boosts your followers count)
  const [approvedFollowers,setApprovedFollowers]=useState(new Set());
  const approveFollower=useCallback((handle)=>{
    setApprovedFollowers(p=>{const n=new Set(p);n.add(handle);return n;});
  },[]);
  // Follow rate limit tracking — array of timestamps in last hour
  const [followTimestamps,setFollowTimestamps]=useState([]);

  // Returns null if follow is allowed, else returns a formatted "try again in X" message
  const checkFollowLimit=useCallback(()=>{
    const now = Date.now();
    const recent = followTimestamps.filter(t=>now-t<FOLLOW_WINDOW_MS);
    if (recent.length >= FOLLOW_LIMIT_PER_HOUR) {
      const oldestRecent = Math.min(...recent);
      const msLeft = FOLLOW_WINDOW_MS - (now - oldestRecent);
      const minLeft = Math.ceil(msLeft / 60000);
      return `Follow limit reached (${FOLLOW_LIMIT_PER_HOUR}/hour). Try again in ${minLeft} minute${minLeft===1?"":"s"}.`;
    }
    return null;
  },[followTimestamps]);

  const recordFollow=useCallback(()=>{
    const now = Date.now();
    setFollowTimestamps(p=>[...p.filter(t=>now-t<FOLLOW_WINDOW_MS),now]);
  },[]);

  // Wrapped follow action — checks limit, records timestamp, shows toast on block
  const rateLimitedFollow=useCallback((callback)=>{
    const limitMsg = checkFollowLimit();
    if (limitMsg) {
      showToast(limitMsg, "err");
      return false;
    }
    recordFollow();
    callback&&callback();
    return true;
  },[checkFollowLimit, recordFollow, showToast]);
  const blockUser=useCallback((handle)=>{
    setBlockedUsers(p=>{const n=new Set(p);n.add(handle);return n;});
    // A block implies an unfollow — you can't follow someone you're blocking
    setFollowingHandles(p=>{
      if (!p.has(handle)) return p;
      const n=new Set(p);n.delete(handle);return n;
    });
    // Also remove them from your approved followers — they can't follow you anymore
    setApprovedFollowers(p=>{
      if (!p.has(handle)) return p;
      const n=new Set(p);n.delete(handle);return n;
    });
    showToast(`Blocked ${handle} · They can no longer see or follow you`,"ok");
  },[showToast]);
  const unblockUser=useCallback((handle)=>{
    setBlockedUsers(p=>{const n=new Set(p);n.delete(handle);return n;});
    showToast(`Unblocked ${handle}`,"ok");
  },[showToast]);
  const reportContent=useCallback((type,targetId,targetLabel,reason)=>{
    setReportedItems(p=>[...p,{type,targetId,targetLabel,reason,time:Date.now()}]);
    // NOTE: this is a local-only record until the backend /reports endpoint is wired up.
    // The toast copy avoids claiming a specific review timeline.
    showToast(`Report received`,"ok");
  },[showToast]);

  // Navigation history stack. Each entry is a snapshot the user can return to.
  // { screen, selectedMovie, selectedUpcoming, selectedUser, settingsSection }
  const navStack = useRef([]);
  const snapshotNav = useCallback(()=>({
    screen, selectedMovie, selectedUpcoming, selectedUser, settingsSection:null,
  }),[screen, selectedMovie, selectedUpcoming, selectedUser]);
  const pushNav = useCallback(()=>{ navStack.current.push(snapshotNav()); },[snapshotNav]);
  const popNav = useCallback(()=>{
    const prev = navStack.current.pop();
    if (!prev) return false;
    setScreen(prev.screen);
    setSelectedMovie(prev.selectedMovie||null);
    setSelectedUpcoming(prev.selectedUpcoming||null);
    setSelectedUser(prev.selectedUser||null);
    return true;
  },[]);

  const onNav=useCallback(s=>{
    // Tapping a nav tab is a fresh top-level destination — clear history and selections
    navStack.current = [];
    setScreen(s);setSelectedMovie(null);setSelectedUpcoming(null);setRankMovie(null);setSelectedUser(null);
  },[]);
  const onSelectMovie=useCallback(m=>{pushNav();setSelectedMovie(m);setSelectedUpcoming(null);setSelectedUser(null);setScreen("detail");},[pushNav]);
  const onSelectUpcoming=useCallback(u=>{pushNav();setSelectedUpcoming(u);setSelectedMovie(null);setSelectedUser(null);setScreen("upcoming-detail");},[pushNav]);
  const onSelectUser=useCallback(u=>{pushNav();setSelectedUser(u);setScreen("user-profile");},[pushNav]);
  // All "back" actions now pop the history stack, falling back to a safe default if empty
  const onBack=useCallback(()=>{
    if (!popNav()) { setScreen("home"); setSelectedMovie(null); setSelectedUpcoming(null); }
  },[popNav]);
  const onBackToUpcoming=useCallback(()=>{
    if (!popNav()) { setScreen("upcoming"); setSelectedUpcoming(null); }
  },[popNav]);
  const onBackFromUser=useCallback(()=>{
    if (!popNav()) { setScreen("leaderboard"); setSelectedUser(null); }
  },[popNav]);
  const [settingsSection,setSettingsSection]=useState(null);
  const onOpenSettings=useCallback((section=null)=>{setSettingsSection(section);setScreen("settings");},[]);

  // Submit a new review (or update one if user already reviewed this movie).
  // Optimistic local update first, then backend write. If backend fails, roll back.
  const handleSubmitReview=useCallback(async(review)=>{
    const ts = Date.now();
    const localReview = {...review, ts};
    setUserReviews(p=>[localReview, ...p]);
    // Add feed item locally so home feed shows it immediately
    if (username) {
      setUserFeedItems(p=>[{
        id:`self-review-${ts}`,
        type:"review",
        user:`@${username}`,
        avatar:(displayName||username||"Y")[0].toUpperCase(),
        action:"reviewed",
        movie_title:review.movie_title,
        movie_id:review.movie_id,
        preview:review.text,
        rating:review.rating,
        time:"just now",
        ts,
        likes:0,
        liked:false,
      }, ...p]);
    }
    // Backend write
    if (userId && session) {
      const result = await API.submitReview(userId, review.movie_id, review.rating, review.text, session);
      if (result === null) {
        // Roll back both local stores
        setUserReviews(p=>p.filter(r=>r.ts!==ts));
        setUserFeedItems(p=>p.filter(f=>f.id!==`self-review-${ts}`));
        showToast("Couldn't post review", "error");
      }
    }
  },[username, displayName, userId, session, showToast]);

  // Edit review — finds by ts (stable local id), translates to movie_id for the
  // backend (which keys reviews by user_id + movie_id, not by ts). Backend's
  // submit endpoint is upsert: re-submitting with same movie_id replaces.
  const handleEditReview=useCallback(async(ts, newText, newRating)=>{
    let movieId = null;
    setUserReviews(p=>{
      const found = p.find(r=>r.ts===ts);
      if (found) movieId = found.movie_id;
      return p.map(r=>r.ts===ts?{...r, text:newText, rating:newRating, edited:true}:r);
    });
    setUserFeedItems(p=>p.map(f=>f.id===`self-review-${ts}`?{...f, preview:newText, rating:newRating}:f));
    // Backend upsert (will mark edited_at)
    if (userId && session && movieId) {
      const result = await API.submitReview(userId, movieId, newRating, newText, session);
      if (result === null) {
        showToast("Couldn't save changes", "error");
      }
    }
  },[userId, session, showToast]);

  // Delete review — find movie_id from local store, then backend delete.
  const handleDeleteReview=useCallback(async(ts)=>{
    let movieId = null;
    setUserReviews(p=>{
      const found = p.find(r=>r.ts===ts);
      if (found) movieId = found.movie_id;
      return p.filter(r=>r.ts!==ts);
    });
    setUserFeedItems(p=>p.filter(f=>f.id!==`self-review-${ts}`));
    if (userId && session && movieId) {
      const result = await API.deleteReview(userId, movieId, session);
      if (result === null) {
        showToast("Couldn't delete review", "error");
      }
    }
  },[userId, session, showToast]);

  const handleUnrank=useCallback((movieId)=>{
    setRankedIds(p=>p.filter(id=>id!==movieId));
    setEloScores(p=>{const n={...p}; delete n[movieId]; return n;});
    // Also remove any feed items about this ranking
    setUserFeedItems(p=>p.filter(f=>!(f.movie_id===movieId && f.type==="ranking")));
  },[]);

  const handleReorderRanking=useCallback((movieId, newIndex)=>{
    setRankedIds(p=>{
      const filtered = p.filter(id=>id!==movieId);
      const clamped = Math.max(0, Math.min(newIndex, filtered.length));
      filtered.splice(clamped, 0, movieId);
      return filtered;
    });
  },[]);
  const handleDeleteAccount=useCallback(()=>{
    // In production: call DELETE /users/me API here.
    // Then wipe all local state and return to logged-out.
    setAuthState("logged-out");
    setLoginProvider(null);
    setSession(null);
    setUserId(null);
    setUsername("");
    setDisplayName("");
    setUserBio("");
    setProfilePic(null);
    setIsPrivate(false);
    setRankedIds([]);
    setEloScores({});
    setRankHistory([]);
    setWatchlist(new Set());
    setUserReviews([]);
    setUserFeedItems([]);
    setSearchHistory([]);
    setSavedMovies(new Set());
    setFeedLikes({});
    setFollowingHandles(new Set());
    setBlockedUsers(new Set());
    setApprovedFollowers(new Set());
    setReportedItems([]);
    setFollowTimestamps([]);
    setLastUsernameChangeTs(null);
    setUnreadCount(0);
    setScreen("home");
    setSettingsSection(null);
    navStack.current = [];
  },[]);
  const onBackFromSettings=useCallback(()=>{setSettingsSection(null);setScreen("profile");},[]);
  const onRank=useCallback(m=>{setRankMovie(m);setScreen("rank");},[]);
  // Re-rank: clear the existing ranking + ELO for this movie, then enter rank flow again.
  // Used by the Profile → Rankings → Edit mode ↻ button.
  const onReRank=useCallback((m)=>{
    if (!m) return;
    setRankedIds(p=>p.filter(id=>id!==m.id));
    setEloScores(p=>{const n={...p};delete n[m.id];return n;});
    // Also remove any "ranked" feed item for this movie so the new rank posts fresh activity
    setUserFeedItems(p=>p.filter(f=>!(f.movie_id===m.id && f.type==="ranking")));
    setRankMovie(m);
    setScreen("rank");
  },[]);
  const onRankComplete=useCallback((elo,ids)=>{
    setEloScores(elo);
    // Detect the newly added movie by comparing against prior rankedIds
    setRankedIds(prev=>{
      const newId = ids.find(id=>!prev.includes(id));
      if(newId){
        const movie = MOVIES.find(m=>m.id===newId);
        if(movie){
          const ts = Date.now();
          // Record this rank in history for the streak counter
          setRankHistory(h => [...h, { movieId: newId, ts }]);
          // Compute the rank position (1-based) and total count for display on the feed
          const rankPosition = ids.indexOf(newId) + 1;
          const totalRanked = ids.length;
          // Derive a user-facing score (1-10 scale) from the rank position
          const score = Math.max(1, Math.min(10, 10 - Math.round((rankPosition-1)/Math.max(totalRanked-1,1)*9)));
          setUserFeedItems(p=>[{
            id:`self-rank-${ts}`,
            type:"ranking",
            user:username?`@${username}`:"@you",
            avatar:(displayName||username||"Y")[0].toUpperCase(),
            action:"ranked a new film",
            movie_title:movie.title,
            movie_id:movie.id,
            preview:`Ranked #${rankPosition} of ${totalRanked}`,
            rank_position:rankPosition,
            total_ranked:totalRanked,
            rating:score,
            time:"just now",
            ts,
            likes:0,
            liked:false,
          }, ...p]);
        }
      }
      return ids;
    });
    setRankMovie(null);
    setScreen("profile");
  },[username, displayName]);
  const onRankCancel=useCallback(()=>{setRankMovie(null);setScreen(selectedMovie?"detail":"home");},[selectedMovie]);

  // Toggle a movie in the user's watchlist. Optimistic update — UI flips immediately,
  // then we hit the backend. If the backend call fails, roll back the local change
  // and show a toast so the user knows something went wrong.
  const onToggleWatchlist=useCallback(async(id)=>{
    const has = watchlist.has(id);
    // Optimistic: update UI first so the tap feels instant
    setWatchlist(p=>{const n=new Set(p);has?n.delete(id):n.add(id);return n;});
    if (!userId || !session) return; // not logged in — local state only
    const result = has
      ? await API.removeWatchlist(userId, id, session)
      : await API.addWatchlist(userId, id, session);
    if (result === null) {
      // Backend unreachable — roll back the optimistic change
      setWatchlist(p=>{const n=new Set(p);has?n.add(id):n.delete(id);return n;});
      showToast(has ? "Couldn't remove from watchlist" : "Couldn't add to watchlist", "error");
    }
  },[userId, session, watchlist, showToast]);

  const handleLogin=async(provider)=>{
    setLoginProvider(provider);
    // Stub login token — format: "sub|name|email" matches backend's AuthService.google_login.
    // Each provider gets a distinct sub so they're treated as different users in the backend.
    const stub = provider==="apple"
      ? "sub_apple_demo|Apple User|user@icloud.com"
      : "sub_google_demo|Google User|user@gmail.com";
    const res = await API.login(stub);
    if (res && res.user) {
      // Backend created/found a user. Save session + user_id for all future API calls.
      setSession(res.session_token);
      setUserId(res.user_id);
      // For now always go to username chooser. Later we'll skip if user already has one.
      setAuthState("choosing-username");
    } else {
      // Backend unreachable or returned an error. Show a toast so user knows.
      showToast("Couldn't connect to server. Make sure the backend is running.", "error");
    }
  };

  const handleUsernameComplete=(u, name)=>{setUsername(u);if(name)setDisplayName(name);setAuthState("logged-in");};

  // Load watchlist from backend on login. The backend's GET /users/{id}/watchlist
  // returns an array of movie_ids directly (not wrapped in an object). If the API
  // is unreachable, getWatchlist returns null and we leave the local Set as-is.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getWatchlist(userId,session).then(data=>{
        if(Array.isArray(data)) setWatchlist(new Set(data));
      });
    }
  },[authState,userId,session]);

  // Load saved/bookmarked movies the same way.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getSaved(userId,session).then(data=>{
        if(Array.isArray(data)) setSavedMovies(new Set(data));
      });
    }
  },[authState,userId,session]);

  // Load user's written reviews on login. Backend returns objects with
  // {user_id, movie_id, rating, text, created_at, edited_at, edited}.
  // We translate to the local shape (ts as the unique id, movie_title looked up).
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getUserReviews(userId,session).then(data=>{
        if(!Array.isArray(data)) return;
        const reviews = data.map(r=>{
          // Backend stores movie_id only; resolve title via local lookup.
          const movie = findMovieSync(r.movie_id);
          return {
            ts: Math.floor((r.created_at || 0) * 1000) || Date.now(),
            movie_id: r.movie_id,
            movie_title: movie?.title || r.movie_id,
            rating: r.rating,
            text: r.text,
            edited: !!r.edited,
          };
        });
        setUserReviews(reviews);
      });
    }
  },[authState,userId,session]);

  // Load rankings from backend on login. The backend returns an array of
  // {user, movie, score, ranked_at} objects sorted by score (highest first).
  // We extract the movie_ids in order and the score map, mirroring the local
  // structure (rankedIds, eloScores) so the rest of the app needs no changes.
  useEffect(()=>{
    if(authState==="logged-in"&&userId&&session){
      API.getRankings(userId,session).then(data=>{
        if(Array.isArray(data) && data.length > 0){
          // Backend already returns rankings sorted highest-score-first
          const ids = data.map(r => r.movie?.movie_id).filter(Boolean);
          // Convert backend's 1-10 score back to ELO-ish range used locally
          // (each score point ≈ 20 ELO; midpoint 1500 = score ~5)
          const scores = {};
          data.forEach(r => {
            if (r.movie?.movie_id && typeof r.score === "number") {
              scores[r.movie.movie_id] = 1400 + r.score * 20;
            }
          });
          setRankedIds(ids);
          setEloScores(scores);
        }
      });
    }
  },[authState,userId,session]);

  const activeNav=()=>{if(["detail","rank"].includes(screen))return"home";if(screen==="upcoming-detail")return"upcoming";return screen;};
  const navLabel=()=>{if(authState==="logged-out")return"Sign In";if(authState==="choosing-username")return"Create Username";if(screen==="detail")return selectedMovie?.title||"Detail";if(screen==="upcoming-detail")return selectedUpcoming?.title||"Upcoming";if(screen==="rank")return"Ranking";return screen;};

  const content=()=>{
    if(authState==="logged-out") return <LoginScreen onLogin={handleLogin}/>;
    if(authState==="choosing-username") return <UsernameScreen provider={loginProvider} session={session} onComplete={handleUsernameComplete}/>;
    if(screen==="home") return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie} session={session} userId={userId} username={username} unreadCount={unreadCount} blockedUsers={blockedUsers} blockUser={blockUser} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} onSelectUser={onSelectUser} userFeedItems={userFeedItems} onRank={onRank} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} feedLikes={feedLikes} toggleFeedLike={toggleFeedLike} showToast={showToast}/>;
    if(screen==="detail") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><MovieDetailScreen movie={selectedMovie} onBack={onBack} onRank={onRank} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} followingHandles={followingHandles} onSelectUser={onSelectUser} onSubmitReview={handleSubmitReview} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} showToast={showToast}/></div></div>;
    if(screen==="upcoming") return <UpcomingScreen onNav={onNav} onSelectUpcoming={onSelectUpcoming} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist}/>;
    if(screen==="upcoming-detail") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><MovieDetailScreen movie={selectedUpcoming} onBack={onBackToUpcoming} isUpcoming={true} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} showToast={showToast}/></div></div>;
    if(screen==="leaderboard") return <LeaderboardScreen onNav={onNav} onSelectMovie={onSelectMovie} onSelectUser={onSelectUser} username={username} displayName={displayName} blockedUsers={blockedUsers} myRankedCount={rankedIds.length} myStreak={streakInfo.count}/>;
    if(screen==="user-profile") return <div style={{display:"flex",flexDirection:"column",height:"100%"}}><div style={{flex:1,overflowY:"auto"}}><UserProfileScreen user={selectedUser} onBack={onBackFromUser} onSelectMovie={onSelectMovie} blockedUsers={blockedUsers} blockUser={blockUser} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle}/></div></div>;
    if(screen==="search") return <SearchScreen onNav={onNav} onSelectMovie={onSelectMovie} onSelectUser={onSelectUser} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} rateLimitedFollow={rateLimitedFollow} searchHistory={searchHistory} addSearchHistory={addSearchHistory} clearSearchHistory={clearSearchHistory} removeSearchHistoryItem={removeSearchHistoryItem} username={username} showToast={showToast}/>;
    if(screen==="notifications") return <NotificationsScreen onNav={onNav} isPrivate={isPrivate} onMarkAllRead={()=>setUnreadCount(0)} blockedUsers={blockedUsers} toggleFollowHandle={toggleFollowHandle} followingHandles={followingHandles} approveFollower={approveFollower} onSelectUser={onSelectUser} rateLimitedFollow={rateLimitedFollow}/>;
    if(screen==="profile") return <ProfileScreen onNav={onNav} onSelectMovie={onSelectMovie} rankedIds={rankedIds} eloScores={eloScores} watchlist={watchlist} onSelectUpcoming={onSelectUpcoming} onToggleWatchlist={onToggleWatchlist} username={username} displayName={displayName} userBio={userBio} profilePic={profilePic} isPrivate={isPrivate} onOpenSettings={onOpenSettings} session={session} userId={userId} reportContent={reportContent} rateLimitedFollow={rateLimitedFollow} followingHandles={followingHandles} toggleFollowHandle={toggleFollowHandle} approvedFollowers={approvedFollowers} userReviews={userReviews} onUnrank={handleUnrank} onReorderRanking={handleReorderRanking} onRank={onRank} onReRank={onReRank} savedMovies={savedMovies} toggleSavedMovie={toggleSavedMovie} onEditReview={handleEditReview} onDeleteReview={handleDeleteReview} showToast={showToast} streakInfo={streakInfo}/>;
    if(screen==="settings") return <SettingsScreen onBack={onBackFromSettings} username={username} displayName={displayName} userBio={userBio} profilePic={profilePic} isPrivate={isPrivate} onUpdateUsername={setUsername} onUpdatePrivacy={setIsPrivate} onUpdateDisplayName={setDisplayName} onUpdateBio={setUserBio} onUpdateProfilePic={setProfilePic} initialSection={settingsSection} blockedUsers={blockedUsers} onUnblock={unblockUser} onDeleteAccount={handleDeleteAccount} themeMode={themeMode} fontScale={fontScale} onSetThemeMode={setThemeMode} onSetFontScale={setFontScale} lastUsernameChangeTs={lastUsernameChangeTs} onUsernameChanged={()=>setLastUsernameChangeTs(Date.now())} showToast={showToast}/>;
    if(screen==="rank"&&rankMovie){
      if(rankedIds.includes(rankMovie.id)){
        // Edge case — should rarely trigger since onReRank clears first.
        // Use a tiny inline component so the state-flip happens in useEffect, not during render.
        return <AlreadyRankedFallback onDone={()=>{setScreen("detail");setRankMovie(null);}}/>;
      }
      return <RankScreen newMovie={rankMovie} rankedIds={rankedIds} eloScores={eloScores} onComplete={onRankComplete} onCancel={onRankCancel} session={session} userId={userId}/>;
    }
    return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie} session={session} userId={userId}/>;
  };

  return (
    <div style={{minHeight:"100vh",background:themeMode==="light"?"#e5e5ec":"#08080b",padding:"20px 12px 40px",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center",marginBottom:16}}>
        <h1 style={{fontSize:26,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1,margin:0,textShadow:`0 0 30px ${W.accent}33`}}>RATED</h1>
        <p style={{fontSize:9,color:W.dim,fontFamily:"monospace",margin:"4px 0 0",letterSpacing:3}}>DATA-DRIVEN PROTOTYPE · ENTITY → UI</p>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginBottom:20,maxWidth:560,margin:"0 auto 20px"}}>
        {authState==="logged-in"
          ?Object.entries({home:"Home",upcoming:"Upcoming",search:"Search",leaderboard:"Board",profile:"Profile"}).map(([k,v])=>(
              <button key={k} onClick={()=>onNav(k)} style={{padding:"5px 11px",borderRadius:8,fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:`1px solid ${activeNav()===k?W.accent:W.border}`,background:activeNav()===k?W.accentDim:"transparent",color:activeNav()===k?W.accent:W.dim}}>{v}</button>
            ))
          :<button onClick={()=>setAuthState("logged-out")} style={{padding:"5px 11px",borderRadius:8,fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:`1px solid ${W.accent}`,background:W.accentDim,color:W.accent}}>← Login</button>
        }
      </div>
      <div style={{display:"flex",justifyContent:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{width:320,height:640,background:W.bg,borderRadius:36,border:`2.5px solid ${W.border}`,overflow:"hidden",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,0.6)",display:"flex",flexDirection:"column"}}>
            {/* Dynamic island / notch */}
            <div style={{position:"absolute",top:6,left:"50%",transform:"translateX(-50%)",width:94,height:28,background:"#000",borderRadius:14,zIndex:10}}/>
            {/* Status bar — safe area padding for notch */}
            <div style={{height:44,display:"flex",alignItems:"flex-end",justifyContent:"space-between",padding:"0 22px 4px",fontSize:11,color:W.dim,fontFamily:"monospace",flexShrink:0,position:"relative",zIndex:5}}>
              <span style={{fontWeight:600}}>9:41</span>
              <span>{online?"●●● ▐██▌":"○○○ ▐  ▌"}</span>
            </div>
            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",zoom:fontScale}}>
              {!online&&<div style={{background:W.dim,color:"#fff",padding:"4px 12px",fontSize:9,fontWeight:700,fontFamily:"monospace",textAlign:"center",flexShrink:0,letterSpacing:1}}>
                ⚠ OFFLINE · Changes won't sync until you reconnect
              </div>}
              {content()}
              {toast&&<div role="status" aria-live="polite" aria-atomic="true" style={{position:"absolute",bottom:80,left:16,right:16,zIndex:100,background:toast.tone==="err"?W.accent:(themeMode==="light"?"#18181e":"#000"),border:`1px solid ${toast.tone==="err"?W.accent:W.border}`,borderRadius:12,padding:"10px 14px",boxShadow:"0 6px 24px rgba(0,0,0,0.6)"}}>
                <div style={{fontSize:10,fontWeight:600,color:"#fff",fontFamily:"monospace",lineHeight:1.5}}>{toast.msg}</div>
              </div>}
            </div>
          </div>
          <span style={{fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>{navLabel()}</span>
        </div>
      </div>
      <div style={{maxWidth:500,margin:"16px auto 0",textAlign:"center"}}>
        <p style={{fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6}}>Apple ID & Google only · Import watch history from 8 platforms</p>
      </div>
    </div>
  );
}

// Global accessibility styles — injected into the document so these survive
// any build pipeline (not just the Python HTML wrapper). Idempotent — only
// injects once even if App re-renders.
const A11Y_STYLE_ID = "rated-a11y-styles";
const A11Y_CSS = `
/* Hide outline for mouse/touch users but keep a clear ring for keyboard nav */
*:focus { outline: none; }
*:focus-visible { outline: 2px solid #ff3b3b; outline-offset: 2px; border-radius: 4px; }
/* Honor OS reduced-motion preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* Skeleton shimmer keyframes — safe fallback if build script doesn't provide them */
@keyframes skeleton-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;
const useA11yStyles = () => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(A11Y_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = A11Y_STYLE_ID;
    style.textContent = A11Y_CSS;
    document.head.appendChild(style);
    // No cleanup — we want these to persist for the app's lifetime
  }, []);
};

export default function App() {
  useA11yStyles();
  return (
    <ErrorBoundary>
      <AppInner/>
    </ErrorBoundary>
  );
}
