// StudyBoy — YouTube transcript import (best-effort).
//
// Turbo accepts YouTube URLs as a source. Direct browser fetch of YouTube's
// timedtext/captions endpoints is blocked by CORS from non-youtube origins, so
// this is best-effort: it parses the video id, attempts a couple of public
// timedtext endpoints, and on failure returns a clear actionable error (paste
// the transcript manually, or run inside the desktop app where the Rust layer
// can proxy). The video itself can always be embedded for reference.

export function videoId(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  // youtu.be/ID, watch?v=ID, embed/ID, shorts/ID
  const m =
    u.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ||
    u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
    u.match(/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/) ||
    u.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

export function embedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

export function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
}

interface PlayerCaptions {
  playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
}

/** Best-effort transcript fetch. Throws with an actionable message on failure. */
export async function fetchTranscript(url: string): Promise<{ text: string; videoId: string; title: string }> {
  const id = videoId(url);
  if (!id) throw new Error("not a YouTube URL");
  // Try the watch page to read ytInitialPlayerResponse caption tracks. CORS
  // will usually block this from a browser origin — catch and explain.
  let tracks: CaptionTrack[] = [];
  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${id}`, { credentials: "omit" });
    if (resp.ok) {
      const html = await resp.text();
      const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
      if (m) {
        const player = JSON.parse(m[1]) as { captions?: PlayerCaptions };
        tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      }
    }
  } catch {
    /* CORS / network — fall through */
  }
  // Fallback: direct timedtext endpoint (often 404 / CORS-blocked without a track baseUrl)
  if (tracks.length === 0) {
    tracks = [{ baseUrl: `https://www.youtube.com/api/timedtext?lang=en&v=${id}`, languageCode: "en" }];
  }
  for (const tr of tracks) {
    try {
      const r = await fetch(tr.baseUrl);
      if (!r.ok) continue;
      const body = await r.text();
      const text = parseTimedtext(body);
      if (text.trim()) return { text, videoId: id, title: `YouTube · ${id}` };
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "transcript fetch blocked (CORS) or no captions. Paste the transcript text manually, or run inside the desktop app.",
  );
}

/** Parse YouTube timedtext XML (or plain text) into a single transcript string. */
function parseTimedtext(body: string): string {
  if (!body.includes("<")) return body;
  try {
    const doc = new DOMParser().parseFromString(body, "text/xml");
    const segs = Array.from(doc.querySelectorAll("text"));
    if (segs.length === 0) return body;
    return segs
      .map((t) => t.textContent ?? "")
      .map((s) => s.replace(/&amp;#39;/g, "'").replace(/&amp;amp;/g, "&"))
      .join(" ")
      .trim();
  } catch {
    return body;
  }
}