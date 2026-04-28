// TMDB client — calls the backend's /tmdb/* proxy instead of api.themoviedb.org
// directly. Two wins:
//   - the API key stays server-side (used to ship in the bundle, visible in DevTools)
//   - the backend caches across users, so popular/upcoming refreshes once per
//     10 minutes total, not once per user
// The frontend keeps a small per-tab cache so re-rendering screens doesn't refetch.

import { API_BASE } from "./api";
import { MOVIES, TMDB } from "./mockData";

// Optimistic — assume backend has TMDB_API_KEY set. If it doesn't, calls
// silently return null and the app falls back to hardcoded movies/upcoming.
export const TMDB_ENABLED = true;

const TMDB_CACHE = new Map(); // key -> {data, expiresAt}
const TMDB_LIST_TTL = 10 * 60 * 1000;

// Translate a TMDB path (the way callers write it) to the backend's curated
// /tmdb/* route. Centralizing this means callers don't need to know the
// backend exists.
function tmdbPathToBackend(path) {
  const [bare, ...qsParts] = path.split("?");
  const qs = qsParts.join("?");
  if (bare === "/movie/popular")    return `/tmdb/popular${qs ? "?" + qs : ""}`;
  if (bare === "/movie/upcoming")   return `/tmdb/upcoming${qs ? "?" + qs : ""}`;
  if (bare === "/movie/top_rated")  return `/tmdb/top-rated${qs ? "?" + qs : ""}`;
  // /search/movie?query=X → /tmdb/search?q=X (backend renames the param)
  if (bare === "/search/movie") {
    const params = new URLSearchParams(qs);
    const q = params.get("query") || "";
    const page = params.get("page") || "1";
    return `/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`;
  }
  // /movie/{id} → /tmdb/movie/{id}. Drop append_to_response — backend always
  // returns the bare detail; broaden the backend route if we need credits/videos.
  const movieMatch = bare.match(/^\/movie\/(\d+)$/);
  if (movieMatch) return `/tmdb/movie/${movieMatch[1]}`;
  // No backend route for /genre/movie/list — frontend uses TMDB_GENRES (below).
  return null;
}

async function tmdbFetch(path, { ttl = TMDB_LIST_TTL } = {}) {
  const backendPath = tmdbPathToBackend(path);
  if (!backendPath) return null;
  const cached = TMDB_CACHE.get(path);
  if (cached && (cached.expiresAt === 0 || cached.expiresAt > Date.now())) return cached.data;
  try {
    const res = await fetch(`${API_BASE}${backendPath}`);
    if (!res.ok) throw new Error(`TMDB-proxy ${res.status}`);
    const data = await res.json();
    TMDB_CACHE.set(path, { data, expiresAt: ttl === 0 ? 0 : Date.now() + ttl });
    return data;
  } catch (e) {
    console.warn("[TMDB]", path, e.message);
    return null;
  }
}

// TMDB's genre IDs are stable. Hardcoded so we don't need a backend round-trip
// just to map id → name. Refresh manually when TMDB adds a new genre.
export const TMDB_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};
export async function getTmdbGenres() {
  return TMDB_GENRES;
}

// Normalize a TMDB movie to the app's internal movie schema.
// Works for both list results (minimal fields) and detail results (full).
export function mapTmdbMovie(t, genreMap = TMDB_GENRES || {}) {
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
    content_rating: null,
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
    trending_rank: null,
    watchlist_count: 0,
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

// Public TMDB list helpers — each returns mapped movie arrays or null on failure.
export async function tmdbPopular() {
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
export async function tmdbUpcoming() {
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch("/movie/upcoming?language=en-US&page=1");
  if (!data?.results) return null;
  // TMDB sometimes includes already-released entries; filter by today.
  const today = new Date().toISOString().slice(0, 10);
  const mapped = data.results
    .filter(r => r.release_date && r.release_date > today)
    .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))
    .map(r => mapTmdbMovie(r, genreMap))
    .filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
export async function tmdbTopRated() {
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
export async function tmdbSearch(query) {
  if (!query || query.length < 2) return null;
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`);
  if (!data?.results) return null;
  const mapped = data.results.map(r => mapTmdbMovie(r, genreMap)).filter(Boolean);
  indexTmdbMovies(mapped);
  return mapped;
}
// Fetch full movie detail (cast, trailers, etc). Cached indefinitely.
export async function tmdbMovieDetail(tmdbId) {
  if (!tmdbId) return null;
  const genreMap = await getTmdbGenres();
  const data = await tmdbFetch(`/movie/${tmdbId}?append_to_response=credits,videos&language=en-US`, { ttl: 0 });
  if (!data) return null;
  return mapTmdbMovie(data, genreMap);
}

// Unified movie lookup — bridges mock MOVIES[] and TMDB-backed data.
// findMovieSync: returns immediately with whatever we have (mock hit, cached
//   TMDB hit, or a minimal stub). Never null when id or title is known.
// findMovieAsync: prefers findMovieSync, then fills in full TMDB detail.
//
// TMDB_MOVIE_INDEX caches mapped movies keyed by app id (tmdb-xxx) so repeated
// lookups from feed items don't refetch.
const TMDB_MOVIE_INDEX = new Map();

// Register mapped TMDB movies as they flow through the app so findMovieSync
// can find them later. Call sites: list results from tmdbPopular/Upcoming/Search/TopRated.
export function indexTmdbMovies(movies) {
  if (!movies) return;
  for (const m of movies) {
    if (m?.id && m.tmdb_id) TMDB_MOVIE_INDEX.set(m.id, m);
  }
}

// Synchronous lookup. May be partial for tmdb ids not yet cached.
// Never null if id or title is provided — guarantees navigation always has something.
export function findMovieSync(id, title) {
  if (id) {
    const hit = MOVIES.find(m => m.id === id);
    if (hit) return hit;
    if (TMDB_MOVIE_INDEX.has(id)) return TMDB_MOVIE_INDEX.get(id);
  }
  if (title) {
    const byTitle = MOVIES.find(m => m.title === title);
    if (byTitle) return byTitle;
  }
  if (!id && !title) return null;
  // Stub from what we know so MovieDetailScreen can still open and async-enrich.
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
export async function findMovieAsync(id, title) {
  const base = findMovieSync(id, title);
  if (!base) return null;
  if (base.poster_url && base.genres?.length > 0 && base.cast?.length > 0) return base;
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
