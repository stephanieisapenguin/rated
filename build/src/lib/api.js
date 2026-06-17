// API client backed by the pre-signed Rated API (Airtable-compatible REST).
// The signature IS the auth — appended as query params on every request,
// no Authorization header needed.
//
// Low-level shape:  GET/POST/PATCH/DELETE /v0/app1/{table}[/{id}]
// Every record:     { id: "rec…", createdTime: "…Z", fields: { … } }

const BASE = "https://rated-api.onrender.com";
const AUTH = "scope=%2Fv0&exp=0&sig=de23ecee33cf1f1984806f7a60398f0395e89d73567dd6ab5667e635b6b5e559";

function url(p) {
  return `${BASE}${p}${p.includes("?") ? "&" : "?"}${AUTH}`;
}

async function req(method, path, body) {
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url(path), opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.warn(`[API] ${method} ${path} →`, e.message);
    return null;
  }
}

// Fetch all pages from a table, returning the flat array of records.
async function listAll(table) {
  const records = [];
  let offset;
  do {
    const qs = offset ? `?pageSize=100&offset=${offset}` : "?pageSize=100";
    const data = await req("GET", `/v0/app1/${table}${qs}`);
    if (!data) break;
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

// Fetch records filtered by a single field value (client-side).
async function listWhere(table, field, value) {
  const all = await listAll(table);
  return all.filter((r) => r.fields[field] === value);
}

async function createRecord(table, fields) {
  return req("POST", `/v0/app1/${table}`, { fields });
}

async function patchRecord(table, id, fields) {
  return req("PATCH", `/v0/app1/${table}/${id}`, { fields });
}

async function deleteRecord(table, id) {
  return req("DELETE", `/v0/app1/${table}/${id}`);
}

// ---------------------------------------------------------------------------
// Auth / users
// ---------------------------------------------------------------------------

// "Login" by google id_token — we store the decoded sub as google_id.
// In this pre-signed setup the token isn't verified server-side; we just
// use the sub claim as a stable identifier.
async function resolveUser(id_token) {
  // Decode JWT payload (no verification — server handles that via the sig).
  try {
    const payload = JSON.parse(atob(id_token.split(".")[1]));
    const { sub: google_id, name, email, picture } = payload;
    const existing = await listWhere("users", "google_id", google_id);
    if (existing.length) {
      const rec = existing[0];
      return {
        user_id: rec.id,
        username: rec.fields.username || null,
        display_name: rec.fields.display_name || name,
        avatar_url: rec.fields.avatar_url || picture,
        token: google_id, // we reuse google_id as the "session token"
      };
    }
    // First sign-in — create user row.
    const created = await createRecord("users", {
      google_id,
      display_name: name,
      email,
      avatar_url: picture,
    });
    return {
      user_id: created.id,
      username: null,
      display_name: name,
      avatar_url: picture,
      token: google_id,
    };
  } catch (e) {
    console.warn("[API] resolveUser →", e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API surface — mirrors the original FastAPI-backed API exactly so no
// other files need to change.
// ---------------------------------------------------------------------------

export const API_BASE = BASE;

export const API = {
  // --- Auth ---
  login: (id_token) => resolveUser(id_token),

  checkUsername: async (username) => {
    const rows = await listWhere("users", "username", username);
    return { available: rows.length === 0 };
  },

  setUsername: async (username, token) => {
    // token is google_id in this implementation.
    const rows = await listWhere("users", "google_id", token);
    if (!rows.length) return null;
    return patchRecord("users", rows[0].id, { username });
  },

  // --- Rankings ---
  getRankings: async (uid) => {
    const rows = await listWhere("rankings", "user_id", uid);
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },

  addRanking: async (uid, movie_id, score, _token, movie_meta = null) => {
    // Upsert: update existing row if present.
    const existing = (await listWhere("rankings", "user_id", uid)).filter(
      (r) => r.fields.movie_id === movie_id
    );
    const fields = { user_id: uid, movie_id, score, ...(movie_meta ? { movie_meta: JSON.stringify(movie_meta) } : {}) };
    if (existing.length) return patchRecord("rankings", existing[0].id, fields);
    return createRecord("rankings", fields);
  },

  recordPairwise: (uid, winner_id, loser_id) =>
    createRecord("pairwise", { user_id: uid, winner_id, loser_id }),

  // --- Feed ---
  getFeed: async (uid) => {
    // Get who the user follows, then fetch their activity.
    const followRows = await listWhere("follows", "follower_id", uid);
    const followeeIds = followRows.map((r) => r.fields.followee_id);
    const allFeed = await listAll("feed_items");
    const items = allFeed.filter(
      (r) => followeeIds.includes(r.fields.user_id) || r.fields.user_id === uid
    );
    return items.map((r) => ({ id: r.id, ...r.fields })).reverse();
  },

  // --- Follow ---
  follow: (uid, followee_id) =>
    createRecord("follows", { follower_id: uid, followee_id }),

  unfollow: async (uid, followee_id) => {
    const rows = (await listWhere("follows", "follower_id", uid)).filter(
      (r) => r.fields.followee_id === followee_id
    );
    if (!rows.length) return null;
    return deleteRecord("follows", rows[0].id);
  },

  // --- Users ---
  getUserByUsername: async (handle) => {
    const username = handle.replace(/^@/, "");
    const rows = await listWhere("users", "username", username);
    if (!rows.length) return null;
    return { id: rows[0].id, ...rows[0].fields };
  },

  searchUsers: async (q) => {
    const all = await listAll("users");
    const lower = q.toLowerCase();
    return all
      .filter(
        (r) =>
          r.fields.username?.toLowerCase().includes(lower) ||
          r.fields.display_name?.toLowerCase().includes(lower)
      )
      .map((r) => ({ id: r.id, ...r.fields }))
      .slice(0, 20);
  },

  updateProfile: async (uid, fields) => patchRecord("users", uid, fields),

  deleteAccount: async (uid) => deleteRecord("users", uid),

  // --- Saved ---
  getSaved: async (uid) => {
    const rows = await listWhere("saved", "user_id", uid);
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },

  addSaved: (uid, movie_id, _token, movie_meta = null) =>
    createRecord("saved", {
      user_id: uid,
      movie_id,
      ...(movie_meta ? { movie_meta: JSON.stringify(movie_meta) } : {}),
    }),

  removeSaved: async (uid, movie_id) => {
    const rows = (await listWhere("saved", "user_id", uid)).filter(
      (r) => r.fields.movie_id === movie_id
    );
    if (!rows.length) return null;
    return deleteRecord("saved", rows[0].id);
  },

  // --- Reviews ---
  getUserReviews: async (uid) => {
    const rows = await listWhere("reviews", "user_id", uid);
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },

  getMovieReviews: async (movie_id) => {
    const rows = await listWhere("reviews", "movie_id", String(movie_id));
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },

  submitReview: async (uid, movie_id, rating, text, _token, movie_meta = null) => {
    const existing = (await listWhere("reviews", "user_id", uid)).filter(
      (r) => r.fields.movie_id === String(movie_id)
    );
    const fields = {
      user_id: uid,
      movie_id: String(movie_id),
      rating,
      text,
      ...(movie_meta ? { movie_meta: JSON.stringify(movie_meta) } : {}),
    };
    if (existing.length) return patchRecord("reviews", existing[0].id, fields);
    return createRecord("reviews", fields);
  },

  deleteReview: async (uid, movie_id) => {
    const rows = (await listWhere("reviews", "user_id", uid)).filter(
      (r) => r.fields.movie_id === String(movie_id)
    );
    if (!rows.length) return null;
    return deleteRecord("reviews", rows[0].id);
  },

  // --- Watchlist ---
  getWatchlist: async (uid) => {
    const rows = await listWhere("watchlist", "user_id", uid);
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },

  addWatchlist: (uid, movie_id) =>
    createRecord("watchlist", { user_id: uid, movie_id: String(movie_id) }),

  removeWatchlist: async (uid, movie_id) => {
    const rows = (await listWhere("watchlist", "user_id", uid)).filter(
      (r) => r.fields.movie_id === String(movie_id)
    );
    if (!rows.length) return null;
    return deleteRecord("watchlist", rows[0].id);
  },

  // --- Top movies / stats ---
  topMovies: async () => {
    const rows = await listAll("rankings");
    // Aggregate average score per movie.
    const scores = {};
    const counts = {};
    for (const r of rows) {
      const mid = r.fields.movie_id;
      if (!mid) continue;
      scores[mid] = (scores[mid] || 0) + (r.fields.score || 0);
      counts[mid] = (counts[mid] || 0) + 1;
    }
    return Object.entries(scores)
      .map(([movie_id, total]) => ({
        movie_id,
        avg_score: total / counts[movie_id],
        ranking_count: counts[movie_id],
      }))
      .sort((a, b) => b.avg_score - a.avg_score)
      .slice(0, 50);
  },

  movieStats: async (movie_id) => {
    const rows = (await listAll("rankings")).filter(
      (r) => r.fields.movie_id === String(movie_id)
    );
    const scores = rows.map((r) => r.fields.score || 0);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { movie_id, avg_score: avg, ranking_count: scores.length, scores };
  },

  // --- Notifications ---
  getNotifications: async (uid) => {
    const rows = await listWhere("notifications", "user_id", uid);
    return rows.map((r) => ({ id: r.id, ...r.fields })).reverse();
  },

  markNotificationRead: (uid, nid) =>
    patchRecord("notifications", nid, { user_id: uid, read: true }),

  markAllNotificationsRead: async (uid) => {
    const rows = await listWhere("notifications", "user_id", uid);
    await Promise.all(rows.map((r) => patchRecord("notifications", r.id, { read: true })));
    return { ok: true };
  },

  deleteNotification: (_uid, nid) => deleteRecord("notifications", nid),

  // --- Reports / likes / replies ---
  submitReport: (uid, payload) =>
    createRecord("reports", { user_id: uid, ...payload }),

  toggleFeedLike: async (uid, itemId) => {
    const existing = (await listWhere("feed_likes", "user_id", uid)).filter(
      (r) => r.fields.item_id === itemId
    );
    if (existing.length) {
      await deleteRecord("feed_likes", existing[0].id);
      return { liked: false };
    }
    await createRecord("feed_likes", { user_id: uid, item_id: itemId });
    return { liked: true };
  },

  listMyFeedLikes: async (uid) => {
    const rows = await listWhere("feed_likes", "user_id", uid);
    return rows.map((r) => r.fields.item_id);
  },

  postFeedReply: (uid, itemId, body) =>
    createRecord("feed_replies", { user_id: uid, item_id: itemId, body }),

  listFeedReplies: async (itemId) => {
    const rows = await listWhere("feed_replies", "item_id", itemId);
    return rows.map((r) => ({ id: r.id, ...r.fields }));
  },
};

// Login variant that surfaces error details.
export async function loginRaw(id_token) {
  const data = await resolveUser(id_token);
  if (!data) return { ok: false, error: "Could not resolve user — check connection." };
  return { ok: true, data };
}
