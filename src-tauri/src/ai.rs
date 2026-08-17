//! StudyBoy AI Notes engine — real cloud LLM client for Cornell note generation.
//!
//! Default provider is **Groq** (free tier, no credit card; user supplies a key
//! from <https://console.groq.com>). Groq exposes an OpenAI-compatible Chat
//! Completions endpoint, so any other OpenAI-compatible endpoint (OpenAI itself,
//! OpenRouter, Together, a local llama.cpp/Ollama server with the OpenAI shim,
//! etc.) also works by selecting the `custom` provider and supplying a base URL.
//!
//! This module only exposes plain async functions and serializable structs.
//! The Tauri command wiring (#[tauri::command], registration in lib.rs) is done
//! by the orchestrator — do not add command attributes here.
//!
//! Security: the API key is never logged. Only the provider id, model id, and
//! success/failure outcome are emitted at info/warn level.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use url::Url;

// ── SSRF guard ──────────────────────────────────────────────────────────
// The webview can call ai_fetch / ollama_ping / ollama_complete with any URL.
// Without validation, malicious/compromised webview JS (or an XSS) could reach
// internal-only endpoints through the Rust side — bypassing the browser's
// same-origin/mixed-content rules that ai_fetch exists to defeat (e.g. cloud
// metadata at 169.254.169.254, internal services on private ranges). So:
//   - https is allowed to any host (cloud LLM providers).
//   - http is allowed only to loopback or RFC1918 private LAN (local/LAN
//     Ollama + self-hosted model servers). Public http must use https.
//   - link-local (169.254/16, fe80::/10) is always rejected — blocks cloud
//     metadata endpoints over either scheme.
fn is_link_local_ip(ip: &std::net::IpAddr) -> bool {
  match ip {
    std::net::IpAddr::V4(v4) => v4.is_link_local(),
    std::net::IpAddr::V6(v6) => {
      let o = v6.octets();
      (o[0] == 0xFE) && ((o[1] & 0xC0) == 0x80)
    }
  }
}

fn is_private_ip(ip: &std::net::IpAddr) -> bool {
  match ip {
    std::net::IpAddr::V4(v4) => v4.is_private(),
    std::net::IpAddr::V6(_) => false,
  }
}

/// Validate an outbound URL for the AI relay commands. See module docs above.
fn ai_ssrf_ok(url_str: &str) -> Result<(), String> {
  let parsed = Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;
  let host = parsed
    .host_str()
    .ok_or_else(|| "URL has no host.".to_string())?;
  let ip = host.parse::<std::net::IpAddr>().ok();
  // Block link-local always — cloud-metadata SSRF vector under any scheme.
  if let Some(ref ip) = ip {
    if is_link_local_ip(ip) {
      return Err(format!(
        "URL must not point to a link-local address ({}).",
        host
      ));
    }
  }
  match parsed.scheme() {
    "https" => Ok(()),
    "http" => {
      let allowed = host.eq_ignore_ascii_case("localhost")
        || ip
          .map(|ip| ip.is_loopback() || is_private_ip(&ip))
          .unwrap_or(false);
      if allowed {
        Ok(())
      } else {
        Err(format!(
          "http is only allowed to localhost/LAN; use https for {}.",
          host
        ))
      }
    }
    other => Err(format!("URL scheme '{}' not allowed.", other)),
  }
}

// ── Output schema ───────────────────────────────────────────────────────

/// A single flashcard question/answer pair within a Cornell section.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CornellQcard {
  pub q: String,
  pub a: String,
}

/// One Cornell section: a sub-topic with review cues, bullet notes, and Q/A cards.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CornellSection {
  pub topic: String,
  pub cues: Vec<String>,
  pub notes: Vec<String>,
  pub qcards: Vec<CornellQcard>,
}

/// Full Cornell notes payload returned to the frontend.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CornellOutput {
  pub summary: String,
  pub sections: Vec<CornellSection>,
}

