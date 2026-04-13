const BASE = "/api";

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMovies() {
  return apiFetch("/movies");
}

export async function fetchMovie(movieId) {
  return apiFetch(`/movies/${movieId}`);
}

export async function fetchTopMovies(n = 10) {
  return apiFetch(`/movies/top?n=${n}`);
}

export async function seedMovie(movie) {
  return apiFetch("/movies/seed", {
    method: "POST",
    body: JSON.stringify(movie),
  });
}

export async function login(idToken) {
  return apiFetch("/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function addRanking(userId, movieId, score) {
  return apiFetch(`/users/${userId}/rankings`, {
    method: "POST",
    body: JSON.stringify({ movie_id: movieId, score }),
  });
}

export async function getUserRankings(userId) {
  return apiFetch(`/users/${userId}/rankings`);
}

export async function recordPairwise(userId, winnerMovieId, loserMovieId) {
  return apiFetch(`/users/${userId}/pairwise`, {
    method: "POST",
    body: JSON.stringify({ winner_movie_id: winnerMovieId, loser_movie_id: loserMovieId }),
  });
}

export async function follow(userId, followeeId) {
  return apiFetch(`/users/${userId}/follow`, {
    method: "POST",
    body: JSON.stringify({ followee_id: followeeId }),
  });
}

export async function unfollow(userId, followeeId) {
  return apiFetch(`/users/${userId}/follow/${followeeId}`, {
    method: "DELETE",
  });
}

export async function getFeed(userId, limit = 20) {
  return apiFetch(`/users/${userId}/feed?limit=${limit}`);
}

export async function getUser(userId) {
  return apiFetch(`/users/${userId}`);
}

export async function healthCheck() {
  return apiFetch("/health");
}
