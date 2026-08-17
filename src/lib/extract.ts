// StudyBoy — source text extraction (Turbo-style multi-input).
// Pulls plain text from uploaded PDF / DOCX / TXT / MD files, in-browser,
// using pdfjs-dist (PDF) and mammoth (DOCX). No upload leaves the device.
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves the worker as a URL asset.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ExtractResult {
  text: string;
  pages?: number;
  kind: "pdf" | "docx" | "text" | "unknown";
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function supportedExt(name: string): boolean {
  return ["pdf", "docx", "txt", "md", "text", "csv", "json", "rtf"].includes(ext(name));
}

async function extractPdf(file: File): Promise<ExtractResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // pdfjs emits one str per text run; join with spaces and start a new line
    // when the run is marked end-of-line, so adjacent words don't glue together.
    const segs = content.items.map((it) => {
      if (!("str" in it)) return "";
      const s = (it as { str: string; hasEOL?: boolean });
      return s.hasEOL ? s.str + "\n" : s.str;
    });
    parts.push(segs.join(" ").replace(/[ ]+\n/g, "\n"));
  }
  return { text: parts.join("\n\n"), pages: doc.numPages, kind: "pdf" };
}

async function extractDocx(file: File): Promise<ExtractResult> {
  // mammoth browser build; types are for the node build, so cast.
  const mod = (await import("mammoth/mammoth.browser")) as {
    extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const arrayBuffer = await file.arrayBuffer();
  const r = await mod.extractRawText({ arrayBuffer });
  return { text: r.value, kind: "docx" };
}

export async function extractFile(file: File): Promise<ExtractResult> {
  const e = ext(file.name);
  if (e === "pdf") return extractPdf(file);
  if (e === "docx") return extractDocx(file);
  if (["txt", "md", "text", "csv", "json", "rtf"].includes(e) || file.type.startsWith("text/")) {
    return { text: await file.text(), kind: "text" };
  }
  // last resort: try as text
  try {
    return { text: await file.text(), kind: "unknown" };
  } catch {
    return { text: "", kind: "unknown" };
  }
}