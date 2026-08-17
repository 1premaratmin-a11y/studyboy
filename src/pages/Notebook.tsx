// StudyBoy — Notebook: freeform rich note pages.
// Markdown-ish editor with a formatting toolbar + live rich-text preview,
// persisted to IndexedDB (db.notebookPages). Supports headings, bold/italic,
// highlight (==), inline + display math, fenced code, tables, lists, links.
// Pasting rich content (OneNote/Word/web) is converted to markdown via html2md.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type NotebookPage } from "../db";
import { Panel, PixelButton } from "../components/ui";
import { RichText } from "../lib/richtext";
import { htmlToMarkdown } from "../lib/html2md";

const SAMPLE = `# Welcome to your Notebook

Type freely — like **OneNote**, but cleaner. Use the toolbar above to format.

## Formatting you can use
- **bold** and *italic* and ==highlighted== key terms
- Inline math $E = mc^2$ and display math:

$$\\int_0^1 x\\,dx = \\tfrac{1}{2}$$

- Fenced code:

\`\`\`js
const sum = (a, b) => a + b;
\`\`\`

- Tables:

| Term | Meaning |
|---|---|
| FCFS | First-come, first-served |
| SJF | Shortest job first |

- Links: [Solarized](https://ethanschoonover.com/solarized/)

> Click + New Page to start your own.
`;

