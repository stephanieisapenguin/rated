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
  addRanking:        (uid, movie_id, score, token, movie_meta = null) => api("POST", `/users/${uid}/rankings`, { movie_id, score, ...(movie_meta ? { movie_meta } : {}) }, token),
  recordPairwise:    (uid, winner_id, loser_id, tok) => api("POST", `/users/${uid}/pairwise`, { winner_movie_id: winner_id, loser_movie_id: loser_id }, tok),
  getFeed:           (uid, token)                    => api("GET",  `/users/${uid}/feed`, null, token),
  follow:            (uid, followee_id, token)       => api("POST", `/users/${uid}/follow`, { followee_id }, token),
  unfollow:          (uid, fid, token)               => api("DELETE",`/users/${uid}/follow/${fid}`, null, token),
  getUserByUsername: (handle, token)                 => api("GET",  `/users/by-username/${handle.replace(/^@/, "")}`, null, token),
  addSaved:          (uid, movie_id, token, movie_meta = null) => api("POST", `/users/${uid}/saved`, { movie_id, ...(movie_meta ? { movie_meta } : {}) }, token),
  removeSaved:       (uid, movie_id, token)          => api("DELETE",`/users/${uid}/saved/${movie_id}`, null, token),
  getSaved:          (uid, token)                    => api("GET",  `/users/${uid}/saved`, null, token),
  submitReview:      (uid, movie_id, rating, text, token, movie_meta = null) => api("POST", `/users/${uid}/reviews`, { movie_id, rating, text, ...(movie_meta ? { movie_meta } : {}) }, token),
  deleteReview:      (uid, movie_id, token)          => api("DELETE",`/users/${uid}/reviews/${movie_id}`, null, token),
  getUserReviews:    (uid, token)                    => api("GET",  `/users/${uid}/reviews`, null, token),
  getMovieReviews:   (movie_id, token)               => api("GET",  `/movies/${movie_id}/reviews`, null, token),
  getWatchlist:      (uid, token)                    => api("GET",  `/users/${uid}/watchlist`, null, token),
  addWatchlist:      (uid, movie_id, token)          => api("POST", `/users/${uid}/watchlist`, { movie_id }, token),
  removeWatchlist:   (uid, movie_id, token)          => api("DELETE",`/users/${uid}/watchlist/${movie_id}`, null, token),
  topMovies:         ()                              => api("GET",  "/movies/top"),
  movieStats:        (movie_id)                      => api("GET",  `/movies/${movie_id}/stats`),
  searchUsers:       (q, limit = 20)                 => api("GET",  `/users?q=${encodeURIComponent(q)}&limit=${limit}`),
  deleteAccount:     (uid, token)                    => api("DELETE", `/users/${uid}`, null, token),
  updateProfile:     (uid, fields, token)            => api("PATCH",  `/users/${uid}`, fields, token),
};

// Login variant that surfaces backend error details — the bare `api` wrapper
// returns null on any non-2xx so the rest of the app can fall back to mock
// data, but for login we want to actually tell the user *why* it failed
// (invalid token, server down, etc.) instead of a generic "couldn't connect".
export async function loginRaw(id_token) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.detail || `HTTP ${res.status}` };
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: e.message || "Network error — check your connection." };
  }
}
