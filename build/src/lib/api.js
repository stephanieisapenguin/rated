// API client.
//
// The Rated backend is a generic Airtable-style record store. The path mirrors
// Airtable — /v0/{base}/{table}[/{recordId}] — where {base} is ignored (we use
// "app1"). Every record is { id: "rec…", createdTime: "…Z", fields: { … } } and
// fields are arbitrary JSON. There's no fixed schema and no per-row auth: the
// whole store is reached through a single pre-signed URL (the signature in the
// query string IS the auth — no secret or header needed).
//
// This module hides all of that behind the same `API.*` surface the app has
// always used, so screens don't know the backend changed. Each method maps a
// domain operation (rank a movie, follow a user, post a review) onto table
// reads/writes and reshapes the result into the objects the UI expects.
//
// Conventions that keep the rest of the app working unchanged:
//  - user_id IS the user's record id ("rec…"). A login finds-or-creates the
//    Users row for the stub id_token's `sub`; there are no server sessions, so
//    the returned session_token is just the user_id (the UI only checks it for
//    truthiness and passes it back to us, where it's ignored).
//  - Timestamps are stored as Unix seconds (floats) to match what the screens
//    already expect (they multiply by 1000).
//  - Reads return `null` ONLY on a real network/non-2xx failure. A missing or
//    empty table returns `[]` from the store (200 {records:[]}), so callers can
//    still distinguish "you have nothing yet" from "couldn't reach the server"
//    and fall back to local/mock data exactly as before.
//
// API_BASE stays exported for ./lib/tmdb — that proxy lives on a separate host
// and gracefully falls back to bundled mock data when unreachable.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ─── Generic record-store client ─────────────────────────────────────────────
// Pre-signed URL: the signature in the query string is the auth.
const STORE_BASE = import.meta.env.VITE_STORE_BASE_URL || "https://rated-api.onrender.com";
const STORE_AUTH = "scope=%2Fv0&exp=0&sig=de23ecee33cf1f1984806f7a60398f0395e89d73567dd6ab5667e635b6b5e559";
const storeUrl = (p) => `${STORE_BASE}${p}${p.includes("?") ? "&" : "?"}${STORE_AUTH}`;

const now = () => Date.now() / 1000;