export function Notebook() {
 const pages =
 useLiveQuery(() => db.notebookPages.toArray().then((p) => p.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []) ?? [];
 const [selId, setSelId] = useState<string | null>(null);
 const sel = pages.find((p) => p.id === selId) ?? pages[0] ?? null;
 const [title, setTitle] = useState("");
 const [body, setBody] = useState("");
 const [toast, setToast] = useState<string | null>(null);
 const taRef = useRef<HTMLTextAreaElement>(null);
 const saveTimer = useRef<number | null>(null);
 const dirtyRef = useRef(false);
 const selIdKeyRef = useRef<string | undefined>(sel?.id);
 selIdKeyRef.current = sel?.id;

 useEffect(() => {
 if (sel) {
 setTitle(sel.title);
 setBody(sel.body);
 dirtyRef.current = false;
 } else {
 setTitle("");
 setBody("");
 }
 }, [sel?.id]);

 const selIdKey = sel?.id;
 useEffect(() => {
 if (!sel) return;
 if (title === sel.title && body === sel.body) return;
 dirtyRef.current = true;
 if (saveTimer.current) window.clearTimeout(saveTimer.current);
 saveTimer.current = window.setTimeout(async () => {
 await db.notebookPages.put({ ...sel, title, body, updatedAt: new Date().toISOString() });
 dirtyRef.current = false;
 saveTimer.current = null;
 setToast("saved");
 }, 600);
 return () => {
 if (selIdKey !== selIdKeyRef.current && dirtyRef.current) {
 db.notebookPages
 .put({ ...sel, title, body, updatedAt: new Date().toISOString() })
 .catch(() => {});
 }
 if (saveTimer.current) window.clearTimeout(saveTimer.current);
 saveTimer.current = null;
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [title, body, selIdKey]);

 useEffect(() => {
 if (toast) window.setTimeout(() => setToast(null), 1200);
 }, [toast]);

 async function newPage() {
 const p: NotebookPage = { id: crypto.randomUUID(), title: "Untitled page", body: "", updatedAt: new Date().toISOString() };
 await db.notebookPages.put(p);
 setSelId(p.id);
 }

 async function delPage() {
 if (!sel || !window.confirm(`Delete "${sel.title}"? Cannot undo.`)) return;
 await db.notebookPages.delete(sel.id);
 setSelId(null);
 }

 function surround(prefix: string, suffix = prefix, placeholder = "text") {
 const ta = taRef.current;
 if (!ta) return;
 const s = ta.selectionStart;
 const e = ta.selectionEnd;
 const selTxt = body.slice(s, e) || placeholder;
 const next = body.slice(0, s) + prefix + selTxt + suffix + body.slice(e);
 setBody(next);
 requestAnimationFrame(() => {
 ta.focus();
 const c = s + prefix.length;
 ta.setSelectionRange(c, c + selTxt.length);
 });
 }

 function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
 const html = e.clipboardData.getData("text/html");
 if (!html) return;
 e.preventDefault();
 const md = htmlToMarkdown(html);
 const ta = taRef.current;
 if (!ta) { setBody((b) => b + md); return; }
 const s = ta.selectionStart;
 const en = ta.selectionEnd;
 const before = body.slice(0, s);
 const pad = before.length && !before.endsWith("\n") ? "\n\n" : "";
 const next = before + pad + md + body.slice(en);
 setBody(next);
 requestAnimationFrame(() => {
 ta.focus();
 const c = s + pad.length + md.length;
 ta.setSelectionRange(c, c);
 });
 }

 function insertBlock(block: string) {
 const ta = taRef.current;
 if (!ta) { setBody((b) => b + block); return; }
 const s = ta.selectionStart;
 const before = body.slice(0, s);
 const pad = before.length && !before.endsWith("\n") ? "\n\n" : before.endsWith("\n") && !before.endsWith("\n\n") ? "\n" : "";
 const next = before + pad + block + body.slice(s);
 setBody(next);
 requestAnimationFrame(() => {
 ta.focus();
 const c = s + pad.length + block.length;
 ta.setSelectionRange(c, c);
 });
 }

 const stats = useMemo(() => {
 const words = body.trim() ? body.trim().split(/\s+/).length : 0;
 return { words, chars: body.length };
 }, [body]);

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel title="Pages" sub={`${pages.length} total`} span={3} ariaLabel="Notebook pages">
 <PixelButton variant="blue" armed onClick={newPage} className="w-full mb-2">+ New Page</PixelButton>
 <div className="flex flex-col gap-1.5">
 {pages.map((p) => {
 const active = sel?.id === p.id;
 return (
 <button
 key={p.id}
 onClick={() => setSelId(p.id)}
 aria-current={active ? "true" : undefined}
 className={`text-left px-2.5 py-2 rounded border text-sm transition-colors ${active ? "bg-accentLight border-accent text-accentHover" : "bg-surface0 border-border text-secondary hover:bg-surface2"}`}
 >
 <div className="leading-tight truncate">{p.title || "Untitled page"}</div>
 <div className="text-[10px] text-muted mt-0.5">{new Date(p.updatedAt).toLocaleDateString()}</div>
 </button>
 );
 })}
 {pages.length === 0 && (
 <div className="text-xs text-muted italic px-1 py-2">No pages yet.</div>
 )}
 </div>
 </Panel>

 <Panel title="Editor" sub={toast === "saved" ? "Saved" : ""} span={9} ariaLabel="Notebook editor">
 {!sel ? (
 <div className="border border-dashed border-borderStrong bg-surface1 p-3 text-sm text-muted rounded">
 No page selected. Click "+ New Page" to start. Rich formatting with live preview.
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 <input
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="Page title…"
 spellCheck={false}
 aria-label="Page title"
 className="w-full text-lg font-semibold"
 />

 <div className="flex flex-wrap items-center gap-1.5 bg-surface1 border border-border p-2 rounded">
 <ToolBtn label="H1" title="Heading 1" onClick={() => insertBlock("# Heading")} />
 <ToolBtn label="H2" title="Heading 2" onClick={() => insertBlock("## Subheading")} />
 <ToolBtn label="H3" title="Heading 3" onClick={() => insertBlock("### Sub-sub")} />
 <Sep />
 <ToolBtn label="B" title="Bold" onClick={() => surround("**", "**", "bold")} className="font-bold" />
 <ToolBtn label="I" title="Italic" onClick={() => surround("*", "*", "italic")} className="italic" />
 <ToolBtn label="H" title="Highlight ==text==" onClick={() => surround("==", "==", "highlight")} />
 <Sep />
 <ToolBtn label="• List" title="Bullet list" onClick={() => insertBlock("- item")} />
 <ToolBtn label="1. List" title="Numbered list" onClick={() => insertBlock("1. item")} />
 <Sep />
 <ToolBtn label="{} Code" title="Inline code" onClick={() => surround("`", "`", "code")} />
 <ToolBtn label="``` Block" title="Code block" onClick={() => insertBlock("```js\n\n```")} />
 <ToolBtn label="∑ Math" title="Inline math $..$" onClick={() => surround("$", "$", "x")} />
 <ToolBtn label="∑∑ Math" title="Display math $$..$$" onClick={() => insertBlock("$$\nE = mc^2\n$$")} />
 <ToolBtn label="⊞ Table" title="Markdown table" onClick={() => insertBlock("| Term | Meaning |\n|---|---|\n| | |")} />
 <ToolBtn label="🔗 Link" title="Link [text](url)" onClick={() => surround("[", "](https://)", "text")} />
 <div className="ml-auto flex items-center gap-1.5">
 <span className="text-xs text-muted">{stats.words}w · {stats.chars}c</span>
 <PixelButton variant="orange" onClick={delPage} title="Delete this page">Delete</PixelButton>
 </div>
 </div>

 <div className="grid lg:grid-cols-2 gap-3 min-h-[420px]">
 <div className="flex flex-col">
 <div className="text-xs text-muted mb-1 font-medium">Edit</div>
 <textarea
 ref={taRef}
 value={body}
 onChange={(e) => setBody(e.target.value)}
 onPaste={onPaste}
 aria-label="Note body editor"
 placeholder={SAMPLE.replace(/```/g, "")}
 spellCheck={false}
 className="flex-1 w-full font-mono text-[13px] leading-snug resize-none scroll-pretty min-h-[400px]"
 />
 </div>
 <div className="flex flex-col">
 <div className="text-xs text-muted mb-1 font-medium">Preview</div>
 <div role="region" aria-label="Note preview" className="flex-1 bg-surface0 border border-border rounded p-3 overflow-auto scroll-pretty min-h-[400px]">
 {body.trim() ? <RichText text={body} /> : <div className="text-sm text-muted italic">Start typing on the left — your formatted note renders here live.</div>}
 </div>
 </div>
 </div>

 {toast && <div role="status" aria-live="polite" className="text-xs text-success">✓ {toast}</div>}
 </div>
 )}
 </Panel>
 </main>
 );
}

function ToolBtn({ label, onClick, title, className = "" }: { label: string; onClick: () => void; title: string; className?: string }) {
 return (
 <button
 onClick={onClick}
 title={title}
 className={`btn btn-sm btn-ghost font-mono text-xs ${className}`}
 >
 {label}
 </button>
 );
}

function Sep() {
 return <span className="w-px h-5 bg-border mx-0.5" />;
}