// StudyBoy - Ollama autorun hook.
//
// On app boot this probes the local Ollama server and, if it is running,
// auto-selects local mode and ensures the configured model (default
// llama3.2) is pulled and warmed so the first AI request is instant. This
// is the "autorun llama3.2 using ollama" behaviour: the user never has to
// manually start Ollama, pull the model, or switch the Settings toggle.
//
// Behaviour contract:
//   - If not running inside the Tauri desktop app, the hook is a no-op
//     (the Rust ollama_* commands are only available there). In plain
//     browser dev the user can still use cloud mode.
//   - If Ollama is unreachable, the hook leaves llmMode untouched and
//     reports offline so the UI can prompt the user to start Ollama. It
//     never throws - a failed autorun must not block app boot.
//   - If Ollama is reachable AND the user has not explicitly locked to
//     cloud mode with a saved key, the hook switches to local mode and
//     ensures the model. A user who has saved a cloud key is respected
//     (they opted into cloud); the autorun still warms llama3.2 in the
//     background so switching back to local is instant.
//   - The chosen model is the one saved in settings (default "llama3.2"),
//     so changing it in Settings changes what gets auto-run.

import { invoke } from "@tauri-apps/api/core";
import { readAiConfig, saveAiConfig } from "../aiClient";

const inTauri =
  typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__ !== "undefined";

export type AutoRunStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "online"; model: string; message: string }
  | { kind: "warming"; model: string }
  | { kind: "offline"; message: string }
  | { kind: "unavailable"; message: string };

const STATUS_KEY = "studyboy.ollama.autorun";
const LOCK_KEY = "studyboy.llmMode.locked";

/** Mark the current llmMode choice as user-locked so autorun will not
 *  override it on the next boot. Called when the user explicitly changes
 *  the mode in Settings. */
export function lockLlmMode(): void {
  localStorage.setItem(LOCK_KEY, "1");
}

/** Read the last autorun status, if any, so the UI can render it before
 *  the boot probe completes (avoids a flash of "idle"). */
export function readLastStatus(): AutoRunStatus {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return { kind: "idle" };
    return JSON.parse(raw) as AutoRunStatus;
  } catch {
    return { kind: "idle" };
  }
}

function persistStatus(s: AutoRunStatus): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch {
    // ignore quota / private mode
  }
}

/** Probe and warm Ollama on boot. Returns the final status and updates the
 *  persisted status so the UI can show it. Never throws. */
export async function autorunOllama(): Promise<AutoRunStatus> {
  if (!inTauri) {
    const s: AutoRunStatus = {
      kind: "unavailable",
      message: "Run inside the StudyBoy desktop app to auto-start llama3.2.",
    };
    persistStatus(s);
    return s;
  }

  const cfg = readAiConfig();
  const base = cfg.localBaseUrl.trim().replace(/\/v1\/?$/, "");
  const model = cfg.localModel.trim() || "llama3.2";

  persistStatus({ kind: "checking" });

  // 1. Ping - is Ollama running?
  try {
    await invoke<unknown>("ollama_ping", { baseUrl: base });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const s: AutoRunStatus = {
      kind: "offline",
      message: `Ollama not running. ${msg}`,
    };
    persistStatus(s);
    return s;
  }

  // 2. Decide whether to auto-switch to local mode. We switch unless the
  //    user has explicitly locked their choice OR they have a saved cloud
  //    key (opted into cloud). This keeps autorun non-surprising for users
  //    who configured a paid provider.
  const locked = localStorage.getItem(LOCK_KEY) === "1";
  const hasCloudKey = !!cfg.key.trim();
  if (!locked && !hasCloudKey && cfg.llmMode !== "local") {
    saveAiConfig({ llmMode: "local" });
  }

  // 3. Ensure the model is pulled + warmed. This is the actual "autorun
  //    llama3.2" step. A missing model is pulled (single shot), then a
  //    1-token completion loads it into RAM.
  persistStatus({ kind: "warming", model });
  try {
    const message = await invoke<string>("ollama_ensure_model", {
      baseUrl: base,
      model,
    });
    const s: AutoRunStatus = { kind: "online", model, message };
    persistStatus(s);
    return s;
  } catch (e) {
    // The ping succeeded but ensure failed (e.g. pull failed, disk full).
    // Report online-but-not-ready so the UI can show a specific message;
    // local mode still works for any already-pulled model.
    const msg = e instanceof Error ? e.message : String(e);
    const s: AutoRunStatus = {
      kind: "offline",
      message: `Ollama online but could not load ${model}: ${msg}`,
    };
    persistStatus(s);
    return s;
  }
}