// ── Constants ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT: &str = "You are a study-note generator. Produce Cornell-style notes STRICTLY as JSON. Schema: {\"summary\":string, \"sections\":[{\"topic\":string, \"cues\":[string], \"notes\":[string], \"qcards\":[{\"q\":string,\"a\":string}]}]}. 2-4 sections. cues=review questions, notes=bullet facts, qcards=flashcard Q/A. Output ONLY the JSON object, no markdown fences, no prose.";

const TIMEOUT_SECS: u64 = 30;
const MAX_TOKENS: u32 = 1200;
const TEMPERATURE: f32 = 0.4;

// ── Endpoint resolution ─────────────────────────────────────────────────

/// Resolve the chat completions endpoint for the given provider.
///
/// `groq`  -> `https://api.groq.com/openai/v1/chat/completions`
/// `custom` -> `base_url + /chat/completions` (or `base_url` verbatim if it
///            already ends with `/chat/completions`). Empty base URL is an error.
fn resolve_endpoint(provider: &str, base_url: &Option<String>) -> Result<String, String> {
  match provider {
    "groq" => Ok("https://api.groq.com/openai/v1/chat/completions".to_string()),
    "custom" => {
      let raw = base_url
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
      if raw.is_empty() {
        return Err("custom provider needs a base URL".to_string());
      }
      if raw.ends_with("/chat/completions") {
        Ok(raw)
      } else {
        let trimmed = raw.trim_end_matches('/');
        Ok(format!("{}/chat/completions", trimmed))
      }
    }
    other => Err(format!("Unknown AI provider: '{}'", other)),
  }
}

/// Build the OpenAI-compatible chat completions request body.
fn build_body(model: &str, user_prompt: &str, use_response_format: bool) -> serde_json::Value {
  let mut body = serde_json::json!({
    "model": model,
    "messages": [
      { "role": "system", "content": SYSTEM_PROMPT },
      { "role": "user",   "content": user_prompt },
    ],
    "temperature": TEMPERATURE,
    "max_tokens": MAX_TOKENS,
  });
  if use_response_format {
    body["response_format"] = serde_json::json!({ "type": "json_object" });
  }
  body
}

/// Build a one-shot reqwest client (rustls, 30s timeout). Returns a Result so
/// a TLS-backend/init failure surfaces as the command's human-readable error
/// string instead of panicking the command thread (consistent with the other
/// three client builders in this module).
fn build_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))
}

/// Build the user prompt from topic + sources.
fn build_user_prompt(topic: &str, sources: &str) -> String {
  let src_block = if sources.trim().is_empty() {
    "(none provided — use general knowledge)"
  } else {
    sources
  };
  format!(
    "Topic: {}\n\nSources:\n{}\n\nGenerate Cornell notes as JSON per schema.",
    topic, src_block
  )
}

// ── Response parsing ────────────────────────────────────────────────────

/// Extract the assistant message content string from an OpenAI-compatible
/// chat completions response.
fn extract_content(resp: &serde_json::Value) -> Result<String, String> {
  let content = resp
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c| c.get("message"))
    .and_then(|m| m.get("content"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "LLM response missing choices[0].message.content".to_string())?;
  Ok(content.to_string())
}

/// Strip leading/trailing markdown code fences (```json ... ```) and stray
/// whitespace from a model output so it can be parsed as JSON.
fn strip_fences(content: &str) -> String {
  let trimmed = content.trim();
  let no_fences = if trimmed.starts_with("```") {
    // Drop the opening fence line (and any language tag like ```json).
    let after_open = trimmed
      .find('\n')
      .map(|i| &trimmed[i + 1..])
      .unwrap_or(trimmed);
    // Drop a trailing fence if present.
    if let Some(close) = after_open.rfind("```") {
      after_open[..close].trim().to_string()
    } else {
      after_open.trim().to_string()
    }
  } else {
    trimmed.to_string()
  };
  no_fences.trim().to_string()
}

