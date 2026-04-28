// Local cache of usernames known to be taken — used by the username chooser
// to render a fast "@x is unavailable" without hitting the server, and to
// suggest alternatives that are also free.
//
// The server is the source of truth. This Set seeds it with the demo-cohort
// handles + reserved words. Real availability checks still go to
// /auth/username/check/{u}.

export const TAKEN_USERNAMES = new Set([
  "jasonk", "maya", "josh", "lina", "carlos",
  "cinephile99", "filmfreak", "reeltalks",
  "admin", "rated", "movies", "film",
]);
