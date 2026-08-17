//! Phase 7 focus app-blocker — kill-loop tier.
//!
//! This module implements the *soft* blocker: a background tokio task that polls
//! the running process list every 2s via `sysinfo` and `kill()`s any process whose
//! name matches an entry in the user's blocklist. It is intentionally simple and
//! portable; it is NOT a hard block. Real hard blocking (Windows Defender
//! Application Control / WDAC, Endpoint Configuration, WMI job objects) is
//! deferred to a later phase.
//!
//! Safety:
//!   - `is_protected()` rejects a fixed allowlist of Windows-critical processes
//!     (explorer, csrss, winlogon, svchost, dwm, ...) plus the app's own pid,
//!     so the loop can never brick the session or kill itself.
//!   - `blocker_start` is idempotent: calling it while running is a no-op.
//!
//! Match rule (documented):
//!   Blocklist entries may be supplied as `"steam"` or `"steam.exe"`. A process
//!   matches an entry when, after lowercasing both sides:
//!     proc.name() == entry            (e.g. "steam.exe" == "steam.exe"), OR
//!     proc.name() == entry + ".exe"   (e.g. "steam.exe" == "steam" + ".exe").
//!   We do NOT do substring/endswith matching — exact name only, to avoid
//!   accidentally killing unrelated processes that happen to share a suffix.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

/// Snapshot returned to the frontend via `blocker_status`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BlockerStatus {
  pub running: bool,
  pub killed: u32,
  pub blocklist: Vec<String>,
}

