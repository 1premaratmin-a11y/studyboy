import { test, expect, type Page } from "@playwright/test";

// Inject a `window.__TAURI_INTERNALS__` mock so `@tauri-apps/api`'s `invoke`
// resolves against fake blocker commands. Must run BEFORE the app bundle, so
// we use addInitScript (runs before page scripts on each navigation).
async function mockTauri(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: unknown;
      __blockerCalls?: Record<string, unknown[]>;
      __blockerRunning?: boolean;
      __blockerBl?: string[];
    };
    w.__blockerCalls = {};
    w.__blockerRunning = false;
    w.__blockerBl = [];
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        ((w.__blockerCalls as Record<string, unknown[]>)[cmd] ??= []).push(args);
        switch (cmd) {
          case "blocker_list_processes":
            return [
              "steam.exe",
              "discord.exe",
              "chrome.exe",
              "notepad.exe",
              "spotify.exe",
              "code.exe",
              "ponder.exe",
              "epicgames.exe",
              "slack.exe",
            ];
          case "blocker_start":
            w.__blockerRunning = true;
            w.__blockerBl = (args?.blocklist as string[]) ?? [];
            return null;
          case "blocker_stop":
            w.__blockerRunning = false;
            return null;
          case "blocker_status":
            return {
              running: !!w.__blockerRunning,
              killed: 0,
              blocklist: w.__blockerBl ?? [],
            };
          default:
            return null;
        }
      },
    };
  });
}

// Dismiss the boot splash overlay (it grabs pointer events for ~2.6s or until
// a click/keydown). A single keypress dismisses it.
async function dismissSplash(page: Page) {
  await page.keyboard.press("Space");
  // wait for the overlay to drop pointer events
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".fixed.inset-0.z-\\[1000\\]");
      if (!el) return true;
      return (el as HTMLElement).style.pointerEvents === "none";
    },
    { timeout: 5000 },
  ).catch(() => {});
}

async function gotoFocus(page: Page) {
  await page.goto("/");
  await dismissSplash(page);
  // Dismiss the "SYNC LOST" toast — it is fixed top-right and intercepts
  // pointer events over the blocker status panel.
  await page.getByRole("button", { name: "Dismiss notification" }).click().catch(() => {});
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  // Blocker status panel is the landmark we wait on.
  await expect(page.getByRole("region", { name: "Blocker status" })).toBeVisible();
}

test("autocomplete lists running processes and adds on click", async ({ page }) => {
  await mockTauri(page);
  await gotoFocus(page);

  // The blocklist editor input (active profile is blocklist mode).
  const input = page.getByPlaceholder(/search.*block/i);
  await input.click();
  await input.fill("slack");

  // Suggestion dropdown should show slack.exe (not in any seeded list).
  const suggestion = page.getByRole("button", { name: "slack.exe", exact: true });
  await expect(suggestion).toBeVisible();
  await suggestion.click();

  // slack.exe should now appear in the editor's BLOCKED APPS list. Scope to
  // the editor region so pre-existing allowlist entries don't match.
  const editor = page.getByRole("region", { name: "Block profile editor" });
  await expect(editor.getByText("slack.exe", { exact: true })).toBeVisible();
});

test("ARM BLOCKER toggle arms the kill-loop independent of the timer", async ({ page }) => {
  await mockTauri(page);
  await gotoFocus(page);

  // Initially the status badge should read IDLE.
  await expect(page.getByText("IDLE", { exact: true })).toBeVisible();

  // Arm the blocker.
  await page.getByRole("button", { name: "ARM BLOCKER" }).click();

  // blocker_start should have been invoked with the active profile's blocklist
  // (a non-empty array including the seeded steam.exe).
  const calls = await page.evaluate(() => {
    const w = window as unknown as { __blockerCalls?: Record<string, unknown[]> };
    return (w.__blockerCalls?.blocker_start ?? []) as Array<{ blocklist: string[] }>;
  });
  expect(calls.length).toBeGreaterThanOrEqual(1);
  const bl = calls[0]?.blocklist ?? [];
  expect(bl.length).toBeGreaterThan(0);
  expect(bl.map((s) => s.toLowerCase())).toContain("steam.exe");

  // The status poll (every 3s) should eventually flip the badge to BLOCKING.
  await expect(page.getByText("BLOCKING", { exact: true })).toBeVisible({ timeout: 6000 });
});

test("DISARM stops the kill-loop", async ({ page }) => {
  await mockTauri(page);
  await gotoFocus(page);

  await page.getByRole("button", { name: "ARM BLOCKER" }).click();
  await expect(page.getByRole("button", { name: "DISARM" })).toBeVisible();

  await page.getByRole("button", { name: "DISARM" }).click();

  // blocker_stop should have been called.
  const stopCalls = await page.evaluate(() => {
    const w = window as unknown as { __blockerCalls?: Record<string, unknown[]> };
    return (w.__blockerCalls?.blocker_stop ?? []).length;
  });
  expect(stopCalls).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("IDLE", { exact: true })).toBeVisible({ timeout: 6000 });
});