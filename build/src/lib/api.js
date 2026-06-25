// API client — hits rated-api.onrender.com with a pre-signed URL for auth.
// The signature IS the auth: append it to every request URL, no Bearer header needed.
//
// API_BASE comes from VITE_API_BASE_URL (Vite injects at build time).
// Falls back to localhost:8000 so local FastAPI dev still works without the env var.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const _AUTH = "scope=%2Fv0&exp=0&sig=de23ecee33cf1f1984806f7a60398f0395e89d73567dd6ab5667e635b6b5e559";
const _url = (path) => `${API_BASE}${path}${path.includes("?") ? "&" : "?"}${_AUTH}`;

async function api(method, path, body) {
  try {
    const headers = { "Content-Type": "application/json" };
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
  login:             (id_token)                      => api("POST", "/auth/login",  { id_token }),
  checkUsername:     (u)                             => api("GET",  `/auth/username/check/${u}`),
  setUsername:       (username)                      => api("POST", "/auth/username", { username }),
  getRankings:       (uid)                           => api("GET",  `/users/${uid}/rankings`),
  addRanking:        (uid, movie_id, score, _tok, movie_meta = null) => api("POST", `/users/${uid}/rankings`, { movie_id, score, ...(movie_meta ? { movie_meta } : {}) }),
  recordPairwise:    (uid, winner_id, loser_id)      => api("POST", `/users/${uid}/pairwise`, { winner_movie_id: winner_id, loser_movie_id: loser_id }),
  getFeed:           (uid)                           => api("GET",  `/users/${uid}/feed`),
  follow:            (uid, followee_id)              => api("POST", `/users/${uid}/follow`, { followee_id }),
  unfollow:          (uid, fid)                      => api("DELETE",`/users/${uid}/follow/${fid}`),
  getUserByUsername: (handle)                        => api("GET",  `/users/by-username/${handle.replace(/^@/, "")}`),
  addSaved:          (uid, movie_id, _tok, movie_meta = null) => api("POST", `/users/${uid}/saved`, { movie_id, ...(movie_meta ? { movie_meta } : {}) }),
  removeSaved:       (uid, movie_id)                 => api("DELETE",`/users/${uid}/saved/${movie_id}`),
  getSaved:          (uid)                           => api("GET",  `/users/${uid}/saved`),
  submitReview:      (uid, movie_id, rating, text, _tok, movie_meta = null) => api("POST", `/users/${uid}/reviews`, { movie_id, rating, text, ...(movie_meta ? { movie_meta } : {}) }),
  deleteReview:      (uid, movie_id)                 => api("DELETE",`/users/${uid}/reviews/${movie_id}`),
  getUserReviews:    (uid)                           => api("GET",  `/users/${uid}/reviews`),
  getMovieReviews:   (movie_id)                      => api("GET",  `/movies/${movie_id}/reviews`),
  getWatchlist:      (uid)                           => api("GET",  `/users/${uid}/watchlist`),
  addWatchlist:      (uid, movie_id)                 => api("POST", `/users/${uid}/watchlist`, { movie_id }),
  removeWatchlist:   (uid, movie_id)                 => api("DELETE",`/users/${uid}/watchlist/${movie_id}`),
  topMovies:         ()                              => api("GET",  "/movies/top"),
  movieStats:        (movie_id)                      => api("GET",  `/movies/${movie_id}/stats`),
  searchUsers:       (q, limit = 20)                 => api("GET",  `/users?q=${encodeURIComponent(q)}&limit=${limit}`),
  deleteAccount:     (uid)                           => api("DELETE", `/users/${uid}`),
  updateProfile:     (uid, fields)                   => api("PATCH",  `/users/${uid}`, fields),
  // Notifications
  getNotifications:        (uid)                     => api("GET",    `/users/${uid}/notifications`),
  markNotificationRead:    (uid, nid)                => api("POST",   `/users/${uid}/notifications/${nid}/read`),
  markAllNotificationsRead:(uid)                     => api("POST",   `/users/${uid}/notifications/mark-all-read`),
  deleteNotification:      (uid, nid)                => api("DELETE", `/users/${uid}/notifications/${nid}`),
  // Reports / likes / replies
  submitReport:      (uid, payload)                  => api("POST",   `/users/${uid}/reports`, payload),
  toggleFeedLike:    (uid, itemId)                   => api("POST",   `/users/${uid}/feed-likes/${itemId}`),
  listMyFeedLikes:   (uid)                           => api("GET",    `/users/${uid}/feed-likes`),
  postFeedReply:     (uid, itemId, body)             => api("POST",   `/users/${uid}/feed-replies/${itemId}`, { body }),
  listFeedReplies:   (itemId)                        => api("GET",    `/feed-items/${itemId}/replies`),
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