/// Shared blocker state. Owned by the orchestrator (lib.rs) and passed by
/// reference to the three entry points below. All fields are lock-free or
/// short-held-mutex, so the poll loop never blocks the Tauri command thread.
pub struct BlockerState {
  /// Signals the poll loop to keep running / stop. Checked each tick.
  pub running: AtomicBool,
  /// Total processes killed since the blocker was first started (cumulative,
  /// not reset on stop). Reported to the UI as a "power-downs" counter.
  pub killed: AtomicU32,
  /// Current normalized (lowercased) blocklist. Replaced on each `start`.
  pub blocklist: Mutex<Vec<String>>,
  /// Handle to the spawned poll task, so `stop` can abort it cleanly.
  pub handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl BlockerState {
  pub fn new() -> Self {
    Self {
      running: AtomicBool::new(false),
      killed: AtomicU32::new(0),
      blocklist: Mutex::new(Vec::new()),
      handle: Mutex::new(None),
    }
  }
}

impl Default for BlockerState {
  fn default() -> Self {
    Self::new()
  }
}

/// Windows-critical (and self) process names that must NEVER be killed.
/// Lowercased, with `.exe` suffix. Killing any of these can brick the
/// user's session, the shell, or the StudyBoy app itself.
const PROTECTED: &[&str] = &[
  "explorer.exe",
  "csrss.exe",
  "winlogon.exe",
  "wininit.exe",
  "smss.exe",
  "services.exe",
  "lsass.exe",
  "svchost.exe",
  "dwm.exe",
  "fontdrvhost.exe",
  "taskhostw.exe",
  "sihost.exe",
  "ctfmon.exe",
  // Generic bundled-app exe names that some Tauri shims use; never kill self
  // regardless of how the app was packaged.
  "app.exe",
  "ponder.exe",
];

/// Returns true if `name` (lowercased) is on the protected list.
fn is_protected(name: &str) -> bool {
  let n = name.to_lowercase();
  PROTECTED.iter().any(|p| *p == n)
}

/// Returns true if a process name matches any blocklist entry under the
/// documented rule: exact (case-insensitive) match, or exact match when
/// appending ".exe" to a bare entry.
fn matches_blocklist(proc_name: &str, blocklist: &[String]) -> bool {
  let p = proc_name.to_lowercase();
  for entry in blocklist {
    let e = entry.to_lowercase();
    if p == e {
      return true;
    }
    // Allow bare "steam" to match "steam.exe".
    if !e.contains('.') && p == format!("{}.exe", e) {
      return true;
    }
  }
  false
}

/// Start the kill-loop. Idempotent: a second call while running is a no-op.
///
/// Stores the (normalized, lowercased) blocklist, sets `running=true`, and
/// spawns a tokio task that polls every 2s until `blocker_stop` is called.
/// If the blocklist is empty, the loop still runs but performs no kills —
/// this keeps status reporting simple and lets the user add entries later
/// without restarting the blocker.
pub fn blocker_start(state: Arc<BlockerState>, blocklist: Vec<String>) -> Result<(), String> {
  // Idempotent: if already running, just refresh the blocklist in place.
  let already = state.running.load(Ordering::SeqCst);
  if already {
    // Still update the blocklist so the live loop picks up changes.
    let mut bl = state
      .blocklist
      .lock()
      .map_err(|e| format!("blocklist lock poisoned: {}", e))?;
    *bl = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
    return Ok(());
  }

  // Store normalized blocklist.
  {
    let mut bl = state
      .blocklist
      .lock()
      .map_err(|e| format!("blocklist lock poisoned: {}", e))?;
    *bl = blocklist.into_iter().map(|s| s.to_lowercase()).collect();
  }

  state.running.store(true, Ordering::SeqCst);

  // Clone the Arc for the spawned task. BlockerState is Send+Sync (all fields
  // are atomics or short-held mutexes), so the 'static bound is satisfied
  // without unsafe — the Arc keeps the state alive until the loop exits and
  // `blocker_stop` aborts the handle.
  let task_state = Arc::clone(&state);

  let handle = tokio::spawn(async move {
    let mut sys = System::new();
    // Self-protection: the app's own exe (app.exe in dev, Ponder.exe in
    // release) is on the PROTECTED list below, so the loop can never kill
    // itself. We additionally skip our own pid via std::process::id().
    let own_pid_u32 = std::process::id();

    while task_state.running.load(Ordering::SeqCst) {
      // Refresh the process list in place each tick, removing dead entries.
      // sysinfo 0.32: refresh_processes_specifics(ProcessesToUpdate, remove_dead, kind).
      sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::everything());

      // Snapshot the blocklist under the lock, then release immediately so
      // `blocker_start` can update it concurrently without waiting on kills.
      let bl_snapshot: Vec<String> = match task_state.blocklist.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => Vec::new(),
      };

      if !bl_snapshot.is_empty() {
        for (pid, proc) in sys.processes() {
          // Never kill self. Pid stringifies to the OS pid.
          if pid.to_string() == own_pid_u32.to_string() {
            continue;
          }
          let name = proc.name().to_string_lossy().to_string();
          if name.is_empty() {
            continue;
          }
          if is_protected(&name) {
            continue;
          }
          if matches_blocklist(&name, &bl_snapshot) {
            if proc.kill() {
              task_state.killed.fetch_add(1, Ordering::SeqCst);
              log::info!("[blocker] killed {} (pid {})", name, pid);
            } else {
              log::warn!("[blocker] failed to kill {} (pid {})", name, pid);
            }
          }
        }
      }

      // Sleep 2s between ticks. Using `tokio::time::sleep` keeps this
      // cooperative with the async runtime.
      tokio::time::sleep(Duration::from_millis(2000)).await;
    }
  });

  // Stash the handle so `stop` can abort it.
  let mut h = state
    .handle
    .lock()
    .map_err(|e| format!("handle lock poisoned: {}", e))?;
  *h = Some(handle);

  Ok(())
}

/// Stop the kill-loop. Clears the `running` flag (the loop exits on its next
/// tick, within 2s) and aborts the spawned task. The blocklist is preserved so
/// `blocker_status` can still report the last-used list. Cumulative `killed`
/// counter is also preserved.
pub fn blocker_stop(state: &BlockerState) -> Result<(), String> {
  state.running.store(false, Ordering::SeqCst);

  let mut h = state
    .handle
    .lock()
    .map_err(|e| format!("handle lock poisoned: {}", e))?;
  if let Some(handle) = h.take() {
    // Best-effort abort; if the task already exited (loop saw running=false),
    // abort is a no-op.
    handle.abort();
  }

  Ok(())
}

