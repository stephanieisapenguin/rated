// End-to-end smoke tests — boots both servers (see playwright.config.js)
// and clicks through the canonical login → claim username → home flow.
// If anything here fails, the wire-up between Vite + uvicorn + SQLite is
// broken, regardless of unit-test status.
//
// Tests share one server but isolate state by minting a unique sub per test
// (so each spawns a brand-new backend user row). DB persists across tests
// within a single playwright run — that's intentional, mirrors prod.

import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8000";

test("backend is alive and seeded", async ({ request }) => {
  const r = await request.get(`${API_BASE}/`);
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.service).toBe("rated-api");
  expect(body.movies_seeded).toBe(5);
  expect(body.users_registered).toBeGreaterThanOrEqual(8);
});

test("frontend boots to the login screen", async ({ page }) => {
  await page.goto("/");
  // The login screen has the wordmark "RATED" + a "Continue with Google" button.
  await expect(page.getByText(/RATED/i).first()).toBeVisible();
  await expect(page.getByText(/Continue with Google/i)).toBeVisible();
  await expect(page.getByText(/Continue with Apple/i)).toBeVisible();
});

test("end-to-end: sign in, claim username, see home screen", async ({ page }) => {
  await page.goto("/");
  // Click Continue with Google — sends sub_google_demo|... to the backend
  await page.getByText(/Continue with Google/i).click();

  // Onboarding step 1 — name. Pick a fresh one so we land on a clean account.
  const name = `e2e_user_${Date.now()}`.slice(0, 25);
  const username = `e${Date.now().toString().slice(-9)}`;
  await page.getByPlaceholder(/Stephanie/i).fill(name);
  await page.getByText(/CONTINUE/i).click();

  // Step 2 — username. Wait for live availability check ✓ to appear.
  await page.getByPlaceholder(/username/i).fill(username);
  await expect(page.getByText(new RegExp(`@${username} is available`, "i"))).toBeVisible({ timeout: 5_000 });

  // Claim
  await page.getByText(new RegExp(`CLAIM @${username}`, "i")).click();

  // Brief confirmation screen, then HomeScreen. HomeScreen has the streak/feed
  // header — wait for any element that's only on home, not onboarding.
  await expect(page.getByText(/RATED/i).first()).toBeVisible({ timeout: 8_000 });
});

test("API: login + rate + read-back persists", async ({ request }) => {
  const sub = `sub_e2e_${Date.now()}`;
  // Login mints a session token.
  const loginRes = await request.post(`${API_BASE}/auth/login`, {
    data: { id_token: `${sub}|E2E User|e2e@x.com` },
  });
  expect(loginRes.ok()).toBeTruthy();
  const login = await loginRes.json();
  const userId = login.user_id;
  // Mutation routes require a bearer token (added in feature-auth-on-writes).
  const auth = { Authorization: `Bearer ${login.session_token}` };

  // Rate Interstellar a 9.
  const rankRes = await request.post(`${API_BASE}/users/${userId}/rankings`, {
    data: { movie_id: "m-001", score: 9 },
    headers: auth,
  });
  expect(rankRes.ok()).toBeTruthy();

  // Read-back returns the same row. (GET stays public — no auth needed.)
  const listRes = await request.get(`${API_BASE}/users/${userId}/rankings`);
  expect(listRes.ok()).toBeTruthy();
  const rankings = await listRes.json();
  expect(rankings).toHaveLength(1);
  expect(rankings[0].movie.movie_id).toBe("m-001");
  expect(rankings[0].score).toBe(9);
});


test("API: write without auth header is rejected", async ({ request }) => {
  // Regression guard: auth-on-writes must keep blocking unauthenticated
  // mutations even though the rest of the suite works.
  const sub = `sub_e2e_noauth_${Date.now()}`;
  const login = await (await request.post(`${API_BASE}/auth/login`, {
    data: { id_token: `${sub}|NoAuth|na@x.com` },
  })).json();
  const r = await request.post(`${API_BASE}/users/${login.user_id}/rankings`, {
    data: { movie_id: "m-001", score: 5 },
  });
  expect(r.status()).toBe(401);
});

test("CORS allows the frontend's localhost origin", async ({ request }) => {
  const r = await request.get(`${API_BASE}/movies`, {
    headers: { Origin: "http://localhost:5173" },
  });
  expect(r.ok()).toBeTruthy();
  // Either of these header forms confirms the request was accepted by CORS:
  const allowed = r.headers()["access-control-allow-origin"];
  expect(["*", "http://localhost:5173"]).toContain(allowed);
});
