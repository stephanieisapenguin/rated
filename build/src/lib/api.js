// API client — hits rated-api.onrender.com.
// Two layers of auth on every request:
//   1. Pre-signed URL (?scope=…&sig=…) — API-level: proves request comes from this app
//   2. Authorization: Bearer <session_token> — user-level: proves caller owns the resource
//      (only passed on mutation routes that require it; backend enforces require_self)
//
// API_BASE / VITE_API_AUTH come from env vars — never hardcoded here.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const _AUTH = import.meta.env.VITE_API_AUTH || "";
const _url = (path) => _AUTH
  ? `${API_BASE}${path}${path.includes("?") ? "&" : "?"}${_AUTH}`
  : `${API_BASE}${path}`;

async function api(method, path, body, token) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(_url(path), {
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
  login:             (id_token)                                          => api("POST", "/auth/login", { id_token }),
  checkUsername:     (u)                                                 => api("GET",  `/auth/username/check/${u}`),
  setUsername:       (username, token)                                   => api("POST", "/auth/username", { username }, token),
  getRankings:       (uid)                                               => api("GET",  `/users/${uid}/rankings`),
  addRanking:        (uid, movie_id, score, token, movie_meta = null)    => api("POST", `/users/${uid}/rankings`, { movie_id, score, ...(movie_meta ? { movie_meta } : {}) }, token),
  recordPairwise:    (uid, winner_id, loser_id, token)                   => api("POST", `/users/${uid}/pairwise`, { winner_movie_id: winner_id, loser_movie_id: loser_id }, token),
  getFeed:           (uid)                                               => api("GET",  `/users/${uid}/feed`),
  follow:            (uid, followee_id, token)                           => api("POST", `/users/${uid}/follow`, { followee_id }, token),
  unfollow:          (uid, fid, token)                                   => api("DELETE",`/users/${uid}/follow/${fid}`, null, token),
  getUserByUsername: (handle)                                            => api("GET",  `/users/by-username/${handle.replace(/^@/, "")}`),
  addSaved:          (uid, movie_id, token, movie_meta = null)           => api("POST", `/users/${uid}/saved`, { movie_id, ...(movie_meta ? { movie_meta } : {}) }, token),
  removeSaved:       (uid, movie_id, token)                              => api("DELETE",`/users/${uid}/saved/${movie_id}`, null, token),
  getSaved:          (uid)                                               => api("GET",  `/users/${uid}/saved`),
  submitReview:      (uid, movie_id, rating, text, token, movie_meta = null) => api("POST", `/users/${uid}/reviews`, { movie_id, rating, text, ...(movie_meta ? { movie_meta } : {}) }, token),
  deleteReview:      (uid, movie_id, token)                              => api("DELETE",`/users/${uid}/reviews/${movie_id}`, null, token),
  getUserReviews:    (uid)                                               => api("GET",  `/users/${uid}/reviews`),
  getMovieReviews:   (movie_id)                                          => api("GET",  `/movies/${movie_id}/reviews`),
  getWatchlist:      (uid)                                               => api("GET",  `/users/${uid}/watchlist`),
  addWatchlist:      (uid, movie_id, token)                              => api("POST", `/users/${uid}/watchlist`, { movie_id }, token),
  removeWatchlist:   (uid, movie_id, token)                              => api("DELETE",`/users/${uid}/watchlist/${movie_id}`, null, token),
  topMovies:         ()                                                  => api("GET",  "/movies/top"),
  movieStats:        (movie_id)                                          => api("GET",  `/movies/${movie_id}/stats`),
  searchUsers:       (q, limit = 20)                                     => api("GET",  `/users?q=${encodeURIComponent(q)}&limit=${limit}`),
  deleteAccount:     (uid, token)                                        => api("DELETE", `/users/${uid}`, null, token),
  updateProfile:     (uid, fields, token)                                => api("PATCH",  `/users/${uid}`, fields, token),
  // Notifications (read-only — no token needed)
  getNotifications:        (uid)                                         => api("GET",    `/users/${uid}/notifications`),
  markNotificationRead:    (uid, nid)                                    => api("POST",   `/users/${uid}/notifications/${nid}/read`),
  markAllNotificationsRead:(uid)                                         => api("POST",   `/users/${uid}/notifications/mark-all-read`),
  deleteNotification:      (uid, nid)                                    => api("DELETE", `/users/${uid}/notifications/${nid}`),
  // Reports / likes / replies
  submitReport:      (uid, payload, token)                               => api("POST",   `/users/${uid}/reports`, payload, token),
  toggleFeedLike:    (uid, itemId, token)                                => api("POST",   `/users/${uid}/feed-likes/${itemId}`, null, token),
  listMyFeedLikes:   (uid)                                               => api("GET",    `/users/${uid}/feed-likes`),
  postFeedReply:     (uid, itemId, body, token)                          => api("POST",   `/users/${uid}/feed-replies/${itemId}`, { body }, token),
  listFeedReplies:   (itemId)                                            => api("GET",    `/feed-items/${itemId}/replies`),
};

export async function loginRaw(id_token) {
  try {
    const res = await fetch(_url("/auth/login"), {
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