/// Leniently parse a CornellOutput from a content string.
///
/// First tries a direct parse; on failure, narrows to the substring from the
/// first '{' to the last '}' and retries. Returns an error with an excerpt on
/// final failure.
fn parse_cornell(content: &str) -> Result<CornellOutput, String> {
  let cleaned = strip_fences(content);
  if let Ok(out) = serde_json::from_str::<CornellOutput>(&cleaned) {
    return Ok(out);
  }
  // Fallback: isolate the outermost JSON object.
  let start = cleaned.find('{');
  let end = cleaned.rfind('}');
  if let (Some(s), Some(e)) = (start, end) {
    if e > s {
      let slice = &cleaned[s..=e];
      if let Ok(out) = serde_json::from_str::<CornellOutput>(slice) {
        return Ok(out);
      }
    }
  }
  let excerpt: String = cleaned.chars().take(240).collect();
  Err(format!(
    "LLM did not return valid Cornell JSON: {}",
    excerpt
  ))
}

/// Perform a single POST to the chat completions endpoint, returning the
/// raw response JSON value.
async fn post_completion(
  client: &reqwest::Client,
  endpoint: &str,
  api_key: &str,
  body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
  let resp = client
    .post(endpoint)
    .header("Authorization", format!("Bearer {}", api_key.trim()))
    .header("Content-Type", "application/json")
    .json(body)
    .send()
    .await
    .map_err(|e| format!("HTTP request failed: {}", e))?;

  let status = resp.status();
  if !status.is_success() {
    let body_text = resp.text().await.unwrap_or_default();
    let excerpt: String = body_text.chars().take(240).collect();
    return Err(format!("LLM request failed ({}): {}", status, excerpt));
  }

  resp
    .json::<serde_json::Value>()
    .await
    .map_err(|e| format!("Failed to parse LLM response JSON: {}", e))
}

// ── Public entry point ──────────────────────────────────────────────────

/// Generic HTTPS request relay for the frontend. The Tauri webview origin is
/// `tauri://localhost`; cloud LLM endpoints (OpenAI, Groq, Anthropic, …) do not
/// emit CORS `Access-Control-Allow-Origin` headers, so a browser `fetch` from
/// that origin is blocked ("Failed to fetch"). Routing the request through
/// reqwest (Rust) bypasses CORS entirely. Returns the response body on 2xx; on
/// a non-success status returns `Err("HTTP {status}: {excerpt}")` so the
/// frontend's existing error parsing/retry logic keeps working unchanged.
pub async fn ai_fetch(
  url: String,
  method: String,
  headers: HashMap<String, String>,
  body: String,
) -> Result<String, String> {
  // Reject internal/metadata/link-local targets before anything leaves the process.
  ai_ssrf_ok(&url)?;
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))?;
  let m = method.trim().to_ascii_uppercase();
  let method = match m.as_str() {
    "POST" => reqwest::Method::POST,
    "GET" => reqwest::Method::GET,
    "PUT" => reqwest::Method::PUT,
    "DELETE" => reqwest::Method::DELETE,
    other => return Err(format!("unsupported HTTP method: {}", other)),
  };
  let mut req = client.request(method, &url);
  for (k, v) in &headers {
    req = req.header(k, v);
  }
  if !body.is_empty() {
    req = req.body(body);
  }
  let resp = req
    .send()
    .await
    .map_err(|e| format!("Request failed: {}", e))?;
  let status = resp.status();
  let text = resp
    .text()
    .await
    .map_err(|e| format!("Failed to read response body: {}", e))?;
  if status.is_success() {
    Ok(text)
  } else {
    let excerpt: String = text.chars().take(240).collect();
    Err(format!("HTTP {}: {}", status.as_u16(), excerpt))
  }
}

/// Normalize an Ollama base URL: trim whitespace, strip trailing slashes and
/// a trailing "/v1" segment. Returns Err on an empty result. Shared by all
/// ollama_* commands so the normalization lives in one place.
fn normalize_ollama_base(base_url: &str) -> Result<String, String> {
  let base = base_url.trim().trim_end_matches("/").trim_end_matches("/v1");
  if base.is_empty() {
    Err("Ollama base URL is empty.".to_string())
  } else {
    Ok(base.to_string())
  }
}

