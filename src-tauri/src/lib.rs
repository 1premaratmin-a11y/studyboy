// StudyBoy — Tauri main library
//
// Phase 1 (Canvas LMS) + Phase 7 (app blocker) commands are wired here.
// Module bodies live in `lms.rs` and `blocker.rs`.

mod ai;
mod blocker;
mod lms;

use std::collections::HashMap;
use std::sync::Arc;

use blocker::{BlockerState, BlockerStatus};

/// Managed app state. The blocker state is shared between the Tauri command
/// thread and the spawned kill-loop task via an `Arc`, so the task satisfies
/// the `'static` bound without unsafe.
struct AppState {
  blocker: Arc<BlockerState>,
}

// ── Phase 1: Canvas LMS ────────────────────────────────────────────────
#[tauri::command]
async fn canvas_connect(
  base_url: String,
  token: String,
) -> Result<lms::CanvasConn, String> {
  lms::canvas_connect(base_url, token).await
}

#[tauri::command]
async fn canvas_sync_courses(
  base_url: String,
  token: String,
) -> Result<Vec<lms::CanvasCourse>, String> {
  lms::canvas_sync_courses(base_url, token).await
}

#[tauri::command]
async fn canvas_sync_assignments(
  base_url: String,
  token: String,
  course_id: i64,
) -> Result<Vec<lms::CanvasAssignment>, String> {
  lms::canvas_sync_assignments(base_url, token, course_id).await
}

// ── Phase 7: app blocker (kill-loop tier) ──────────────────────────────
#[tauri::command]
async fn blocker_start(
  state: tauri::State<'_, AppState>,
  blocklist: Vec<String>,
) -> Result<(), String> {
  blocker::blocker_start(Arc::clone(&state.blocker), blocklist)
}

#[tauri::command]
async fn blocker_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
  blocker::blocker_stop(&state.blocker)
}

#[tauri::command]
fn blocker_status(state: tauri::State<'_, AppState>) -> Result<BlockerStatus, String> {
  Ok(blocker::blocker_status(&state.blocker))
}

#[tauri::command]
fn blocker_list_processes() -> Result<Vec<String>, String> {
  Ok(blocker::blocker_list_processes())
}

// ── AI engine: Cornell note generation (free cloud LLM, Groq default) ──
#[tauri::command]
async fn ai_generate_cornell(
  provider: String,
  base_url: Option<String>,
  api_key: String,
  model: String,
  topic: String,
  sources: String,
) -> Result<ai::CornellOutput, String> {
  ai::ai_generate_cornell(provider, base_url, api_key, model, topic, sources).await
}

#[tauri::command]
async fn ollama_ping(base_url: String) -> Result<(), String> {
  ai::ollama_ping(base_url).await
}

#[tauri::command]
async fn ollama_complete(
  base_url: String,
  model: String,
  system: String,
  user: String,
  max_tokens: u32,
  temperature: f32,
  json_mode: bool,
) -> Result<String, String> {
  ai::ollama_complete(base_url, model, system, user, max_tokens, temperature, json_mode).await
}

#[tauri::command]
async fn ollama_list_models(base_url: String) -> Result<Vec<String>, String> {
  ai::ollama_list_models(base_url).await
}

#[tauri::command]
async fn ollama_ensure_model(base_url: String, model: String) -> Result<String, String> {
  ai::ollama_ensure_model(base_url, model).await
}

#[tauri::command]
async fn ai_fetch(
  url: String,
  method: String,
  headers: HashMap<String, String>,
  body: String,
) -> Result<String, String> {
  ai::ai_fetch(url, method, headers, body).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
      blocker: Arc::new(BlockerState::new()),
    })
    .invoke_handler(tauri::generate_handler![
      canvas_connect,
      canvas_sync_courses,
      canvas_sync_assignments,
      blocker_start,
      blocker_stop,
      blocker_status,
      blocker_list_processes,
      ai_generate_cornell,
      ollama_ping,
      ollama_complete,
      ollama_list_models,
      ollama_ensure_model,
      ai_fetch,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}