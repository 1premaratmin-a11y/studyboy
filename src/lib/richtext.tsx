// StudyBoy — rich note renderer.
// Parses a note string into block elements: fenced code, markdown tables,
// display math ($$..$$), and bullet/paragraph lines with inline formatting
// (inline math $..$, inline code, **bold**, *italic*, [links](url)).
//
// Designed for Turbo-style rich notes inside the pixel/Solarized shell.
import { Fragment, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

// ── KaTeX ──────────────────────────────────────────────────────────────
function tex(tex: string, display: boolean): ReactNode {
 const html = katex.renderToString(tex, {
 displayMode: display,
 throwOnError: false,
 output: "html",
 strict: false,
 });
 return (
 <span
 className="rt-tex"
 role="math"
 aria-label={tex}
 dangerouslySetInnerHTML={{ __html: html }}
 />
 );
}

/** Allow only safe URL schemes in markdown links (block javascript:/data: XSS). */
function safeHref(href: string): string | null {
 const s = href.trim();
 if (!s) return null;
 if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(s)) return s;
 return null;
}

// ── Inline tokenizer ───────────────────────────────────────────────────
// Order matters: code spans first (so their contents are not re-parsed),
// then math, then bold, then italic, then links.
type InlineTok =
 | { kind: "text"; s: string }
 | { kind: "code"; s: string }
 | { kind: "imath"; s: string }
 | { kind: "bold"; inner: InlineTok[] }
 | { kind: "ital"; inner: InlineTok[] }
 | { kind: "hl"; inner: InlineTok[] }
 | { kind: "link"; text: string; href: string };

const INLINE = new RegExp(
 [
 "(?<code>`[^`\\n]+`)",
 "(?<imath>\\$[^$\\n]+\\$)",
 "(?<bold>\\*\\*[^*\\n]+\\*\\*)",
 "(?<ital>\\*[^*\\n]+\\*|_[^_\\n]+_)",
 "(?<hl>==[^=\\n]+==)",
 "(?<link>\\[[^\\]]+\\]\\([^)\\s]+\\))",
 ].join("|"),
 "g",
);

function tokenizeInline(src: string): InlineTok[] {
 const out: InlineTok[] = [];
 let last = 0;
 let m: RegExpExecArray | null;
 INLINE.lastIndex = 0;
 while ((m = INLINE.exec(src))) {
 if (m.index > last) out.push({ kind: "text", s: src.slice(last, m.index) });
 const g = m.groups!;
 if (g.code) out.push({ kind: "code", s: g.code.slice(1, -1) });
 else if (g.imath) out.push({ kind: "imath", s: g.imath.slice(1, -1) });
 else if (g.bold) out.push({ kind: "bold", inner: tokenizeInline(g.bold.slice(2, -2)) });
 else if (g.ital) out.push({ kind: "ital", inner: tokenizeInline(g.ital.replace(/^[*_]|[*_]$/g, "")) });
 else if (g.hl) out.push({ kind: "hl", inner: tokenizeInline(g.hl.slice(2, -2)) });
 else if (g.link) {
 const lm = g.link.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
 out.push({ kind: "link", text: lm[1], href: lm[2] });
 }
 last = m.index + m[0].length;
 if (m[0] === "") INLINE.lastIndex++; // guard zero-width
 }
 if (last < src.length) out.push({ kind: "text", s: src.slice(last) });
 return out;
}

function renderInline(toks: InlineTok[]): ReactNode[] {
 return toks.map((t, i) => {
 switch (t.kind) {
 case "text":
 return <Fragment key={i}>{t.s}</Fragment>;
 case "code":
 return (
 <code key={i} className="rt-icode">
 {t.s}
 </code>
 );
 case "imath":
 return <Fragment key={i}>{tex(t.s, false)}</Fragment>;
 case "bold":
 return (
 <b key={i} className="rt-bold">
 {renderInline(t.inner)}
 </b>
 );
 case "ital":
 return (
 <i key={i} className="rt-ital">
 {renderInline(t.inner)}
 </i>
 );
 case "hl":
 return (
 <mark key={i} className="rt-hl">
 {renderInline(t.inner)}
 </mark>
 );
 case "link": {
 const href = safeHref(t.href);
 if (!href) return <Fragment key={i}>{t.text}</Fragment>;
 return (
 <a key={i} className="rt-link" href={href} target="_blank" rel="noreferrer noopener">
 {t.text}
 </a>
 );
 }
 }
 });
}

// ── Block parser ───────────────────────────────────────────────────────
type Block =
 | { kind: "code"; lang: string; lines: string[] }
 | { kind: "math"; tex: string }
 | { kind: "table"; header: string[]; rows: string[][] }
 | { kind: "list"; items: string[] }
 | { kind: "heading"; level: number; text: string }
 | { kind: "para"; text: string };

function splitRow(line: string): string[] {
 return line
 .replace(/^\s*\|/, "")
 .replace(/\|\s*$/, "")
 .split("|")
 .map((c) => c.trim());
}