// Low-level request. Returns parsed JSON, or null on network/non-2xx errors so
// callers can fall back to local data. Never throws.
async function storeReq(method, path, body) {
  try {
    const res = await fetch(storeUrl(path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  } catch (e) {
    console.warn(`[store] ${method} ${path} →`, e.message);
    return null;
  }
}

// Fetch every record in a table, following pagination offsets. Returns an array
// (possibly empty), or null if the first page failed (network down).
async function listAll(table) {
  const out = [];
  let offset;
  let first = true;
  do {
    const qs = `pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const res = await storeReq("GET", `/v0/app1/${table}?${qs}`);
    if (res === null) return first ? null : out;
    first = false;
    if (Array.isArray(res.records)) out.push(...res.records);
    offset = res.offset;
  } while (offset);
  return out;
}

const getRec    = (table, id)     => storeReq("GET",    `/v0/app1/${table}/${encodeURIComponent(id)}`);
const createRec = (table, fields) => storeReq("POST",   `/v0/app1/${table}`, { fields });
const patchRec  = (table, id, f)  => storeReq("PATCH",  `/v0/app1/${table}/${encodeURIComponent(id)}`, { fields: f });
const deleteRec = (table, id)     => storeReq("DELETE", `/v0/app1/${table}/${encodeURIComponent(id)}`);

// First record whose fields satisfy `pred`, or null. (Used for the store's
// missing "find by domain key" — it only addresses records by rec-id.)
async function findRec(table, pred) {
  const recs = await listAll(table);
  if (!Array.isArray(recs)) return null;
  return recs.find((r) => pred(r.fields || {}, r)) || null;
}

// ─── Reshapers: record → the dict shapes the UI already consumes ─────────────

function userDict(rec, counts = {}) {
  const f = rec.fields || {};
  return {
    user_id:         rec.id,
    name:            f.name || "",
    email:           f.email || null,
    avatar_url:      f.avatar_url || null,
    username:        f.username || null,
    is_private:      !!f.is_private,
    follower_count:  counts.follower_count || 0,
    following_count: counts.following_count || 0,
  };
}

function movieDict(rec) {
  const f = rec.fields || {};
  return {
    movie_id:   f.movie_id,
    title:      f.title || f.movie_id,
    genre:      f.genre || null,
    poster_url: f.poster_url || null,
    year:       f.year ?? null,
  };
}

const getUserRec = (uid) => getRec("Users", uid);

async function followCounts(uid) {
  const follows = await listAll("Follows");
  if (!Array.isArray(follows)) return {};
  const approved = follows.filter((r) => (r.fields?.state || "approved") === "approved");
  return {
    follower_count:  approved.filter((r) => r.fields.followee_id === uid).length,
    following_count: approved.filter((r) => r.fields.follower_id === uid).length,
  };
}

// Auto-create a Movies row the first time a film is referenced, mirroring the
// old backend's ensure_movie_exists. movie_meta is best-effort display data.
async function ensureMovie(movie_id, meta) {
  const existing = await findRec("Movies", (f) => f.movie_id === movie_id);
  if (existing) return existing;
  return createRec("Movies", {
    movie_id,
    title:      meta?.title || movie_id,
    genre:      meta?.genre || null,
    poster_url: meta?.poster_url || null,
    year:       meta?.year ?? null,
  });
}

function validateUsername(u) {
  if (!u || u.length < 3) return "Username must be at least 3 characters";
  if (u.length > 20) return "Username must be 20 characters or less";
  if (!/^[a-z0-9_]+$/.test(u)) return "Only lowercase letters, numbers, and underscores";
  return null;
}

// Stub id_token format is "sub|name|email" (the app sends this whenever a real
// Google JWT isn't configured). Find the Users row for `sub`, or create one.
async function findOrCreateUser(id_token) {
  const [sub, name, email] = String(id_token).split("|");
  if (!sub) throw new Error("Invalid sign-in token");
  let rec = await findRec("Users", (f) => f.sub === sub);
  if (!rec) {
    rec = await createRec("Users", {
      sub,
      name:       name || "New User",
      email:      email || null,
      avatar_url: null,
      username:   null,
      is_private: false,
      created_at: now(),
    });
    if (!rec) throw new Error("Couldn't reach the server. Try again.");
  }
  return rec;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const API = {
  // Auth ----------------------------------------------------------------------
  login: async (id_token) => {
    const r = await loginRaw(id_token);
    return r.ok ? r.data : null;
  },
  checkUsername: async (u) => {
    const err = validateUsername(u);
    if (err) return { available: false, reason: err };
    const taken = await findRec("Users", (f) => (f.username || "").toLowerCase() === u.toLowerCase());
    if (taken) return { available: false, reason: "Username already taken" };
    return { available: true };
  },
  setUsername: async (username, token) => {
    // token is the user_id (see module header). Patch the Users row in place.
    if (validateUsername(username)) return null;
    const rec = await patchRec("Users", token, { username });
    return rec ? { ok: true, username, user_id: token } : null;
  },

  // Rankings ------------------------------------------------------------------
  getRankings: async (uid) => {
    const [ranks, movies, userRec] = await Promise.all([
      listAll("Rankings"), listAll("Movies"), getUserRec(uid),
    ]);
    if (ranks === null) return null;
    const movieMap = new Map((movies || []).filter((m) => m.fields?.movie_id).map((m) => [m.fields.movie_id, movieDict(m)]));
    const u = userRec ? userDict(userRec) : null;
    return ranks
      .filter((r) => r.fields?.user_id === uid)
      .map((r) => ({
        user:      u,
        movie:     movieMap.get(r.fields.movie_id) || { movie_id: r.fields.movie_id, title: r.fields.movie_id, genre: null, poster_url: null, year: null },
        score:     r.fields.score,
        ranked_at: r.fields.ranked_at,
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  },
  addRanking: async (uid, movie_id, score, token, movie_meta = null) => {
    await ensureMovie(movie_id, movie_meta);
    const existing = await findRec("Rankings", (f) => f.user_id === uid && f.movie_id === movie_id);
    const fields = { user_id: uid, movie_id, score, ranked_at: now() };
    const rec = existing ? await patchRec("Rankings", existing.id, fields) : await createRec("Rankings", fields);
    if (!rec) return null;
    const [userRec, movieRec] = await Promise.all([
      getUserRec(uid),
      findRec("Movies", (f) => f.movie_id === movie_id),
    ]);
    return {
      user:      userRec ? userDict(userRec) : null,
      movie:     movieRec ? movieDict(movieRec) : { movie_id, title: movie_meta?.title || movie_id, genre: movie_meta?.genre || null, poster_url: movie_meta?.poster_url || null, year: movie_meta?.year ?? null },
      score,
      ranked_at: fields.ranked_at,
    };
  },
  recordPairwise: async (uid, winner_id, loser_id) => {
    const fields = { user_id: uid, winner_movie_id: winner_id, loser_movie_id: loser_id, timestamp: now() };
    const rec = await createRec("Pairwise", fields);
    return rec ? fields : null;
  },

  // Feed ----------------------------------------------------------------------
  getFeed: async (uid) => {
    const follows = await listAll("Follows");
    if (follows === null) return null;
    const followeeIds = new Set(
      follows
        .filter((r) => r.fields?.follower_id === uid && (r.fields.state || "approved") === "approved")
        .map((r) => r.fields.followee_id),
    );
    if (followeeIds.size === 0) return [];
    const [ranks, movies, users] = await Promise.all([listAll("Rankings"), listAll("Movies"), listAll("Users")]);
    if (ranks === null) return null;
    const movieMap = new Map((movies || []).filter((m) => m.fields?.movie_id).map((m) => [m.fields.movie_id, movieDict(m)]));
    const userMap = new Map((users || []).map((u) => [u.id, userDict(u)]));
    return ranks
      .filter((r) => followeeIds.has(r.fields?.user_id))
      .map((r) => ({
        user:      userMap.get(r.fields.user_id) || null,
        movie:     movieMap.get(r.fields.movie_id) || { movie_id: r.fields.movie_id, title: r.fields.movie_id },
        score:     r.fields.score,
        ranked_at: r.fields.ranked_at,
      }))
      .sort((a, b) => (b.ranked_at || 0) - (a.ranked_at || 0));
  },
  follow: async (uid, followee_id) => {
    const existing = await findRec("Follows", (f) => f.follower_id === uid && f.followee_id === followee_id);
    if (existing) return { ok: true, state: existing.fields.state || "approved" };
    const followee = await getUserRec(followee_id);
    const state = followee?.fields?.is_private ? "pending" : "approved";
    const rec = await createRec("Follows", { follower_id: uid, followee_id, state, created_at: now() });
    if (!rec) return null;
    // Best-effort notification for the followee — fire and forget.
    createRec("Notifications", {
      user_id: followee_id,
      type: state === "pending" ? "follow_request" : "follow",
      actor_id: uid, target_id: uid, body: null, read: false, created_at: now(),
    });
    return { ok: true, state };
  },
  unfollow: async (uid, fid) => {
    const existing = await findRec("Follows", (f) => f.follower_id === uid && f.followee_id === fid);
    if (existing) await deleteRec("Follows", existing.id);
    return { ok: true };
  },
  getUserByUsername: async (handle) => {
    const clean = handle.replace(/^@/, "").toLowerCase();
    const rec = await findRec("Users", (f) => (f.username || "").toLowerCase() === clean);
    if (!rec) return null;
    return userDict(rec, await followCounts(rec.id));
  },

  // Saved (bookmarks) ---------------------------------------------------------
  addSaved: async (uid, movie_id, token, movie_meta = null) => {
    await ensureMovie(movie_id, movie_meta);
    const existing = await findRec("Saved", (f) => f.user_id === uid && f.movie_id === movie_id);
    if (existing) return { ok: true, movie_id };
    const rec = await createRec("Saved", { user_id: uid, movie_id, added_at: now() });
    return rec ? { ok: true, movie_id } : null;
  },
  removeSaved: async (uid, movie_id) => {
    const existing = await findRec("Saved", (f) => f.user_id === uid && f.movie_id === movie_id);
    if (existing) await deleteRec("Saved", existing.id);
    return { ok: true };
  },
  getSaved: async (uid) => {
    const rows = await listAll("Saved");
    if (rows === null) return null;
    return rows.filter((r) => r.fields?.user_id === uid).map((r) => r.fields.movie_id);
  },

  // Reviews -------------------------------------------------------------------
  submitReview: async (uid, movie_id, rating, text, token, movie_meta = null) => {
    await ensureMovie(movie_id, movie_meta);
    const existing = await findRec("Reviews", (f) => f.user_id === uid && f.movie_id === movie_id);
    const rec = existing
      ? await patchRec("Reviews", existing.id, { rating, text, edited_at: now() })
      : await createRec("Reviews", { user_id: uid, movie_id, rating, text, created_at: now(), edited_at: null });
    if (!rec) return null;
    const f = rec.fields || {};
    return {
      user_id: uid, movie_id, rating, text,
      created_at: f.created_at ?? null,
      edited_at:  f.edited_at ?? null,
      edited:     !!f.edited_at,
    };
  },
  deleteReview: async (uid, movie_id) => {
    const existing = await findRec("Reviews", (f) => f.user_id === uid && f.movie_id === movie_id);
    if (existing) await deleteRec("Reviews", existing.id);
    return { ok: true };
  },
  getUserReviews: async (uid) => {
    const rows = await listAll("Reviews");
    if (rows === null) return null;
    return rows.filter((r) => r.fields?.user_id === uid).map((r) => ({
      user_id: uid, movie_id: r.fields.movie_id, rating: r.fields.rating, text: r.fields.text,
      created_at: r.fields.created_at ?? null, edited_at: r.fields.edited_at ?? null, edited: !!r.fields.edited_at,
    }));
  },
  getMovieReviews: async (movie_id) => {
    const [rows, users] = await Promise.all([listAll("Reviews"), listAll("Users")]);
    if (rows === null) return null;
    const userMap = new Map((users || []).map((u) => [u.id, u.fields || {}]));
    return rows.filter((r) => r.fields?.movie_id === movie_id).map((r) => {
      const uf = userMap.get(r.fields.user_id) || {};
      return {
        user_id: r.fields.user_id, movie_id, rating: r.fields.rating, text: r.fields.text,
        created_at: r.fields.created_at ?? null, edited_at: r.fields.edited_at ?? null, edited: !!r.fields.edited_at,
        username: uf.username || null, display_name: uf.name || null,
      };
    });
  },

  // Watchlist -----------------------------------------------------------------
  getWatchlist: async (uid) => {
    const rows = await listAll("Watchlist");
    if (rows === null) return null;
    return rows.filter((r) => r.fields?.user_id === uid).map((r) => r.fields.movie_id);
  },
  addWatchlist: async (uid, movie_id) => {
    const existing = await findRec("Watchlist", (f) => f.user_id === uid && f.movie_id === movie_id);
    if (existing) return { ok: true, movie_id };
    const rec = await createRec("Watchlist", { user_id: uid, movie_id, item_type: "catalog", added_at: now() });
    return rec ? { ok: true, movie_id } : null;
  },
  removeWatchlist: async (uid, movie_id) => {
    const existing = await findRec("Watchlist", (f) => f.user_id === uid && f.movie_id === movie_id);
    if (existing) await deleteRec("Watchlist", existing.id);
    return { ok: true };
  },

  // Movies (aggregates) -------------------------------------------------------
  topMovies: async () => {
    const [ranks, movies] = await Promise.all([listAll("Rankings"), listAll("Movies")]);
    if (ranks === null) return null;
    const movieMap = new Map((movies || []).filter((m) => m.fields?.movie_id).map((m) => [m.fields.movie_id, movieDict(m)]));
    const agg = new Map(); // movie_id -> { sum, count }
    ranks.forEach((r) => {
      const id = r.fields?.movie_id;
      if (!id) return;
      const a = agg.get(id) || { sum: 0, count: 0 };
      a.sum += r.fields.score || 0;
      a.count += 1;
      agg.set(id, a);
    });
    return [...agg.entries()]
      .map(([id, a]) => ({ movie: movieMap.get(id) || { movie_id: id, title: id }, avg_score: a.count ? a.sum / a.count : 0 }))
      .sort((a, b) => b.avg_score - a.avg_score)
      .slice(0, 10);
  },
  movieStats: async (movie_id) => {
    const [ranks, reviews] = await Promise.all([listAll("Rankings"), listAll("Reviews")]);
    if (ranks === null) return null;
    const rs = ranks.filter((r) => r.fields?.movie_id === movie_id);
    const avg = rs.length ? rs.reduce((s, r) => s + (r.fields.score || 0), 0) / rs.length : 0;
    return {
      movie_id,
      avg_score: Math.round(avg * 100) / 100,
      ranking_count: rs.length,
      review_count: (reviews || []).filter((r) => r.fields?.movie_id === movie_id).length,
    };
  },

  // Users ---------------------------------------------------------------------
  searchUsers: async (q, limit = 20) => {
    const rows = await listAll("Users");
    if (rows === null) return null;
    const ql = (q || "").toLowerCase();
    return rows
      .filter((u) => {
        const f = u.fields || {};
        return (f.username || "").toLowerCase().includes(ql) || (f.name || "").toLowerCase().includes(ql);
      })
      .slice(0, limit)
      .map((u) => userDict(u));
  },
  deleteAccount: async (uid) => {
    await deleteRec("Users", uid);
    // Best-effort cascade so the user's content stops showing up elsewhere.
    for (const table of ["Rankings", "Reviews", "Saved", "Watchlist", "Pairwise", "FeedLikes", "FeedReplies", "Notifications"]) {
      const rows = await listAll(table);
      if (Array.isArray(rows)) {
        for (const r of rows) if (r.fields?.user_id === uid) await deleteRec(table, r.id);
      }
    }
    const follows = await listAll("Follows");
    if (Array.isArray(follows)) {
      for (const r of follows) {
        const f = r.fields || {};
        if (f.follower_id === uid || f.followee_id === uid) await deleteRec("Follows", r.id);
      }
    }
    return { ok: true };
  },
  updateProfile: async (uid, fields) => {
    const patch = {};
    if ("name" in fields) patch.name = fields.name;
    if ("avatar_url" in fields) patch.avatar_url = fields.avatar_url;
    if ("is_private" in fields) patch.is_private = fields.is_private;
    const rec = await patchRec("Users", uid, patch);
    return rec ? userDict(rec) : null;
  },

  // Notifications -------------------------------------------------------------
  getNotifications: async (uid) => {
    const [rows, users] = await Promise.all([listAll("Notifications"), listAll("Users")]);
    if (rows === null) return null;
    const userMap = new Map((users || []).map((u) => [u.id, u.fields || {}]));
    const items = rows
      .filter((r) => r.fields?.user_id === uid)
      .map((r) => {
        const af = userMap.get(r.fields.actor_id);
        return {
          id: r.id, type: r.fields.type,
          actor: af ? { username: af.username, name: af.name } : null,
          target_id: r.fields.target_id, body: r.fields.body || null,
          read: !!r.fields.read, created_at: r.fields.created_at ?? null,
        };
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    return { items, unread_count: items.filter((i) => !i.read).length };
  },
  markNotificationRead: async (uid, nid) => {
    const rec = await patchRec("Notifications", nid, { read: true });
    return rec ? { ok: true } : null;
  },
  markAllNotificationsRead: async (uid) => {
    const rows = await listAll("Notifications");
    if (rows === null) return null;
    let n = 0;
    for (const r of rows) {
      if (r.fields?.user_id === uid && !r.fields.read) { await patchRec("Notifications", r.id, { read: true }); n += 1; }
    }
    return { ok: true, marked_read: n };
  },
  deleteNotification: async (uid, nid) => {
    await deleteRec("Notifications", nid);
    return { ok: true };
  },

  // Reports / likes / replies -------------------------------------------------
  submitReport: async (uid, payload) => {
    const rec = await createRec("Reports", {
      reporter_id: uid,
      target_type: payload.target_type, target_id: payload.target_id, target_label: payload.target_label || null,
      reason_key: payload.reason_key, reason_label: payload.reason_label || null,
      created_at: now(),
    });
    return rec ? { ...rec.fields, id: rec.id } : null;
  },
  toggleFeedLike: async (uid, itemId) => {
    const existing = await findRec("FeedLikes", (f) => f.user_id === uid && f.item_id === itemId);
    if (existing) { await deleteRec("FeedLikes", existing.id); return { item_id: itemId, liked: false }; }
    const rec = await createRec("FeedLikes", { user_id: uid, item_id: itemId, created_at: now() });
    return rec ? { item_id: itemId, liked: true } : null;
  },
  listMyFeedLikes: async (uid) => {
    const rows = await listAll("FeedLikes");
    if (rows === null) return null;
    return { item_ids: rows.filter((r) => r.fields?.user_id === uid).map((r) => r.fields.item_id) };
  },
  postFeedReply: async (uid, itemId, body) => {
    const rec = await createRec("FeedReplies", { user_id: uid, item_id: itemId, body, created_at: now() });
    return rec ? { id: rec.id, user_id: uid, item_id: itemId, body, created_at: rec.fields?.created_at ?? null } : null;
  },
  listFeedReplies: async (itemId) => {
    const [rows, users] = await Promise.all([listAll("FeedReplies"), listAll("Users")]);
    if (rows === null) return null;
    const userMap = new Map((users || []).map((u) => [u.id, u.fields || {}]));
    const replies = rows
      .filter((r) => r.fields?.item_id === itemId)
      .map((r) => {
        const uf = userMap.get(r.fields.user_id) || {};
        return { id: r.id, user: { username: uf.username || null, name: uf.name || null }, body: r.fields.body, created_at: r.fields.created_at ?? null };
      })
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    return { replies };
  },
};

// Login variant that surfaces backend error details — the bare `API.login`
// returns null on any failure so the rest of the app can fall back to mock
// data, but for login we want to actually tell the user *why* it failed
// (couldn't reach the server, bad token, etc.) instead of a generic message.
export async function loginRaw(id_token) {
  try {
    const rec = await findOrCreateUser(id_token);
    const user = userDict(rec);
    return {
      ok: true,
      data: {
        user,
        session_token: rec.id, // no server sessions — the user_id is the token
        expires_at: null,
        user_id: rec.id,
        username: user.username,
        needs_username: !user.username,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || "Network error — check your connection." };
  }
}