/// Ping an Ollama server (GET {base}/api/tags) to confirm it's running and
/// reachable. Used by the Settings "PING OLLAMA" button. No auth. `base_url`
/// should be the bare host (e.g. http://localhost:11434) — any trailing
/// `/v1` is stripped first.
pub async fn ollama_ping(base_url: String) -> Result<(), String> {
  let base = normalize_ollama_base(&base_url)?;
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(5))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))?;
  let url = format!("{}/api/tags", base);
  ai_ssrf_ok(&url)?;
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Cannot reach Ollama at {}: {}", base, e))?;
  if resp.status().is_success() {
    Ok(())
  } else {
    Err(format!("Ollama responded {}", resp.status().as_u16()))
  }
}

/// Generate a completion against a local Ollama server's OpenAI-compatible
/// shim (POST {base}/chat/completions). This runs through reqwest (Rust) so it
/// bypasses the webview's mixed-content + CORS restrictions that block a
/// browser-side `fetch` to http://localhost from the secure tauri:// origin.
/// `base_url` is the configured local base (e.g. http://localhost:11434/v1);
/// a trailing `/` is trimmed. Returns the assistant message content string.
pub async fn ollama_complete(
  base_url: String,
  model: String,
  system: String,
  user: String,
  max_tokens: u32,
  temperature: f32,
  json_mode: bool,
) -> Result<String, String> {
  let base = base_url.trim().trim_end_matches('/').to_string();
  if base.is_empty() {
    return Err("Ollama base URL is empty.".to_string());
  }
  if model.trim().is_empty() {
    return Err("No local model selected. Pick one in Settings.".to_string());
  }
  // Normalize to the OpenAI shim path /v1/chat/completions. Accepts either a
  // bare host (http://localhost:11434) or one already carrying /v1 — strip any
  // trailing /v1 then re-add it, so a missing or doubled segment can't 404.
  let root = base.trim_end_matches("/v1").trim_end_matches('/');
  let url = format!("{}/v1/chat/completions", root);
  ai_ssrf_ok(&url)?;

  let mut body = serde_json::json!({
    "model": model,
    "messages": [
      { "role": "system", "content": system },
      { "role": "user",   "content": user },
    ],
    "temperature": temperature,
    "max_tokens": max_tokens,
  });
  if json_mode {
    body["response_format"] = serde_json::json!({ "type": "json_object" });
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))?;

  let resp = client
    .post(&url)
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("Cannot reach Ollama at {}: {}", base, e))?;

  let status = resp.status();
  if !status.is_success() {
    let body_text = resp.text().await.unwrap_or_default();
    let excerpt: String = body_text.chars().take(240).collect();
    return Err(format!("Ollama request failed ({}): {}", status, excerpt));
  }

  let data: serde_json::Value = resp
    .json()
    .await
    .map_err(|e| format!("Failed to parse Ollama response JSON: {}", e))?;

  let content = data
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c| c.get("message"))
    .and_then(|m| m.get("content"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "Ollama response missing choices[0].message.content".to_string())?;
  Ok(content.to_string())
}

/// List locally-pulled Ollama models (GET {base}/api/tags). Returns the model
/// names (e.g. ["llama3.2:latest", "gemma3:latest"]). Used by the frontend to
/// populate the local-model picker and by the autorun hook to check whether
/// `llama3.2` is already available before issuing a pull.
pub async fn ollama_list_models(base_url: String) -> Result<Vec<String>, String> {
  let base = normalize_ollama_base(&base_url)?;
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))?;
  let url = format!("{}/api/tags", base);
  ai_ssrf_ok(&url)?;
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Cannot reach Ollama at {}: {}", base, e))?;
  if !resp.status().is_success() {
    return Err(format!("Ollama /api/tags responded {}", resp.status().as_u16()));
  }
  let data: serde_json::Value = resp
    .json()
    .await
    .map_err(|e| format!("Failed to parse Ollama /api/tags JSON: {}", e))?;
  let mut names: Vec<String> = Vec::new();
  if let Some(models) = data.get("models").and_then(|m| m.as_array()) {
    for m in models {
      if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
        names.push(name.to_string());
      }
    }
  }
  Ok(names)
}

