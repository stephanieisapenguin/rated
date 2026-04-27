// Playwright config — boots backend (uvicorn) + frontend (vite) before
// running tests, tears them down after. Single browser (Chromium headless)
// — adding firefox/webkit later is one entry in `projects`.

import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 5173;
const BACKEND_PORT  = 8000;

export default defineConfig({
  testDir: "./e2e",
  // 30s per test is generous; most should finish in <2s. Higher because
  // CI's first `npm install` for tests can spawn slow on cold cache.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: false,        // keep deterministic against the shared backend DB
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Boot backend with a throwaway SQLite file so the test run starts from
  // the seeded fixtures every time, no ambient state leaking in.
  webServer: [
    {
      command:
        "cd backend && DATABASE_URL=sqlite:///./e2e_test.db rm -f e2e_test.db && " +
        ".venv/bin/uvicorn api:app --host 127.0.0.1 --port " + BACKEND_PORT,
      url: `http://localhost:${BACKEND_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `VITE_API_BASE_URL=http://localhost:${BACKEND_PORT} npm run dev -- --port ${FRONTEND_PORT}`,
      url: `http://localhost:${FRONTEND_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
