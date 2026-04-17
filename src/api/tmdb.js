const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG = "https://image.tmdb.org/t/p";

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

export const hasApiKey = () => Boolean(API_KEY);

function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function tmdbImage(path, size = "w500") {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}

async function tmdbFetch(path, params = {}) {
  if (!API_KEY) return null;
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function mapMovie(raw) {
  if (!raw) return null;
  const releaseDate = raw.release_date ? new Date(raw.release_date) : null;

  // Content rating from US release_dates
  let contentRating = null;
  const usRelease = (raw.release_dates?.results || []).find(r => r.iso_3166_1 === "US");
  if (usRelease) {
    const certs = usRelease.release_dates.map(rd => rd.certification).filter(Boolean);
    contentRating = certs[0] || null;
  }

  // Directors + cast
  const crew = raw.credits?.crew || [];
  const cast = raw.credits?.cast || [];
  const directors = crew
    .filter(c => c.job === "Director")
    .map(c => ({ name: c.name, tmdb_person_id: c.id, photo_url: tmdbImage(c.profile_path, "w185") }));
  const castMapped = cast.slice(0, 15).map(c => ({
    name: c.name,
    character_name: c.character,
    cast_order: c.order,
    tmdb_person_id: c.id,
    photo_url: tmdbImage(c.profile_path, "w185"),
  }));

  // Trailers (YouTube only)
  let primarySet = false;
  const trailers = (raw.videos?.results || [])
    .filter(v => v.site === "YouTube")
    .map(v => {
      const isPrimary = !primarySet && v.type === "Trailer" && v.official;
      if (isPrimary) primarySet = true;
      return { title: v.name, video_key: v.key, video_type: v.type, is_primary: isPrimary };
    });

  const genres = (raw.genres || []).map(g => ({ name: g.name, slug: slugify(g.name), tmdb_id: g.id }));
  const keywords = (raw.keywords?.keywords || []).map(k => k.name);

  const voteAvg = raw.vote_average || 0;

  return {
    id: `tmdb-${raw.id}`,
    tmdb_id: raw.id,
    imdb_id: raw.imdb_id || null,
    slug: slugify(`${raw.title}-${releaseDate?.getFullYear()}`),
    title: raw.title || raw.name,
    original_title: raw.original_title !== raw.title ? raw.original_title : null,
    release_year: releaseDate?.getFullYear() || null,
    release_date: raw.release_date || null,
    runtime_minutes: raw.runtime || null,
    content_rating: contentRating,
    tagline: raw.tagline || null,
    synopsis: raw.overview || null,
    status: raw.status || "Released",
    original_language: raw.original_language || "en",
    is_international: raw.original_language !== "en",
    origin_countries: raw.origin_country || [],
    poster_url: tmdbImage(raw.poster_path, "w500"),
    backdrop_url: tmdbImage(raw.backdrop_path, "w1280"),
    genres,
    directors,
    cast: castMapped,
    trailers,
    keywords,
    // OMDb fields (not available from TMDB)
    imdb_rating: null,
    rotten_tomatoes_score: null,
    metacritic_score: null,
    // Box office
    box_office_worldwide: raw.revenue > 0 ? raw.revenue : null,
    budget: raw.budget > 0 ? raw.budget : null,
    // Rated internal — derived from TMDB vote data as placeholder
    global_elo_score: Math.round(1500 + (voteAvg - 7) * 60),
    global_rank: null,
    comparison_count: raw.vote_count || 0,
    win_rate: voteAvg / 10,
    avg_user_rating: voteAvg || null,
    user_rating_count: raw.vote_count || 0,
    review_count: 0,
    trending_score: Math.round(raw.popularity || 0),
    trending_rank: null,
    is_highlighted: voteAvg >= 7.5 && (raw.vote_count || 0) > 500,
    watchlist_count: Math.round((raw.popularity || 0) * 3),
    seen_count: raw.vote_count || 0,
    tmdb_popularity: raw.popularity || 0,
  };
}

export async function fetchTrending() {
  const data = await tmdbFetch("/trending/movie/week");
  if (!data) return null;
  return data.results.slice(0, 8).map(mapMovie);
}

export async function fetchUpcoming() {
  const data = await tmdbFetch("/movie/upcoming");
  if (!data) return null;
  const today = new Date();
  return data.results
    .filter(r => r.release_date && new Date(r.release_date) > today)
    .slice(0, 6)
    .map(r => ({
      ...mapMovie(r),
      days_until_release: Math.ceil((new Date(r.release_date) - today) / 86400000),
      anticipation_score: Math.round(r.popularity || 0),
      is_must_see: (r.popularity || 0) > 30,
      must_see_reason: r.overview?.slice(0, 80) || "Upcoming release",
      watchlist_count: Math.round((r.popularity || 0) * 2),
    }));
}

export async function fetchMovieDetail(tmdb_id) {
  const data = await tmdbFetch(`/movie/${tmdb_id}`, {
    append_to_response: "credits,videos,keywords,release_dates",
  });
  return mapMovie(data);
}

export async function searchMovies(query) {
  const data = await tmdbFetch("/search/movie", { query, include_adult: false });
  if (!data) return null;
  return data.results.slice(0, 10).map(mapMovie);
}
