// API client. Wraps fetch() with two niceties:
//  1. session_token goes into Authorization: Bearer (not query param) so it
//     doesn't end up in proxy/CDN access logs.
//  2. On network/non-2xx errors that aren't 401/403, returns null instead
//     of throwing. Callers fall back to mock data so the UI never breaks
//     when the server is unreachable. 401/403 still propagate so logins
//     can react.
//
// API_BASE comes from VITE_API_BASE_URL (Vite injects it at build time).
// Defaults to localhost:8000 for local dev. In Netlify production this is
// set to the Replit Autoscale URL.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function api(method, path, body, token) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
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

export const API = {
  login:             (id_token)                      => api("POST", "/auth/login",  { id_token }),
  checkUsername:     (u)                             => api("GET",  `/auth/username/check/${u}`),
  setUsername:       (username, token)               => api("POST", "/auth/username", { username }, token),
  getRankings:       (uid, token)                    => api("GET",  `/users/${uid}/rankings`, null, token),
  addRanking:        (uid, movie_id, score, token)   => api("POST", `/users/${uid}/rankings`, { movie_id, score }, token),
  recordPairwise:    (uid, winner_id, loser_id, tok) => api("POST", `/users/${uid}/pairwise`, { winner_movie_id: winner_id, loser_movie_id: loser_id }, tok),
  getFeed:           (uid, token)                    => api("GET",  `/users/${uid}/feed`, null, token),
  follow:            (uid, followee_id, token)       => api("POST", `/users/${uid}/follow`, { followee_id }, token),
  unfollow:          (uid, fid, token)               => api("DELETE",`/users/${uid}/follow/${fid}`, null, token),
  getUserByUsername: (handle, token)                 => api("GET",  `/users/by-username/${handle.replace(/^@/, "")}`, null, token),
  addSaved:          (uid, movie_id, token)          => api("POST", `/users/${uid}/saved`, { movie_id }, token),
  removeSaved:       (uid, movie_id, token)          => api("DELETE",`/users/${uid}/saved/${movie_id}`, null, token),
  getSaved:          (uid, token)                    => api("GET",  `/users/${uid}/saved`, null, token),
  submitReview:      (uid, movie_id, rating, text, token) => api("POST", `/users/${uid}/reviews`, { movie_id, rating, text }, token),
  deleteReview:      (uid, movie_id, token)          => api("DELETE",`/users/${uid}/reviews/${movie_id}`, null, token),
  getUserReviews:    (uid, token)                    => api("GET",  `/users/${uid}/reviews`, null, token),
  getMovieReviews:   (movie_id, token)               => api("GET",  `/movies/${movie_id}/reviews`, null, token),
  getWatchlist:      (uid, token)                    => api("GET",  `/users/${uid}/watchlist`, null, token),
  addWatchlist:      (uid, movie_id, token)          => api("POST", `/users/${uid}/watchlist`, { movie_id }, token),
  removeWatchlist:   (uid, movie_id, token)          => api("DELETE",`/users/${uid}/watchlist/${movie_id}`, null, token),
  topMovies:         ()                              => api("GET",  "/movies/top"),
  movieStats:        (movie_id)                      => api("GET",  `/movies/${movie_id}/stats`),
  searchUsers:       (q, limit = 20)                 => api("GET",  `/users?q=${encodeURIComponent(q)}&limit=${limit}`),
};