/// List currently-running process names for the frontend autocomplete.
///
/// Returns deduped, sorted, lowercased names WITH the `.exe` suffix on Windows
/// (sysinfo's `Process::name()` includes it). Protected/critical names are NOT
/// filtered out here — the frontend may show them, but `is_protected()` will
/// still prevent the kill loop from ever terminating them. Pure read, spawns
/// no task, holds no blocker lock.
pub fn blocker_list_processes() -> Vec<String> {
  let mut sys = System::new();
  sys.refresh_processes_specifics(
    ProcessesToUpdate::All,
    false,
    ProcessRefreshKind::new(),
  );
  let mut names: Vec<String> = sys
    .processes()
    .values()
    .map(|p| p.name().to_string_lossy().to_lowercase().to_string())
    .filter(|n| !n.is_empty())
    .collect();
  names.sort();
  names.dedup();
  names
}

/// Snapshot the current blocker state for the UI. Pure read, never blocks
/// for long (mutexes are held only to clone small values).
pub fn blocker_status(state: &BlockerState) -> BlockerStatus {
  let blocklist = state
    .blocklist
    .lock()
    .map(|g| g.clone())
    .unwrap_or_default();
  BlockerStatus {
    running: state.running.load(Ordering::SeqCst),
    killed: state.killed.load(Ordering::SeqCst),
    blocklist,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn protected_is_case_insensitive() {
    assert!(is_protected("Explorer.exe"));
    assert!(is_protected("CSRSS.EXE"));
    assert!(!is_protected("steam.exe"));
  }

  #[test]
  fn blocklist_match_bare_and_full() {
    let bl = vec!["steam".to_string(), "discord.exe".to_string()];
    assert!(matches_blocklist("steam.exe", &bl));
    assert!(matches_blocklist("STEAM.EXE", &bl));
    assert!(matches_blocklist("discord.exe", &bl));
    assert!(!matches_blocklist("steam_helper.exe", &bl));
    assert!(!matches_blocklist("discordhelper.exe", &bl));
  }

  #[test]
  fn start_then_status_reports_running() {
    let state = BlockerState::new();
    // We can't run a real tokio task here without a runtime, so just test
    // the state plumbing: set running and read it back.
    state.running.store(true, Ordering::SeqCst);
    state.killed.store(3, Ordering::SeqCst);
    let s = blocker_status(&state);
    assert!(s.running);
    assert_eq!(s.killed, 3);
  }

  /// End-to-end functional test of the kill loop: spawn a real long-lived,
  /// windowless child process (`ping -t 127.0.0.1`), arm the blocker with
  /// `ping.exe` on its blocklist, and assert the loop terminates it within a
  /// few tick cycles. This is the proof that blocking actually works on
  /// Windows — not just that matching is correct.
  // Multi-thread runtime: the kill loop is a `tokio::spawn`d task that only
  // makes progress on a worker thread. The default current-thread test runtime
  // would starve it while the test blocks. The real Tauri app uses a
  // multi-thread runtime, so this mirrors production.
  #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
  async fn kill_loop_terminates_spawned_process() {
    use std::process::{Command, Stdio};
    use std::time::Duration;

    // Spawn ping with -t (infinite). Windowless, harmless, uniquely named
    // enough for the test. We own this child and clean it up either way.
    let mut child = Command::new("ping.exe")
      .arg("-t")
      .arg("127.0.0.1")
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .expect("spawn ping.exe for blocker test");
    let pid = child.id();

    let state = Arc::new(BlockerState::new());
    blocker_start(Arc::clone(&state), vec!["ping.exe".to_string()])
      .expect("blocker_start");

    // The loop ticks every 2s. Poll up to ~9s for the child to die.
    let mut killed = false;
    for _ in 0..30 {
      tokio::time::sleep(Duration::from_millis(300)).await;
      if let Ok(Some(_status)) = child.try_wait() {
        killed = true;
        break;
      }
    }

    blocker_stop(&state).expect("blocker_stop");

    // Cleanup: if it somehow survived, kill it ourselves.
    if !killed {
      let _ = child.kill();
      let _ = child.wait();
    }

    assert!(killed, "blocker did not kill spawned ping.exe (pid {})", pid);
    assert!(
      state.killed.load(Ordering::SeqCst) >= 1,
      "killed counter not incremented"
    );
  }
}