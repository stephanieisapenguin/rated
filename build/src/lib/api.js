// API client for the rated-api Airtable-shaped backend.
//
// The backend exposes a generic table CRUD surface at
//   /v0/{base}/{table}[/{recordId}]
// where {base} is ignored (we use "app1") and tables/fields are schemaless —
// anything we POST becomes the shape. Auth is a pre-signed query string that
// the user provided; the signature IS the credential, so we just append it to
// every URL. There are no per-user tokens server-side; we keep a "token" in
// the public surface for backwards compatibility with screens, and use the
// caller's user record id as the token value.
//
// This module re-exports the same `API` object shape that the rest of the
// app already imports, so screens don't need to change. Where the new
// backend has no native concept (aggregations, secondary indexes), we list +
// filter client-side. That's fine at this dataset size and keeps the wire
// protocol trivial.

const BASE = "https://rated-api.onrender.com";
const AUTH = "scope=%2Fv0&exp=0&sig=de23ecee33cf1f1984806f7a60398f0395e89d73567dd6ab5667e635b6b5e559";
const APP  = "app1";

export const API_BASE = BASE;

const url = (p) => `${BASE}${p}${p.includes("?") ? "&" : "?"}${AUTH}`;

async function req(method, path, body) {
  try {
    const res = await fetch(url(path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return await res.json();
  } catch (e) {
    if (e.message?.includes("401") || e.message?.includes("403")) throw e;
    console.warn(`[API] ${method} ${path} →`, e.message);
    return null;
  }
}

// Page through a table and return every record. Pagination uses the
// `offset` cursor returned by the list endpoint.
async function listAll(table, pageSize = 100) {
  const out = [];
  let offset;
  for (;;) {
    const qs = `pageSize=${pageSize}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const page = await req("GET", `/v0/${APP}/${table}?${qs}`);
    if (!page) return out;
    if (page.records) out.push(...page.records);
    if (!page.offset) return out;
    offset = page.offset;
  }
}

const t = {
  list:   (table)            => listAll(table),
  get:    (table, id)        => req("GET",    `/v0/${APP}/${table}/${id}`),
  create: (table, fields)    => req("POST",   `/v0/${APP}/${table}`,     { fields }),
  patch:  (table, id, flds)  => req("PATCH",  `/v0/${APP}/${table}/${id}`, { fields: flds }),
  put:    (table, id, flds)  => req("PUT",    `/v0/${APP}/${table}/${id}`, { fields: flds }),
  del:    (table, id)        => req("DELETE", `/v0/${APP}/${table}/${id}`),
};

const where = async (table, pred) => (await listAll(table)).filter(r => pred(r.fields || {}));
const findOne = async (table, pred) => (await where(table, pred))[0] || null;

// Table names — kept here so renames are one-line changes.
const T = {
  users:        "users",
  rankings:     "rankings",
  pairwise:     "pairwise",
  saved:        "saved",
  reviews:      "reviews",
  watchlist:    "watchlist",
  follows:      "follows",
  feedItems:    "feedItems",
  feedLikes:    "feedLikes",
  feedReplies:  "feedReplies",
  notifications:"notifications",
  reports:      "reports",
};

// Unwrap a record into { id, ...fields } so callers don't juggle the
// Airtable envelope.
const flat = (r) => r && { id: r.id, createdTime: r.createdTime, ...(r.fields || {}) };
const flatList = (rs) => (rs || []).map(flat);

async function loginOrCreate(id_token) {
  // Treat id_token as an opaque external identity. Look the user up by it;
  // create if missing. We don't verify the token here — the pre-signed
  // backend doesn't have an auth concept beyond the URL signature.
  let rec = await findOne(T.users, f => f.id_token === id_token);
  if (!rec) {
    rec = await t.create(T.users, { id_token, created_at: new Date().toISOString() });
  }
  if (!rec) return null;
  return { user: flat(rec), session_token: rec.id };
}

export const API = {
  // ── Auth ────────────────────────────────────────────────────────────
  login: (id_token) => loginOrCreate(id_token).then(r => r && ({ ...r })),

  checkUsername: async (u) => {
    const taken = await findOne(T.users, f => (f.username || "").toLowerCase() === u.toLowerCase());
    return { available: !taken };
  },

  setUsername: async (username, token) => {
    if (!token) return null;
    const updated = await t.patch(T.users, token, { username });
    return flat(updated);
  },

  updateProfile: async (uid, fields) => flat(await t.patch(T.users, uid, fields)),
  deleteAccount: (uid) => t.del(T.users, uid),

  // ── Rankings ────────────────────────────────────────────────────────
  getRankings: async (uid) => flatList(await where(T.rankings, f => f.uid === uid)),

  addRanking: async (uid, movie_id, score, _token, movie_meta = null) => {
    const existing = await findOne(T.rankings, f => f.uid === uid && f.movie_id === movie_id);
    const fields = { uid, movie_id, score, ...(movie_meta ? { movie_meta } : {}) };
    return flat(existing
      ? await t.patch(T.rankings, existing.id, fields)
      : await t.create(T.rankings, fields));
  },

  recordPairwise: (uid, winner_movie_id, loser_movie_id) =>
    t.create(T.pairwise, { uid, winner_movie_id, loser_movie_id, at: new Date().toISOString() }),

  // ── Social graph ────────────────────────────────────────────────────
  follow: async (uid, followee_id) => {
    const dup = await findOne(T.follows, f => f.uid === uid && f.followee_id === followee_id);
    if (dup) return flat(dup);
    return flat(await t.create(T.follows, { uid, followee_id, at: new Date().toISOString() }));
  },
  unfollow: async (uid, fid) => {
    const row = await findOne(T.follows, f => f.uid === uid && f.followee_id === fid);
    return row ? t.del(T.follows, row.id) : null;
  },

  // ── User lookup / search ────────────────────────────────────────────
  getUserByUsername: async (handle) => {
    const h = handle.replace(/^@/, "").toLowerCase();
    const rec = await findOne(T.users, f => (f.username || "").toLowerCase() === h);
    return flat(rec);
  },
  searchUsers: async (q, limit = 20) => {
    const needle = q.toLowerCase();
    const all = await where(T.users, f =>
      (f.username || "").toLowerCase().includes(needle) ||
      (f.display_name || "").toLowerCase().includes(needle));
    return flatList(all.slice(0, limit));
  },

  // ── Saved ───────────────────────────────────────────────────────────
  getSaved: async (uid) => flatList(await where(T.saved, f => f.uid === uid)),
  addSaved: async (uid, movie_id, _token, movie_meta = null) => {
    const dup = await findOne(T.saved, f => f.uid === uid && f.movie_id === movie_id);
    if (dup) return flat(dup);
    return flat(await t.create(T.saved, { uid, movie_id, ...(movie_meta ? { movie_meta } : {}) }));
  },
  removeSaved: async (uid, movie_id) => {
    const row = await findOne(T.saved, f => f.uid === uid && f.movie_id === movie_id);
    return row ? t.del(T.saved, row.id) : null;
  },

  // ── Reviews ─────────────────────────────────────────────────────────
  submitReview: async (uid, movie_id, rating, text, _token, movie_meta = null) => {
    const existing = await findOne(T.reviews, f => f.uid === uid && f.movie_id === movie_id);
    const fields = { uid, movie_id, rating, text, at: new Date().toISOString(),
                     ...(movie_meta ? { movie_meta } : {}) };
    return flat(existing
      ? await t.patch(T.reviews, existing.id, fields)
      : await t.create(T.reviews, fields));
  },
  deleteReview: async (uid, movie_id) => {
    const row = await findOne(T.reviews, f => f.uid === uid && f.movie_id === movie_id);
    return row ? t.del(T.reviews, row.id) : null;
  },
  getUserReviews:  async (uid)      => flatList(await where(T.reviews, f => f.uid === uid)),
  getMovieReviews: async (movie_id) => flatList(await where(T.reviews, f => f.movie_id === movie_id)),

  // ── Watchlist ───────────────────────────────────────────────────────
  getWatchlist: async (uid) => flatList(await where(T.watchlist, f => f.uid === uid)),
  addWatchlist: async (uid, movie_id) => {
    const dup = await findOne(T.watchlist, f => f.uid === uid && f.movie_id === movie_id);
    if (dup) return flat(dup);
    return flat(await t.create(T.watchlist, { uid, movie_id }));
  },
  removeWatchlist: async (uid, movie_id) => {
    const row = await findOne(T.watchlist, f => f.uid === uid && f.movie_id === movie_id);
    return row ? t.del(T.watchlist, row.id) : null;
  },

  // ── Aggregations (client-side: list + reduce) ───────────────────────
  topMovies: async () => {
    const rs = await listAll(T.rankings);
    const agg = new Map();
    for (const r of rs) {
      const f = r.fields || {};
      if (!f.movie_id) continue;
      const cur = agg.get(f.movie_id) || { movie_id: f.movie_id, total: 0, count: 0, movie_meta: f.movie_meta };
      cur.total += Number(f.score) || 0;
      cur.count += 1;
      agg.set(f.movie_id, cur);
    }
    return [...agg.values()]
      .map(x => ({ ...x, avg: x.count ? x.total / x.count : 0 }))
      .sort((a, b) => b.avg - a.avg);
  },

  movieStats: async (movie_id) => {
    const rs = await where(T.rankings, f => f.movie_id === movie_id);
    const count = rs.length;
    const avg = count ? rs.reduce((s, r) => s + (Number(r.score) || 0), 0) / count : 0;
    return { movie_id, count, avg };
  },

  // ── Feed ────────────────────────────────────────────────────────────
  getFeed: async (uid) => {
    // Feed = items authored by anyone the user follows, plus self.
    const follows = await where(T.follows, f => f.uid === uid);
    const allowed = new Set([uid, ...follows.map(r => r.fields?.followee_id).filter(Boolean)]);
    const items = await where(T.feedItems, f => allowed.has(f.uid));
    return flatList(items).sort((a, b) =>
      String(b.at || b.createdTime).localeCompare(String(a.at || a.createdTime)));
  },

  // ── Notifications ───────────────────────────────────────────────────
  getNotifications: async (uid) => flatList(await where(T.notifications, f => f.uid === uid)),
  markNotificationRead: (uid, nid) => t.patch(T.notifications, nid, { read: true, read_at: new Date().toISOString() }),
  markAllNotificationsRead: async (uid) => {
    const rows = await where(T.notifications, f => f.uid === uid && !f.read);
    await Promise.all(rows.map(r => t.patch(T.notifications, r.id, { read: true })));
    return { updated: rows.length };
  },
  deleteNotification: (uid, nid) => t.del(T.notifications, nid),

  // ── Reports / feed likes / replies ──────────────────────────────────
  submitReport: (uid, payload) =>
    t.create(T.reports, { uid, ...payload, at: new Date().toISOString() }),

  toggleFeedLike: async (uid, itemId) => {
    const row = await findOne(T.feedLikes, f => f.uid === uid && f.item_id === itemId);
    if (row) { await t.del(T.feedLikes, row.id); return { liked: false }; }
    await t.create(T.feedLikes, { uid, item_id: itemId, at: new Date().toISOString() });
    return { liked: true };
  },
  listMyFeedLikes: async (uid) => flatList(await where(T.feedLikes, f => f.uid === uid)),

  postFeedReply: async (uid, itemId, body) =>
    flat(await t.create(T.feedReplies, { uid, item_id: itemId, body, at: new Date().toISOString() })),
  listFeedReplies: async (itemId) =>
    flatList(await where(T.feedReplies, f => f.item_id === itemId)),
};

// Login variant that surfaces backend error details (parity with the prior
// API shape — login screens use this to show a real failure reason).
export async function loginRaw(id_token) {
  try {
    const data = await loginOrCreate(id_token);
    if (!data) return { ok: false, error: "Couldn't reach the server." };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || "Network error — check your connection." };
  }
}

// Low-level access for callers that want to talk to the raw table API
// (debugging, ad-hoc tables, the kind of thing the schemaless backend invites).
export const rawTable = t;
export const listTable = listAll;