/// Ensure a model is pulled and warm on the Ollama server. This is the
/// "autorun" primitive: on app boot the frontend calls this with
/// `model = "llama3.2"` so StudyBoy automatically makes llama3.2 ready to
/// serve completions without the user manually pulling it or switching mode.
///
/// Flow:
///   1. Ping the server (GET /api/tags). If unreachable → Err (frontend falls
///      back to cloud mode with a clear message).
///   2. If the model is already listed → skip pull, go to warm.
///   3. If missing → POST /api/pull {model, stream:false} and wait for it to
///      finish (single shot, no progress stream). A 2 MB pull like llama3.2
///      3B/Q4_K_M completes in seconds on a warm connection; large pulls use
///      the 10-minute timeout.
///   4. Warm: issue a 1-token completion so the model is loaded into RAM and
///      the first real request isn't slow. Errors here are non-fatal (logged,
///      returned as part of the status, but the model is still usable).
///
/// Returns a human-readable status string the frontend shows in the UI.
pub async fn ollama_ensure_model(
  base_url: String,
  model: String,
) -> Result<String, String> {
  let base = normalize_ollama_base(&base_url)?;
  if model.trim().is_empty() {
    return Err("No model specified to ensure.".to_string());
  }
  let model = model.trim().to_string();
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(600))
    .use_rustls_tls()
    .build()
    .map_err(|e| format!("client build failed: {}", e))?;

  // 1. Ping
  let tags_url = format!("{}/api/tags", base);
  ai_ssrf_ok(&tags_url)?;
  let resp = client
    .get(&tags_url)
    .send()
    .await
    .map_err(|e| format!("Cannot reach Ollama at {}: {}", base, e))?;
  if !resp.status().is_success() {
    return Err(format!("Ollama responded {} (is it running?)", resp.status().as_u16()));
  }
  let tags: serde_json::Value = resp
    .json()
    .await
    .map_err(|e| format!("Failed to parse Ollama /api/tags JSON: {}", e))?;

  // 2. Is the model already pulled? Match either exact name or the common
  //    "llama3.2" ↔ "llama3.2:latest" alias so a bare tag works.
  let have = tags
    .get("models")
    .and_then(|m| m.as_array())
    .map(|arr| {
      arr.iter().any(|m| {
        m.get("name")
          .and_then(|n| n.as_str())
          .map(|n| {
            n == model
              || n == format!("{}:latest", model)
              || n.trim_end_matches(":latest") == model
          })
          .unwrap_or(false)
      })
    })
    .unwrap_or(false);

  // 3. Pull if missing
  if !have {
    log::info!("ollama_ensure_model: pulling {} (not present)", model);
    let pull_url = format!("{}/api/pull", base);
    ai_ssrf_ok(&pull_url)?;
    let pull_body = serde_json::json!({ "model": model, "stream": false });
    let pull_resp = client
      .post(&pull_url)
      .header("Content-Type", "application/json")
      .json(&pull_body)
      .send()
      .await
      .map_err(|e| format!("Pull request failed for {}: {}", model, e))?;
    let pull_status = pull_resp.status();
    if !pull_status.is_success() {
      let body_text = pull_resp.text().await.unwrap_or_default();
      let excerpt: String = body_text.chars().take(240).collect();
      return Err(format!("Pull {} failed ({}): {}", model, pull_status.as_u16(), excerpt));
    }
    // Drain the body (stream:false still returns a final JSON status object)
    let _ = pull_resp.text().await;
  }

  // 4. Warm the model with a 1-token completion so it's resident in RAM.
  //    Non-fatal: if this fails we still report success (model is pulled).
  let warm_url = format!("{}/v1/chat/completions", base);
  let warm_body = serde_json::json!({
    "model": model,
    "messages": [ { "role": "user", "content": "OK" } ],
    "max_tokens": 1,
    "temperature": 0,
  });
  let warm_result = client
    .post(&warm_url)
    .header("Content-Type", "application/json")
    .json(&warm_body)
    .send()
    .await;
  if let Err(e) = warm_result {
    log::warn!("ollama_ensure_model: warm-up request failed (non-fatal): {}", e);
  }

  let status = if have {
    format!("{} ready (already pulled, warmed)", model)
  } else {
    format!("{} pulled and warmed", model)
  };
  log::info!("ollama_ensure_model: {}", status);
  Ok(status)
}

