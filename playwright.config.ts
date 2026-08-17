import { defineConfig } from "@playwright/test";

// Playwright E2E for the Ponder Focus/blocker UI.
//
// The blocker backend (Rust `blocker_*` commands) only exists inside the Tauri
// shell, so against the pure Vite dev server we inject a `window.__TAURI_INTERNALS__`
// mock from each test via `page.addInitScript`. The real kill behavior is
// covered by the Rust integration test `kill_loop_terminates_spawned_process`;
// this spec covers the frontend wiring: autocomplete, ARM toggle, blocklist add.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    headless: true,
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});