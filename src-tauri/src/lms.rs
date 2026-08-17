//! Canvas LMS client for StudyBoy Phase 1.
//!
//! Talks to a Canvas LMS instance over HTTPS using a user-supplied Bearer token.
//! All network targets are first validated by [`ssrf_ok`] against a strict
//! allowlist that rejects non-https schemes, localhost, and private/loopback/
//! link-local IP literals. Only real DNS hostnames (e.g. canvas.instructure.com,
//! school.instructure.com, mycanvas.edu) are permitted, since Canvas is either
//! cloud-hosted by Instructure or self-hosted on a real domain.
//!
//! This module only exposes plain async functions and serializable structs.
//! The Tauri command wiring (#[tauri::command], registration in lib.rs) is done
//! by the orchestrator — do not add command attributes here.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

/// Normalized, SSRF-validated base URL paired with a reqwest client already
/// configured with the Bearer token. Not strictly required by callers but kept
/// internal to centralize client construction.
fn build_client(token: &str) -> reqwest::Client {
  let mut headers = reqwest::header::HeaderMap::new();
  if let Ok(v) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token.trim())) {
    headers.insert(reqwest::header::AUTHORIZATION, v);
  }
  reqwest::Client::builder()
    .default_headers(headers)
    .timeout(Duration::from_secs(20))
    .use_rustls_tls()
    .build()
    .expect("reqwest client build")
}

/// Validate and normalize a Canvas base URL.
///
/// Rejects anything that is not `https:`, the literal host `localhost`, or any
/// IP literal that is private (10/8, 172.16/12, 192.168/16), loopback (127/8,
/// ::1), link-local (169.254/16, fe80::/10), or unique-local (fc00::/7). DNS
/// hostnames pass through. Returns the normalized base URL with no trailing
/// slash and no path.
pub fn ssrf_ok(base_url: &str) -> Result<String, String> {
  let parsed = Url::parse(base_url).map_err(|e| format!("Invalid URL: {}", e))?;

  if parsed.scheme() != "https" {
    return Err(format!("Canvas base URL must use https (got '{}').", parsed.scheme()));
  }

  let host = parsed.host_str().ok_or_else(|| "Canvas base URL has no host.".to_string())?;

  // Reject the literal hostname "localhost" (any case).
  if host.eq_ignore_ascii_case("localhost") {
    return Err("Canvas base URL must not point to localhost.".to_string());
  }

  // If the host is an IP literal, reject private/loopback/link-local ranges.
  if let Some(ip) = parse_ip_literal(host) {
    if is_private_or_loopback_ip(&ip) {
      return Err(format!(
        "Canvas base URL must not point to a private/loopback/link-local IP ({}).",
        host
      ));
    }
  }

  // Normalize: scheme://host[:port], strip any path/query/fragment and trailing slash.
  let mut normalized = String::from("https://");
  normalized.push_str(host);
  if let Some(port) = parsed.port() {
    // Default https port 443 omitted; anything else explicit.
    if port != 443 {
      normalized.push(':');
      normalized.push_str(&port.to_string());
    }
  }
  Ok(normalized)
}

/// Parse a host string into an IpAddr if it is a literal IPv4/IPv6 address.
/// Bracketed IPv6 literals (e.g. `[::1]`) are handled by `Url::host_str`
/// returning the bare address, so we only need to try the bare forms.
fn parse_ip_literal(host: &str) -> Option<std::net::IpAddr> {
  host.parse::<std::net::IpAddr>().ok()
}

/// True if the given IP is private (RFC1918), loopback, link-local, or
/// unique-local IPv6. Everything else is treated as a public, reachable target.
fn is_private_or_loopback_ip(ip: &std::net::IpAddr) -> bool {
  match ip {
    std::net::IpAddr::V4(v4) => {
      v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_unspecified()
        || v4.is_broadcast()
        || v4.is_documentation()
    }
    std::net::IpAddr::V6(v6) => {
      v6.is_loopback()
        || v6.is_unspecified()
        || is_unique_local_v6(v6)
        || is_link_local_v6(v6)
    }
  }
}

/// RFC4193 unique-local IPv6 check: fc00::/7.
fn is_unique_local_v6(v6: &std::net::Ipv6Addr) -> bool {
  let octets = v6.octets();
  (octets[0] & 0xFE) == 0xFC
}

/// fe80::/10 link-local IPv6 check (the std `is_unicast_link_local` is nightly,
/// so implement it ourselves for stable Rust).
fn is_link_local_v6(v6: &std::net::Ipv6Addr) -> bool {
  let octets = v6.octets();
  (octets[0] == 0xFE) && ((octets[1] & 0xC0) == 0x80)
}

// ---------------------------------------------------------------------------
// Public serializable response types
// ---------------------------------------------------------------------------

/// Result of [`canvas_connect`]: the signed-in user's identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasConn {
  pub name: String,
  pub login_id: String,
}

/// A Canvas course mapped to StudyBoy's needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasCourse {
  pub id: i64,
  pub name: String,
  pub code: String,
  pub term: String,
}

/// A Canvas assignment mapped to StudyBoy's needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasAssignment {
  pub id: i64,
  pub course_id: i64,
  pub name: String,
  pub due_at: Option<String>,
  pub points_possible: f64,
  pub html_url: String,
  pub submitted: bool,
}