/// Generate Cornell-style notes from a cloud LLM.
///
/// `provider` selects the endpoint family (`"groq"` or `"custom"`). For `custom`,
/// `base_url` must point at an OpenAI-compatible chat completions endpoint (or
/// its base, to which `/chat/completions` is appended). `api_key` is sent as a
/// Bearer token. `model` is the provider's model id (Groq default:
/// `llama-3.1-8b-instant`). `topic` and `sources` seed the note content.
///
/// On success, returns a [`CornellOutput`]. On failure, returns a human-readable
/// error string so the frontend can fall back to the deterministic stub.
pub async fn ai_generate_cornell(
  provider: String,
  base_url: Option<String>,
  api_key: String,
  model: String,
  topic: String,
  sources: String,
) -> Result<CornellOutput, String> {
  if api_key.trim().is_empty() {
    return Err("No API key provided. Add one in Settings to use cloud AI.".to_string());
  }
  if model.trim().is_empty() {
    return Err("No model selected. Pick one in Settings.".to_string());
  }
  if topic.trim().is_empty() {
    return Err("Topic is required to generate Cornell notes.".to_string());
  }

  let endpoint = resolve_endpoint(&provider, &base_url)?;
  let user_prompt = build_user_prompt(&topic, &sources);
  let client = build_client()?;

  log::info!(
    "ai_generate_cornell: provider={} model={} endpoint=<redacted> requesting",
    provider,
    model
  );

  // First attempt: request structured JSON output via response_format.
  let body_strict = build_body(&model, &user_prompt, true);
  let resp = match post_completion(&client, &endpoint, &api_key, &body_strict).await {
    Ok(v) => v,
    Err(e) => {
      log::warn!(
        "ai_generate_cornell: provider={} model={} strict request failed: {}",
        provider,
        model,
        e
      );
      return Err(e);
    }
  };

  let content = match extract_content(&resp) {
    Ok(c) => c,
    Err(e) => {
      log::warn!(
        "ai_generate_cornell: provider={} model={} could not extract content: {}",
        provider,
        model,
        e
      );
      return Err(e);
    }
  };

  // Try parsing the strict-mode output. If the provider/model rejected
  // `response_format` (some don't support it), retry once without it and
  // rely on fence stripping to clean up the free-form output.
  match parse_cornell(&content) {
    Ok(out) => {
      log::info!(
        "ai_generate_cornell: provider={} model={} OK ({} sections, strict)",
        provider,
        model,
        out.sections.len()
      );
      Ok(out)
    }
    Err(strict_err) => {
      log::warn!(
        "ai_generate_cornell: provider={} model={} strict parse failed ({}); retrying without response_format",
        provider,
        model,
        strict_err
      );

      let body_loose = build_body(&model, &user_prompt, false);
      let resp_loose = post_completion(&client, &endpoint, &api_key, &body_loose).await?;
      let content_loose = extract_content(&resp_loose)?;

      match parse_cornell(&content_loose) {
        Ok(out) => {
          log::info!(
            "ai_generate_cornell: provider={} model={} OK ({} sections, loose)",
            provider,
            model,
            out.sections.len()
          );
          Ok(out)
        }
        Err(loose_err) => {
          log::warn!(
            "ai_generate_cornell: provider={} model={} loose parse failed: {}",
            provider,
            model,
            loose_err
          );
          Err(loose_err)
        }
      }
    }
  }
}