function isSepRow(line: string): boolean {
 if (!line.includes("|")) return false;
 return splitRow(line).every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function parseBlocks(text: string): Block[] {
 const lines = text.replace(/\r/g, "").split("\n");
 const blocks: Block[] = [];
 let i = 0;
 while (i < lines.length) {
 const line = lines[i];
 // blank line
 if (line.trim() === "") {
 i++;
 continue;
 }
 // heading: # / ## / ###
 const hd = line.match(/^(#{1,3})\s+(.*)$/);
 if (hd) {
 blocks.push({ kind: "heading", level: hd[1].length, text: hd[2].trim() });
 i++;
 continue;
 }
 // fenced code
 const fence = line.match(/^```(\w*)\s*$/);
 if (fence) {
 const lang = fence[1] || "";
 const buf: string[] = [];
 i++;
 while (i < lines.length && !/^```\s*$/.test(lines[i])) {
 buf.push(lines[i]);
 i++;
 }
 i++; // skip closing fence
 blocks.push({ kind: "code", lang, lines: buf });
 continue;
 }
 // display math $$...$$ (single-line or multi-line)
 if (line.trim().startsWith("$$")) {
 const one = line.trim().match(/^\$\$(.+)\$\$$/);
 if (one) {
 blocks.push({ kind: "math", tex: one[1].trim() });
 i++;
 continue;
 }
 const buf: string[] = [line.replace(/^\s*\$\$/, "")];
 i++;
 while (i < lines.length && !lines[i].includes("$$")) {
 buf.push(lines[i]);
 i++;
 }
 if (i < lines.length) {
 buf.push(lines[i].replace(/\$\$\s*$/, ""));
 i++;
 }
 blocks.push({ kind: "math", tex: buf.join("\n").trim() });
 continue;
 }
 // table: current line is a | row AND next line is a separator row
 if (line.includes("|") && i + 1 < lines.length && isSepRow(lines[i + 1])) {
 const header = splitRow(line);
 i += 2;
 const rows: string[][] = [];
 while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
 rows.push(splitRow(lines[i]));
 i++;
 }
 blocks.push({ kind: "table", header, rows });
 continue;
 }
 // list: lines starting with - / * / • / number.
 if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
 const items: string[] = [];
 while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) {
 items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
 i++;
 }
 blocks.push({ kind: "list", items });
 continue;
 }
 // paragraph: gather until blank or block starter
 const buf: string[] = [line];
 i++;
 while (
 i < lines.length &&
 lines[i].trim() !== "" &&
 !/^```/.test(lines[i]) &&
 !/^#{1,3}\s+/.test(lines[i]) &&
 !lines[i].trim().startsWith("$$") &&
 !/^\s*([-*•]|\d+\.)\s+/.test(lines[i]) &&
 !(lines[i].includes("|") && i + 1 < lines.length && isSepRow(lines[i + 1]))
 ) {
 buf.push(lines[i]);
 i++;
 }
 blocks.push({ kind: "para", text: buf.join(" ") });
 }
 return blocks;
}

// ── Component ─────────────────────────────────────────────────────────
/** Render rich text. `bullet` renders list/para lines as bullets (note style);
 * `bullet=false` renders them as paragraphs (summary/guide style). */
export function RichText({ text, bullet = false }: { text: string; bullet?: boolean }) {
 const blocks = parseBlocks(text);
 return (
 <div className="rt-root">
 {blocks.map((b, i) => {
 switch (b.kind) {
 case "code":
 return (
 <pre key={i} className="rt-code" data-lang={b.lang || "code"}>
 <code>{b.lines.join("\n")}</code>
 </pre>
 );
 case "math":
 return (
 <div key={i} className="rt-dmath">
 {tex(b.tex, true)}
 </div>
 );
 case "table":
 return (
 <div key={i} className="rt-table-wrap">
 <table className="rt-table">
 <thead>
 <tr>
 {b.header.map((h, j) => (
 <th key={j}>{renderInline(tokenizeInline(h))}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {b.rows.map((r, ri) => (
 <tr key={ri}>
 {r.map((c, ci) => (
 <td key={ci}>{renderInline(tokenizeInline(c))}</td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );
 case "list":
 return (
 <ul key={i} className="rt-list">
 {b.items.map((it, j) => (
 <li key={j}>{renderInline(tokenizeInline(it))}</li>
 ))}
 </ul>
 );
 case "heading": {
 const cls = b.level === 1 ? "rt-h1" : b.level === 2 ? "rt-h2" : "rt-h3";
 const Tag = (b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
 return (
 <Tag key={i} className={cls}>
 {renderInline(tokenizeInline(b.text))}
 </Tag>
 );
 }
 case "para":
 default:
 return bullet ? (
 <div key={i} className="rt-bullet">
 <span className="rt-mark">▸</span>
 <span>{renderInline(tokenizeInline(b.text))}</span>
 </div>
 ) : (
 <p key={i} className="rt-para">
 {renderInline(tokenizeInline(b.text))}
 </p>
 );
 }
 })}
 </div>
 );
}

/** Render a single line with inline formatting only (no block parsing). */
export function RichLine({ text }: { text: string }) {
 return <>{renderInline(tokenizeInline(text))}</>;
}