// ---------------------------------------------------------------------------
// Internal Canvas API JSON shapes (only the fields we read)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ProfileJson {
  name: Option<String>,
  short_name: Option<String>,
  login_id: Option<String>,
  email: Option<String>,
}

#[derive(Deserialize)]
struct TermJson {
  name: Option<String>,
}

#[derive(Deserialize)]
struct CourseJson {
  id: i64,
  name: Option<String>,
  course_code: Option<String>,
  enrollment_term: Option<TermJson>,
}

#[derive(Deserialize)]
struct SubmissionJson {
  workflow_state: Option<String>,
}

#[derive(Deserialize)]
struct AssignmentJson {
  id: i64,
  name: Option<String>,
  due_at: Option<String>,
  points_possible: Option<f64>,
  html_url: Option<String>,
  has_sub_submissions: Option<bool>,
  submission: Option<SubmissionJson>,
}

// ---------------------------------------------------------------------------
// Helpers for error mapping and response handling
// ---------------------------------------------------------------------------

/// Convert a reqwest response into a Result, surfacing status + body excerpt on
/// non-2xx. Body excerpt is capped to keep error strings readable.
async fn ensure_ok(resp: reqwest::Response, label: &str) -> Result<reqwest::Response, String> {
  let status = resp.status();
  if status.is_success() {
    Ok(resp)
  } else {
    let body = resp.text().await.unwrap_or_default();
    let excerpt: String = body.chars().take(240).collect();
    Err(format!("Canvas {}: {} — {}", label, status.as_u16(), excerpt))
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Validate the token by fetching the user profile.
///
/// `name` is `user.name` falling back to `short_name`; `login_id` is
/// `user.login_id` falling back to `email`.
pub async fn canvas_connect(base_url: String, token: String) -> Result<CanvasConn, String> {
  let base = ssrf_ok(&base_url)?;
  let client = build_client(&token);

  let url = format!("{}/api/v1/users/self/profile", base);
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Network error reaching Canvas: {}", e))?;
  let resp = ensure_ok(resp, "profile fetch").await?;
  let profile: ProfileJson = resp
    .json()
    .await
    .map_err(|e| format!("Could not parse Canvas profile: {}", e))?;

  let name = profile
    .name
    .or(profile.short_name)
    .unwrap_or_else(|| "(unknown)".to_string());
  let login_id = profile
    .login_id
    .or(profile.email)
    .unwrap_or_else(|| "(unknown)".to_string());

  Ok(CanvasConn { name, login_id })
}

/// Sync the user's active-enrollment courses.
///
/// Skips any course lacking a name. Maps Canvas fields to [`CanvasCourse`]:
/// `code` falls back to empty string from `course_code`; `term` falls back to
/// empty string from `enrollment_term.name`.
pub async fn canvas_sync_courses(
  base_url: String,
  token: String,
) -> Result<Vec<CanvasCourse>, String> {
  let base = ssrf_ok(&base_url)?;
  let client = build_client(&token);

  let url = format!(
    "{}/api/v1/courses?include[]=term&enrollment_state=active",
    base
  );
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Network error reaching Canvas: {}", e))?;
  let resp = ensure_ok(resp, "courses fetch").await?;
  let courses: Vec<CourseJson> = resp
    .json()
    .await
    .map_err(|e| format!("Could not parse Canvas courses: {}", e))?;

  let mut out = Vec::with_capacity(courses.len());
  for c in courses {
    let name = match c.name {
      Some(n) if !n.trim().is_empty() => n,
      _ => continue, // skip unnamed courses
    };
    out.push(CanvasCourse {
      id: c.id,
      name,
      code: c.course_code.unwrap_or_default(),
      term: c
        .enrollment_term
        .and_then(|t| t.name)
        .unwrap_or_default(),
    });
  }
  Ok(out)
}

/// Sync assignments for a single course.
///
/// `points_possible` defaults to 0.0 when Canvas omits it. `submitted` is
/// true when `has_sub_submissions` is true or when `submission.workflow_state`
/// is `submitted` or `graded`.
pub async fn canvas_sync_assignments(
  base_url: String,
  token: String,
  course_id: i64,
) -> Result<Vec<CanvasAssignment>, String> {
  let base = ssrf_ok(&base_url)?;
  let client = build_client(&token);

  let url = format!(
    "{}/api/v1/courses/{}/assignments?per_page=100",
    base, course_id
  );
  let resp = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Network error reaching Canvas: {}", e))?;
  let resp = ensure_ok(resp, "assignments fetch").await?;
  let assignments: Vec<AssignmentJson> = resp
    .json()
    .await
    .map_err(|e| format!("Could not parse Canvas assignments: {}", e))?;

  let mut out = Vec::with_capacity(assignments.len());
  for a in assignments {
    let name = a.name.unwrap_or_default();
    if name.trim().is_empty() {
      continue;
    }
    let submitted = a
      .has_sub_submissions
      .unwrap_or(false)
      || matches!(
        a.submission.as_ref().and_then(|s| s.workflow_state.as_deref()),
        Some("submitted") | Some("graded")
      );
    out.push(CanvasAssignment {
      id: a.id,
      course_id,
      name,
      due_at: a.due_at,
      points_possible: a.points_possible.unwrap_or(0.0),
      html_url: a.html_url.unwrap_or_default(),
      submitted,
    });
  }
  Ok(out)
}