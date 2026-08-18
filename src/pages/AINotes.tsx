import { useEffect, useMemo, useRef, useState, type CSSProperties } from"react";
import { useLiveQuery } from"dexie-react-hooks";
import { invoke } from"@tauri-apps/api/core";
import { db, type CourseColor, type Flashcard, type NoteDocument, type NoteMakerSession, type NoteSource } from"../db";
import {
 generateNotes,
 generateNotesChunked,
 generateQuiz,
 generateStudyGuide,
 chatAboutNotes,
 notesToText,
 readAiConfig,
 testKey,
 capSource,
 gradeBlank,
 gradeShort,
 regenerateSection,
 generatePodcastScript,
 type AiConfig,
 type CornellOutput,
 type Depth,
 type NoteFormat,
 type PodcastScript,
 type QuizKind,
 type QuizDifficulty,
 type QuizOutput,
 type StudyGuideOutput,
} from"../aiClient";
import { Panel, PixelButton, Ptag } from"../components/ui";
import { RichText, RichLine } from"../lib/richtext";
import { extractFile, supportedExt } from"../lib/extract";
import { useTranscriber } from"../lib/speech";
import { PodcastPlayer } from"../components/PodcastPlayer";
import { MatchGame, type MatchPair } from"../components/MatchGame";
import { MindMap } from"../components/MindMap";
import { fetchTranscript, videoId, embedUrl } from"../lib/youtube";

const inTauri = typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !=="undefined";

const ACCENTS = ["var(--accent)","var(--info)","var(--success)","var(--accent)","var(--accent)","var(--warning)"];

type Tab ="notes"|"quiz"|"guide"|"podcast"|"match"|"map"|"chat";

const LANGS = ["auto","English","Spanish","French","German","Portuguese","Japanese","Chinese","Hindi","Arabic"];

// ── Rust fallback (no-CORS path inside the desktop app) ─────────────────
function rustParams(cfg: AiConfig): {
 provider: string;
 baseUrl: string | null;
 apiKey: string;
 model: string;
} | null {
 if (!inTauri) return null;
 if (cfg.llmMode ==="local") {
 return { provider:"custom", baseUrl: cfg.localBaseUrl, apiKey:"ollama", model: cfg.localModel };
 }
 if (cfg.provider ==="anthropic") return null; // no Rust Messages-API path; frontend handles it
 if (cfg.provider ==="groq") return { provider:"groq", baseUrl: null, apiKey: cfg.key, model: cfg.model };
 let base = cfg.baseUrl;
 if (cfg.provider ==="openai") base = cfg.baseUrl ||"https://api.openai.com/v1";
 if (cfg.provider ==="openrouter") base = cfg.baseUrl ||"https://openrouter.ai/api/v1";
 if (!base) return null;
 return { provider:"custom", baseUrl: base, apiKey: cfg.key, model: cfg.model };
}

async function rustGenerate(cfg: AiConfig, topic: string, sources: string): Promise<CornellOutput> {
 const p = rustParams(cfg);
 if (!p) throw new Error("no rust path");
 return invoke<CornellOutput>("ai_generate_cornell", {
 provider: p.provider,
 baseUrl: p.baseUrl,
 apiKey: p.apiKey,
 model: p.model,
 topic,
 sources,
 });
}

function engineLabel(cfg: AiConfig): string {
 if (cfg.llmMode ==="local") return `local · ollama · ${cfg.localModel}`;
 if (!cfg.key) return"offline · deterministic stub";
 return `cloud · ${cfg.provider} · ${cfg.model}`;
}

export function AINotes() {
 const sessions =
 useLiveQuery(() => db.noteMakerSessions.toArray().then((s) => s.sort((a, b) => b.createdAt.localeCompare(a.createdAt))), []) ?? [];
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
 const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
 const [search, setSearch] = useState("");
 const [selId, setSelId] = useState<string | null>(null);
 const sel = sessions.find((s) => s.id === selId) ?? sessions[0] ?? null;
 const sources =
 useLiveQuery<NoteSource[]>(
 () => (sel ? db.noteSources.where("sessionId").equals(sel.id).toArray() : Promise.resolve([] as NoteSource[])),
 [sel?.id],
 ) ?? [];
 const doc = useLiveQuery<NoteDocument | undefined>(
 () => (sel ? db.noteDocuments.where("sessionId").equals(sel.id).first() : Promise.resolve(undefined)),
 [sel?.id],
 );
 const docCards = useLiveQuery<Flashcard[]>(
 () => (doc ? db.flashcards.where("noteDocumentId").equals(doc.id).toArray() : Promise.resolve([] as Flashcard[])),
 [doc?.id],
 ) ?? [];
 const mastery = useMemo(() => {
 const now = Date.now();
 let neu = 0,
 learning = 0,
 Learned = 0,
 due = 0;
 for (const c of docCards) {
 if (c.fsrs.state === 0) neu += 1;
 else if (c.fsrs.state === 1) learning += 1;
 else Learned += 1;
 if (new Date(c.fsrs.due).getTime() <= now) due += 1;
 }
 return { total: docCards.length, neu, learning, Learned, due };
 }, [docCards]);

 const filteredSessions = useMemo(() => {
 const q = search.trim().toLowerCase();
 if (!q) return sessions;
 return sessions.filter(
 (s) =>
 s.title.toLowerCase().includes(q) ||
 s.status.toLowerCase().includes(q) ||
 (s.courseId && courseMap.get(s.courseId)?.name.toLowerCase().includes(q)),
 );
 }, [sessions, search, courseMap]);

 // group sessions into folders by course (or"unsorted"), newest first within each
 const folders = useMemo(() => {
 const groups = new Map<string, typeof filteredSessions>();
 for (const s of filteredSessions) {
 const key = s.courseId ??"unsorted";
 const arr = groups.get(key) ?? ([] as typeof filteredSessions);
 arr.push(s);
 groups.set(key, arr);
 }
 // order: known courses by code, then unsorted
 const known: { key: string; label: string; color: CourseColor | undefined; sessions: typeof filteredSessions }[] = [];
 for (const c of courses.filter((c) => groups.has(c.id)).sort((a, b) => a.code.localeCompare(b.code))) {
 known.push({ key: c.id, label: `${c.code} · ${c.name}`, color: c.color, sessions: groups.get(c.id)! });
 }
 if (groups.has("unsorted")) known.push({ key:"unsorted", label:"UNSORTED", color: undefined, sessions: groups.get("unsorted")! });
 return known;
 }, [filteredSessions, courses]);

 const [tab, setTab] = useState<Tab>("chat");
 const [format, setFormat] = useState<NoteFormat>("cornell");
 const [depth, setDepth] = useState<Depth>("standard");
 const [cloze, setCloze] = useState(false);
 const [language, setLanguage] = useState("auto");
 const [prompt, setPrompt] = useState("");
 const [sourcePaste, setSourcePaste] = useState("");
 const [genError, setGenError] = useState<string | null>(null);
 const [generating, setGenerating] = useState(false);
 const [toast, setToast] = useState<string | null>(null);
 const [pushedCount, setPushedCount] = useState<number | null>(null);
 const [extracting, setExtracting] = useState(false);
 const [dragOver, setDragOver] = useState(false);
 const [ytUrl, setYtUrl] = useState("");
 const [ytBusy, setYtBusy] = useState(false);
 const [ytEmbed, setYtEmbed] = useState<string | null>(null);
 const [regenIndex, setRegenIndex] = useState<number | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);
 // Synchronous lock for generate(): `generating` state is async (visible next
 // render), so a rapid double-click before re-render would fire two parallel
 // LLM requests. The ref is set synchronously on entry and cleared in finally.
 const genLock = useRef(false);
 const regenLock = useRef(false);
 const mic = useTranscriber("en-US");

 async function toggleRecord() {
 if (mic.listening) {
 // wait for onend so the final in-flight phrase is flushed before commit()
 await mic.stop();
 const t = mic.commit();
 if (t) {
 setSourcePaste((p) => (p.trim() ? `${p}\n\n[live transcript]\n${t}` : `[live transcript]\n${t}`));
 if (sel) {
 await db.noteSources.put({
 id: crypto.randomUUID(),
 sessionId: sel.id,
 kind:"audio",
 title: `live lecture · ${new Date().toLocaleTimeString()}`,
 status:"ready",
 });
 }
 setToast("transcript captured");
 }
 window.setTimeout(() => setToast(null), 1800);
 } else {
 mic.start();
 }
 }

 const cfg = useMemo(() => readAiConfig(), []);
 const cloudArmed = (cfg.llmMode ==="cloud"&& !!cfg.key) || cfg.llmMode ==="local";

 async function newSession() {
 const s: NoteMakerSession = {
 id: crypto.randomUUID(),
 title:"New study chat",
 status:"draft",
 llmMode: cfg.llmMode,
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 };
 await db.noteMakerSessions.put(s);
 setSelId(s.id);
 setTab("chat");
 setPrompt("");
 setSourcePaste("");
 setYtUrl("");
 setYtEmbed(null);
 setGenError(null);
 setPushedCount(null);
 }

 async function rename(title: string) {
 if (!sel) return;
 await db.noteMakerSessions.update(sel.id, { title, updatedAt: new Date().toISOString() });
 }

 function buildSourcesText(srcs: NoteSource[]): string {
 const captured = srcs
 .map((s) => {
 const meta = s.pageCount ? `${s.pageCount}p` : s.durationSec ? `${Math.round(s.durationSec / 60)}m` :"";
 return meta ? `${s.kind}: ${s.title} (${meta})` : `${s.kind}: ${s.title}`;
 })
 .join("\n");
 const paste = sourcePaste.trim();
 if (captured && paste) return `${captured}\n\n[pasted source]\n${paste}`;
 if (paste) return `[pasted source]\n${paste}`;
 return captured;
 }

 function cappedSources(srcs: NoteSource[]): { text: string; truncated: boolean } {
 return capSource(buildSourcesText(srcs));
 }

 async function offlineFallback(session: NoteMakerSession, srcs: NoteSource[]): Promise<NoteDocument> {
 // reuse an existing doc id for this session so re-generating replaces
 // rather than accumulating stale duplicate NoteDocuments.
 const prev = await db.noteDocuments.where("sessionId").equals(session.id).first();
 return {
 id: prev?.id ?? crypto.randomUUID(),
 sessionId: session.id,
 format,
 title: session.title,
 summary:
"◇ OFFLINE STUB ◇ No key set — drop a cloud API key in Settings (or run a local Ollama model) to forge real LLM notes. This scaffold just shows the structured-output shape: cues, notes, Q-cards, summary.",
 sections: [
 {
 id:"s1",
 topic:"Key concepts",
 cues: ["What is the main idea?","Why does it matter?"],
 notes: ["Main idea stated up front.","Connects to the broader unit objective."],
 qcards: [{ q:"What is the main idea?", a:"Stated up front in the intro."}],
 },
 ],
 sourceCitations: srcs.map((s) => ({ sourceTitle: s.title })),
 updatedAt: new Date().toISOString(),
 };
 }

 async function persistDoc(session: NoteMakerSession, out: CornellOutput, srcs: NoteSource[]) {
 // reuse the existing doc id for this session so re-generating replaces the
 // prior doc instead of inserting a new one (which .first() could resolve
 // over arbitrarily, leaving stale notes on screen).
 const prev = await db.noteDocuments.where("sessionId").equals(session.id).first();
 const nd: NoteDocument = {
 id: prev?.id ?? crypto.randomUUID(),
 sessionId: session.id,
 format,
 title: prompt.trim() || session.title,
 summary: out.summary,
 sections: out.sections.map((sec, i) => ({
 id: `s${i + 1}`,
 topic: sec.topic,
 cues: sec.cues ?? [],
 notes: sec.notes ?? [],
 qcards: sec.qcards ?? [],
 })),
 sourceCitations: srcs.map((s) => ({ sourceTitle: s.title })),
 updatedAt: new Date().toISOString(),
 };
 await db.noteDocuments.put(nd);
 await db.noteMakerSessions.update(session.id, { status:"ready", updatedAt: new Date().toISOString() });
 return nd;
 }

 async function generate() {
 if (!sel || genLock.current) return;
 genLock.current = true;
 setGenError(null);
 setPushedCount(null);
 const request = prompt.trim() || (sel.title.trim() ==="New study chat"?"": sel.title.trim());
 if (!request) {
 setGenError("Tell me what you want to learn, explain, or practice first.");
 genLock.current = false;
 return;
 }
 if (prompt.trim() && prompt.trim() !== sel.title.trim()) {
 await db.noteMakerSessions.update(sel.id, {
 title: prompt.trim().replace(/\s+/g,"").slice(0, 72),
 updatedAt: new Date().toISOString(),
 });
 }
 const c = readAiConfig();
 const useReal = c.llmMode ==="local"|| (c.llmMode ==="cloud"&& !!c.key);

 setGenerating(true);
 await db.noteMakerSessions.update(sel.id, { status:"generating", updatedAt: new Date().toISOString() });
 const { text: srcText, truncated } = cappedSources(sources);
 try {
 if (!useReal) {
 await db.noteDocuments.put(await offlineFallback(sel, sources));
 await db.noteMakerSessions.update(sel.id, { status:"ready", updatedAt: new Date().toISOString() });
 setToast("offline stub — no key set");
 return;
 }
 let out: CornellOutput;
 try {
 out = truncated
 ? await generateNotesChunked(c, { topic: request, sources: srcText, format, depth, cloze, language })
 : await generateNotes(c, { topic: request, sources: srcText, format, depth, cloze, language });
 } catch (e) {
 // Browser CORS / transient failure inside the desktop app → retry via Rust (no CORS).
 if (inTauri && rustParams(c)) {
 out = await rustGenerate(c, request, srcText);
 } else {
 throw e;
 }
 }
 await persistDoc(sel, out, sources);
 setToast(truncated ?"notes forged · source truncated":"notes forged");
 } catch (e) {
 const msg = typeof e ==="string"? e : e instanceof Error ? e.message :"unknown error";
 setGenError(`${engineLabel(c)} failed: ${msg}`);
 // Only write the offline stub when no prior doc exists — otherwise a
 // transient LLM failure would overwrite the user's good generated notes.
 const prev = await db.noteDocuments.where("sessionId").equals(sel.id).first();
 if (!prev) await db.noteDocuments.put(await offlineFallback(sel, sources));
 await db.noteMakerSessions.update(sel.id, { status:"ready", updatedAt: new Date().toISOString() });
 } finally {
 genLock.current = false;
 setGenerating(false);
 window.setTimeout(() => setToast(null), 1800);
 }
 }

 async function pushQcards() {
 if (!doc) return;
 let n = 0;
 const now = Date.now();
 // Replace this doc's cards so re-pushes (regenerate → push) don't
 // accumulate duplicates against the same noteDocumentId.
 await db.transaction("rw", db.flashcards, async () => {
 await db.flashcards.where("noteDocumentId").equals(doc.id).delete();
 for (const sec of doc.sections) {
 for (const q of sec.qcards) {
 // skip malformed qcards (e.g. AI returned empty/trivial answer) —
 // otherwise the deck fills with cards whose back is blank or"a".
 if (!q.q.trim() || !q.a.trim()) continue;
 const isCloze = q.q.includes("{{c1::");
 const f: Flashcard = {
 id: crypto.randomUUID(),
 noteDocumentId: doc.id,
 kind: isCloze ?"cloze":"qa",
 front: q.q.trim(),
 back: q.a.trim(),
 sourceRef: doc.title.slice(0, 24),
 fsrs: { difficulty: 4.5, stability: 1, retrievability: 0.7, state: 0, due: new Date(now).toISOString() },
 };
 await db.flashcards.put(f);
 n += 1;
 }
 }
 });
 setPushedCount(n);
 setToast(n ? `${n} cards → deck` :"no Q-cards to push");
 window.setTimeout(() => setToast(null), 1800);
 }

 function copyMarkdown() {
 if (!doc) return;
 const md = docToMarkdown(doc);
 navigator.clipboard?.writeText(md);
 setToast("copied markdown");
 window.setTimeout(() => setToast(null), 1500);
 }

 function exportMarkdown() {
 if (!doc) return;
 const md = docToMarkdown(doc);
 const blob = new Blob([md], { type:"text/markdown"});
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `${doc.title.replace(/[^a-z0-9]+/gi,"_").slice(0, 40) ||"notes"}.md`;
 a.click();
 URL.revokeObjectURL(url);
 }

 async function handleFiles(files: FileList | null) {
 if (!files || files.length === 0) return;
 setExtracting(true);
 try {
 const buf: string[] = [];
 for (const f of Array.from(files)) {
 if (!supportedExt(f.name)) {
 setToast(`skipped ${f.name} (unsupported)`);
 continue;
 }
 const r = await extractFile(f);
 if (r.text.trim()) {
 const head = `[${f.name}${r.pages ? ` · ${r.pages}p` :""}]`;
 buf.push(`${head}\n${r.text}`);
 } else {
 setToast(`no text in ${f.name}`);
 }
 }
 if (buf.length) {
 setSourcePaste((p) => (p.trim() ? `${p}\n\n${buf.join("\n\n")}` : buf.join("\n\n")));
 setToast(`imported ${buf.length} file(s)`);
 }
 } catch (e) {
 setGenError(`extract failed: ${e instanceof Error ? e.message : String(e)}`);
 } finally {
 setExtracting(false);
 window.setTimeout(() => setToast(null), 1800);
 }
 }

 async function loadYoutube() {
 const url = ytUrl.trim();
 if (!url || ytBusy) return;
 const id = videoId(url);
 if (id) setYtEmbed(embedUrl(id));
 setYtBusy(true);
 try {
 const r = await fetchTranscript(url);
 const head = `[YouTube · ${r.videoId}]`;
 setSourcePaste((p) => (p.trim() ? `${p}\n\n${head}\n${r.text}` : `${head}\n${r.text}`));
 setToast("YouTube transcript loaded");
 } catch (e) {
 setGenError(`YouTube: ${e instanceof Error ? e.message : String(e)}`);
 if (id) setToast("player embedded · paste transcript manually");
 } finally {
 setYtBusy(false);
 window.setTimeout(() => setToast(null), 2000);
 }
 }

 async function regenSection(idx: number) {
 if (!doc || regenLock.current) return;
 regenLock.current = true;
 setRegenIndex(idx);
 try {
 const sec = doc.sections[idx];
 const existing = notesToText(toCornell(doc));
 const { text: srcText } = cappedSources(sources);
 const next = await regenerateSection(cfg, {
 topic: doc.title,
 sectionTopic: sec.topic,
 existingNotes: existing,
 sources: srcText,
 format,
 depth,
 cloze,
 language,
 });
 const sections = doc.sections.map((s, i) =>
 i === idx
 ? { ...s, topic: next.topic || s.topic, cues: next.cues ?? [], notes: next.notes ?? [], qcards: next.qcards ?? [] }
 : s,
 );
 await db.noteDocuments.update(doc.id, { sections, updatedAt: new Date().toISOString() });
 setToast(`Section ${idx + 1} regenerated`);
 } catch (e) {
 setGenError(`regen failed: ${e instanceof Error ? e.message : String(e)}`);
 } finally {
 regenLock.current = false;
 setRegenIndex(null);
 window.setTimeout(() => setToast(null), 1800);
 }
 }

 return (
 <main className="study-chat-workspace min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 {/* Conversation history */}
 <Panel title="Recent conversations"sub={`${sessions.length} local threads`} span={4} ariaLabel="Study chat history">
 <PixelButton variant="blue"armed onClick={newSession} className="w-full mb-2">
 New conversation
 </PixelButton>
 <input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search conversations"
 spellCheck={false}
 aria-label="Search sessions"
 className="w-full mb-2 bg-surface0 border-2 border-borderStrong3 px-2 py-1 font-mono text-[12px] outline-none focus:ring-2 focus:ring-accent"
 />
 <div className="flex flex-col gap-2">
 {folders.map((f) => (
 <div key={f.key} className="flex flex-col gap-1">
 <div className="text-[10px] font-semibold uppercase text-muted1 flex items-center gap-1.5 px-0.5">
 <span className={`folder-dot ${f.color ??"ink"}`} />
 {f.label}
 <span className="text-muted1/60">{f.sessions.length}</span>
 </div>
 <div className="flex flex-col gap-1.5">
 {f.sessions.map((s) => {
 const active = sel?.id === s.id;
 return (
 <button
 key={s.id}
 onClick={() => {
 setSelId(s.id);
 setPrompt("");
 setSourcePaste("");
 setYtUrl("");
 setYtEmbed(null);
 setGenError(null);
 setTab("chat");
 }}
 aria-current={active ?"true": undefined}
 className={`text-left px-2.5 py-1.5 border-2 rounded-sm transition-all ${
 active
 ?"border-accent bg-surface23 text-accent shadow-[inset_2px_2px_0_#073642] glow-engine"
 :"border-borderStrong3 bg-surface1 text-muted3 hover:border-borderStrong1 hover:-translate-y-[1px]"
 }`}
 >
 <div className="text-[15px] leading-tight">{s.title}</div>
 <div className="font-mono text-[10px] text-muted1">
 {s.status} · {new Date(s.createdAt).toLocaleDateString()}
 </div>
 </button>
 );
 })}
 </div>
 </div>
 ))}
 {folders.length === 0 && <div className="text-[14px] text-muted1 italic">{sessions.length === 0 ?"no sessions yet":"no matches"}</div>}
 </div>

 <div className="mt-3 border-t-2 border-borderStrong3/40 pt-2">
 <PixelButton variant="default"onClick={async () => { const r = await testKey(readAiConfig()); setToast(r.msg); window.setTimeout(() => setToast(null), 1800); }} className="w-full">
 Test
 </PixelButton>
 </div>
 </Panel>

 {/* Detail */}
 <Panel
 title={sel ? sel.title :"Ask Studyboy"}
 sub={sel ? `${sel.status} · ${sel.llmMode} · grounded in your material` :"Your private, always-available study partner"}
 span={8}
 ariaLabel="StudyBoy chat workspace"
 >
 {!sel ? (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[16px] text-muted1">
 No conversation selected. Start a new study chat.
 </div>
 ) : (
 <div className="flex flex-col gap-3">
 {/* Title + sources */}
 <div className="flex flex-col gap-2">
 <input
 value={sel.title}
 onChange={(e) => rename(e.target.value)}
 spellCheck={false}
 aria-label="Session title"
 className="w-full bg-surface0 border-[3px] border-borderStrong3 shadow-sm px-3 py-1.5 text-lg outline-none focus:ring-2 focus:ring-accent"
 />
 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">SOURCES · {sources.length}</div>
 <div className="flex flex-wrap gap-1.5">
 {sources.map((s) => (
 <Ptag key={s.id} tone={s.status ==="ready"?"cyan":"ink"}>
 {s.kind} · {s.title}
 {s.pageCount ? ` (${s.pageCount}p)` : s.durationSec ? ` (${Math.round(s.durationSec / 60)}m)` :""}
 </Ptag>
 ))}
 {sources.length === 0 && <span className="text-[13px] text-muted1 italic">no optional context added</span>}
 </div>
 </div>
 </div>

 <details
 key={sel.id}
 className="rounded-lg border border-borderStrong bg-surface1 p-3"
 >
 <summary className="cursor-pointer select-none text-[16px] font-semibold text-muted3">
 Add optional context <span className="text-[13px] font-normal text-muted1">(notes, files, transcript)</span>
 </summary>
 <div className="mt-3"/>
 <div
 className={`flex flex-col gap-2 relative border-[3px] border-dashed transition-colors ${dragOver ?"border-accent bg-accent/10":"border-borderStrong3/40"}`}
 onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
 onDragLeave={() => setDragOver(false)}
 onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
 >
 <div className="flex items-center justify-between gap-2">
 <label htmlFor="source-paste"className="text-xs font-semibold text-muted3">OPTIONAL CONTEXT</label>
 <div className="flex items-center gap-1.5">
 <input
 ref={fileRef}
 type="file"
 multiple
 accept=".pdf,.docx,.txt,.md,.text,.csv,.json,.rtf"
 className="hidden"
 onChange={(e) => { void handleFiles(e.target.files); e.currentTarget.value =""; }}
 />
 <PixelButton onClick={() => fileRef.current?.click()} title="upload PDF / DOCX / TXT">
 {extracting ?"Reading…":"Upload file"}
 </PixelButton>
 {mic.supported && (
 <button
 onClick={toggleRecord}
 title="record live lecture (browser speech recognition)"
 className={`text-xs font-semibold px-2 py-1.5 btn btn-sm ${mic.listening ?"bg-danger text-white border-danger rec-pulse":"bg-surface22 text-muted border-borderStrong hover:bg-surface21 hover:text-surface0"}`}
 >
 {mic.listening ?"Stop recording":"Record"}
 </button>
 )}
 </div>
 </div>
 <textarea
 id="source-paste"
 value={sourcePaste}
 onChange={(e) => setSourcePaste(e.target.value)}
 aria-label="Source text"
 placeholder="Optional: paste notes, a transcript, an article, or drop a file to ground the response."
 spellCheck={false}
 rows={4}
 className="w-full bg-surface0 border-[3px] border-borderStrong3 shadow-sm px-3 py-2 font-mono text-[13px] outline-none focus:ring-2 focus:ring-accent resize-y"
 />
 {extracting && (
 <div role="status"aria-live="polite"className="absolute inset-0 bg-surface23/70 grid place-items-center font-mono text-[13px] text-muted forge-shimmer pointer-events-none rounded-sm">
 extracting text…
 </div>
 )}
 </div>
 {mic.listening && (
 <div className="bg-surface23 text-muted border-2 border-danger p-2 font-mono text-[13px] flex flex-col gap-1">
 <div className="flex items-center gap-1.5 text-[10px] font-semibold text-danger">
 <span className="rec-dot"/> LISTENING · live transcript
 </div>
 <div className="leading-tight max-h-[80px] overflow-auto scroll-pretty">
 {mic.interim || <span className="text-muted1 italic">…listening…</span>}
 </div>
 </div>
 )}
 {mic.error && <div className="font-mono text-[11px] text-warning">mic: {mic.error}</div>}
 {/* YouTube URL import (best-effort transcript + embed) */}
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-xs font-semibold text-muted1">YT</span>
 <input
 value={ytUrl}
 onChange={(e) => setYtUrl(e.target.value)}
 onKeyDown={(e) => { if (e.key ==="Enter") { e.preventDefault(); void loadYoutube(); } }}
 placeholder="paste YouTube URL → best-effort transcript + embed"
 spellCheck={false}
 aria-label="YouTube URL"
 className="flex-1 min-w-[180px] bg-surface0 border-2 border-borderStrong3 px-2 py-1 font-mono text-[12px] outline-none focus:ring-2 focus:ring-accent"
 />
 <PixelButton variant="blue"armed={!ytBusy} onClick={loadYoutube}>
 {ytBusy ?"Loading…":"Load video"}
 </PixelButton>
 </div>
 {ytEmbed && (
 <div className="border-[3px] border-borderStrong3 shadow-sm bg-surface23 p-1.5 pop-in">
 <iframe
 src={ytEmbed}
 title="YouTube source"
 className="w-full aspect-video"
 allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
 allowFullScreen
 />
 </div>
 )}
 </details>

 <div className="flex flex-wrap items-center gap-3">
 <SegGroup
 label="FORMAT"
 value={format}
 options={[["cornell","CORNELL"], ["outline","OUTLINE"], ["qcards","Q-CARDS"]]}
 onChange={(v) => setFormat(v as NoteFormat)}
 />
 <SegGroup
 label="DEPTH"
 value={depth}
 options={[["concise","CONCISE"], ["standard","STANDARD"], ["detailed","DETAILED"]]}
 onChange={(v) => setDepth(v as Depth)}
 />
 <button
 onClick={() => setCloze((x) => !x)}
 className={`text-[10px] font-semibold uppercase px-2 py-1 btn btn-sm ${cloze ?"bg-accent text-white border-accent":"bg-surface1 text-muted border-borderStrong3 hover:bg-surface21 hover:text-surface0"}`}
 title="generate cloze-deletion cards ({{c1::term}}) instead of Q/A"
 >
 CLOZE {cloze ?"ON":"OFF"}
 </button>
 <div className="flex items-center gap-1.5">
 <span className="text-xs font-semibold text-muted1">LANG</span>
 <select
 value={language}
 onChange={(e) => setLanguage(e.target.value)}
 aria-label="Output language"
 className="bg-surface0 border-2 border-borderStrong3 px-1.5 py-1 font-mono text-[12px] outline-none focus:ring-2 focus:ring-accent"
 >
 {LANGS.map((l) => (
 <option key={l} value={l}>{l ==="auto"?"AUTO": l}</option>
 ))}
 </select>
 </div>
 </div>

 {/* Generate + engine */}
 <div className="flex flex-col gap-1.5">
 <div className="flex gap-2 items-center flex-wrap">
 <PixelButton variant="blue"armed={!generating} onClick={generate}>
 {generating ?"Generating…":"Generate notes"}
 </PixelButton>
 {doc && (
 <>
 <PixelButton onClick={pushQcards} title="push Q-cards to the Flashcards deck">
 Add to flashcards
 </PixelButton>
 <PixelButton onClick={copyMarkdown}>COPY MD</PixelButton>
 <PixelButton onClick={exportMarkdown}>EXPORT .MD</PixelButton>
 </>
 )}
 <span className="font-mono text-[11px] text-muted1 flex items-center gap-1.5">
 <span title={cloudArmed ?"online":"offline"} />
 engine:
 <span className={cloudArmed ?"text-accent":"text-warning"}>
 {engineLabel(cfg)}
 </span>
 </span>
 </div>
 {pushedCount !== null && <div className="font-mono text-[11px] text-success">{pushedCount} cards added to Flashcards</div>}
 {genError && (
 <div role="alert"className="font-mono text-[11px] text-warning bg-surface1 border-2 border-warning/60 px-2 py-1 rounded-sm break-words">
 {genError}
 </div>
 )}
 </div>

 {/* Tabs — study methods shown upfront so you can see every mode,
 not gated behind having generated a doc. */}
 {sel && (
 <div className="flex flex-wrap items-center gap-2">
 {(() => {
 const TABS: Tab[] = ["chat","notes","quiz","guide","podcast","match","map"];
 const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
 const i = TABS.indexOf(tab);
 let ni: number | null = null;
 if (e.key ==="ArrowRight") ni = (i + 1) % TABS.length;
 else if (e.key ==="ArrowLeft") ni = (i - 1 + TABS.length) % TABS.length;
 else if (e.key ==="Home") ni = 0;
 else if (e.key ==="End") ni = TABS.length - 1;
 if (ni === null) return;
 e.preventDefault();
 setTab(TABS[ni]);
 document.getElementById(`tab-${TABS[ni]}`)?.focus();
 };
 return (
 <div className="flex border-2 border-borderStrong3 w-fit"role="tablist"aria-label="Study methods">
 {TABS.map((t) => (
 <PixelButton
 key={t}
 id={`tab-${t}`}
 variant={tab === t ?"blue":"default"}
 armed={tab === t}
 onClick={() => setTab(t)}
 role="tab"
 ariaSelected={tab === t}
 // Only point at the panel once it actually exists (it
 // renders only after a doc is generated); before that
 // the reference would dangle.
 ariaControls={doc ?"study-method-panel": undefined}
 onKeyDown={onTabKey}
 // Roving tabindex: only the active tab is in the tab
 // order; the rest are reached via arrow keys.
 tabIndex={tab === t ? 0 : -1}
 >
 {t ==="notes"?"NOTES": t.toUpperCase()}
 </PixelButton>
 ))}
 </div>
 );
 })()}
 {doc && mastery.total > 0 && (
 <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
 <span className="mastery-chip"><b className="text-muted3">{mastery.total}</b> cards</span>
 <span className="mastery-chip new"><b>{mastery.neu}</b> new</span>
 <span className="mastery-chip lrn"><b>{mastery.learning}</b> learning</span>
 <span className="mastery-chip mas"><b>{mastery.Learned}</b> Learned</span>
 <span className={`mastery-chip ${mastery.due > 0 ?"due":""}`}><b>{mastery.due}</b> due</span>
 </div>
 )}
 </div>
 )}

 {/* Body */}
 {generating && !doc ? (
 <div role="status"aria-live="polite"className="bg-surface23 text-muted p-4 rounded font-mono text-[13px] forge-shimmer">
 forging notes…
 </div>
 ) : !doc ? (
 <ChatFirstView
 prompt={prompt}
 onPromptChange={setPrompt}
 onGenerate={generate}
 generating={generating}
 engine={engineLabel(cfg)}
 onUseExample={setPrompt}
 />
 ) : (
 <div
 key={tab}
 id="study-method-panel"
 role="tabpanel"
 aria-labelledby={`tab-${tab}`}
 className="tab-swap"
 >
 {tab ==="notes"? (
 <CornellDoc doc={doc} regenIndex={regenIndex} onRegen={regenSection} />
 ) : tab ==="quiz"? (
 <QuizView cfg={cfg} doc={doc} depth={depth} language={language} />
 ) : tab ==="guide"? (
 <GuideView cfg={cfg} doc={doc} depth={depth} language={language} />
 ) : tab ==="podcast"? (
 <PodcastView cfg={cfg} doc={doc} language={language} />
 ) : tab ==="match"? (
 <MatchView doc={doc} />
 ) : tab ==="map"? (
 <MindMap doc={doc} />
 ) : (
 <ChatView key={sel.id} cfg={cfg} doc={doc} initialPrompt={prompt} />
 )}
 </div>
 )}
 </div>
 )}
 </Panel>

 {toast && (
 <div role="status"aria-live="polite"className="col-span-12 font-mono text-[11px] text-info bg-surface23 border-2 border-info/60 px-2 py-1 rounded-sm w-fit">
 ◆ {toast}
 </div>
 )}
 </main>
 );
}

// ── Segmented control ───────────────────────────────────────────────────
function SegGroup({
 label,
 value,
 options,
 onChange,
}: {
 label: string;
 value: string;
 options: [string, string][];
 onChange: (v: string) => void;
}) {
 return (
 <div className="flex items-center gap-1.5">
 <span className="text-xs font-semibold text-muted1">{label}</span>
 <div className="flex gap-1"role="radiogroup"aria-label={label}>
 {options.map(([v, lbl]) => (
 <button
 key={v}
 onClick={() => onChange(v)}
 role="radio"
 aria-checked={value === v}
 className={`text-[10px] font-semibold uppercase px-2 py-1 btn btn-sm ${value === v ?"bg-accent text-surface0 border-accent":"bg-surface1 text-muted1 border-borderStrong3 hover:bg-surface2 hover:text-surface0"}`}
 >
 {lbl}
 </button>
 ))}
 </div>
 </div>
 );
}

// ── Cornell doc renderer (pop) ───────────────────────────────────────────
function CornellDoc({ doc, regenIndex, onRegen }: { doc: NoteDocument; regenIndex: number | null; onRegen: (i: number) => void }) {
 return (
 <div className="flex flex-col gap-3">
 {/* Summary */}
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 relative pop-in"style={{"--i":"0"} as CSSProperties}>
 <div className="absolute -top-[3px] -left-[3px] bg-accent text-surface0 text-[10px] font-semibold px-1.5 py-0.5">SUMMARY</div>
 <div className="text-[17px] leading-snug pt-2">
 <RichText text={doc.summary} />
 </div>
 </div>

 {/* Sections */}
 {doc.sections.map((sec, i) => {
 const accent = ACCENTS[i % ACCENTS.length];
 return (
 <div
 key={sec.id}
 className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm pop-in hover:-translate-y-[1px] transition-transform"
 style={{ borderLeftWidth: 8, borderLeftColor: accent,"--i": String(i + 1) } as CSSProperties}
 >
 <div className="text-xs font-semibold px-2.5 py-1.5 flex items-center gap-2"style={{ background: accent, color:"var(--surface-0)"}}>
 <span className="text-surface0/70">{String(i + 1).padStart(2,"0")}</span>
 <span className="flex-1 truncate">{sec.topic}</span>
 <button
 onClick={() => onRegen(i)}
 disabled={regenIndex !== null}
 title="regenerate this section with the LLM"
 className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 border-2 border-surface0/60 text-surface0 hover:bg-surface0 hover:text-muted3 transition-colors disabled:opacity-50 disabled:cursor-wait"
 >
 {regenIndex === i ?"Working…":"Regenerate"}
 </button>
 </div>
 <div className="grid grid-cols-3 divide-x-2 divide-base03">
 <div className="p-2.5">
 <div className="text-[10px] font-semibold text-muted1 mb-1">CUES</div>
 {sec.cues.map((c, j) => (
 <div key={j} className="text-[15px] mb-1">▸ <RichLine text={c} /></div>
 ))}
 {sec.cues.length === 0 && <div className="text-[12px] text-muted1 italic">—</div>}
 </div>
 <div className="p-2.5 col-span-2">
 <div className="text-[10px] font-semibold text-muted1 mb-1">NOTES</div>
 <RichText text={sec.notes.join("\n")} bullet />
 {sec.notes.length === 0 && <div className="text-[12px] text-muted1 italic">—</div>}
 </div>
 </div>
 {sec.qcards.length > 0 && (
 <div className="p-2.5 border-t-2 border-borderStrong3 bg-surface0">
 <div className="text-[10px] font-semibold text-muted1 mb-1.5">Q-CARDS → FLASHCARDS</div>
 <div className="grid sm:grid-cols-2 gap-1.5">
 {sec.qcards.map((qc) => (
 <FlipCard key={`${qc.q}::${qc.a}`} q={qc.q} a={qc.a ||"(no answer recorded)"} accent="var(--accent)"/>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 })}

 {/* Citations */}
 {doc.sourceCitations.length > 0 && (
 <div className="flex flex-wrap gap-1.5">
 {doc.sourceCitations.map((c, i) => (
 <Ptag key={i} tone="ink">
 [src] {c.sourceTitle}
 {c.page ? ` p.${c.page}` :""}
 </Ptag>
 ))}
 </div>
 )}
 </div>
 );
}

// ── Flip Q-card ─────────────────────────────────────────────────────────
function FlipCard({ q, a, accent }: { q: string; a: string; accent: string }) {
 const [flipped, setFlipped] = useState(false);
 return (
 <div
 onClick={() => setFlipped((f) => !f)}
 role="button"
 tabIndex={0}
 aria-pressed={flipped}
 aria-label={`Question: ${q} — activate to flip`}
 onKeyDown={(e) => { if (e.key ===""|| e.key ==="Enter") { e.preventDefault(); setFlipped((f) => !f); } }}
 className="flip-card cursor-pointer select-none"
 title="click to flip"
 >
 <div className={`flip-inner ${flipped ?"flipped":""}`}>
 <div className="flip-face bg-surface0 border-2 border-borderStrong3 p-2"style={{ borderColor: accent }}>
 <div className="font-semibold text-[7px] text-muted1">Q</div>
 <div className="font-mono text-[12px] leading-tight">{q}</div>
 </div>
 <div className="flip-face flip-back bg-surface23 border-2 p-2"style={{ borderColor: accent, boxShadow:"inset 0 2px 0 rgba(133,153,0,0.35)"}}>
 <div className="font-semibold text-[7px] text-success">A</div>
 <div className="font-mono text-[12px] leading-tight text-muted">{a}</div>
 </div>
 </div>
 </div>
 );
}

// ── Quiz view ───────────────────────────────────────────────────────────
function QuizView({ cfg, doc, depth, language }: { cfg: AiConfig; doc: NoteDocument; depth: Depth; language: string }) {
 const [quiz, setQuiz] = useState<QuizOutput | null>(null);
 const [busy, setBusy] = useState(false);
 const busyRef = useRef(false);
 const [err, setErr] = useState<string | null>(null);
 const [picks, setPicks] = useState<Record<number, number>>({}); // mcq option index
 const [blanks, setBlanks] = useState<Record<number, string>>({}); // blank/short student text
 const [checked, setChecked] = useState(false);
 const [graded, setGraded] = useState<Record<number, boolean>>({}); // per-q correctness after check
 const [feedback, setFeedback] = useState<Record<number, string>>({});
 const [grading, setGrading] = useState(false);
 const [kind, setKind] = useState<QuizKind>("mcq");
 const [difficulty, setDifficulty] = useState<QuizDifficulty>("standard");
 const [focusTopic, setFocusTopic] = useState("");

 async function make() {
 if (busyRef.current) return;
 busyRef.current = true;
 setErr(null);
 setBusy(true);
 setQuiz(null);
 setPicks({});
 setBlanks({});
 setChecked(false);
 setGraded({});
 setFeedback({});
 try {
 const out = await generateQuiz(cfg, doc.title, notesToText(toCornell(doc)), depth, language, kind, difficulty, focusTopic);
 setQuiz(out);
 } catch (e) {
 setErr(e instanceof Error ? e.message : String(e));
 } finally {
 busyRef.current = false;
 setBusy(false);
 }
 }

 async function check() {
 if (!quiz) return;
 setGrading(true);
 const g: Record<number, boolean> = {};
 const fb: Record<number, string> = {};
 for (let i = 0; i < quiz.questions.length; i++) {
 const q = quiz.questions[i];
 const t = q.type ??"mcq";
 if (t ==="mcq") {
 const pick = picks[i];
 g[i] = pick !== undefined && (q.options?.[pick] === q.answer);
 } else if (t ==="blank") {
 const ans = blanks[i] ??"";
 if (!ans.trim()) {
 g[i] = false;
 } else {
 g[i] = gradeBlank(ans, q.answer);
 }
 } else {
 // short — AI grade
 const ans = blanks[i] ??"";
 if (!ans.trim()) {
 g[i] = false;
 fb[i] ="no answer entered";
 } else {
 try {
 const r = await gradeShort(cfg, q.q, q.answer, ans);
 g[i] = r.correct;
 fb[i] = r.feedback;
 } catch {
 g[i] = false;
 fb[i] ="grading failed";
 }
 }
 }
 }
 setGraded(g);
 setFeedback(fb);
 setChecked(true);
 setGrading(false);
 }

 function answeredCount(): number {
 if (!quiz) return 0;
 return quiz.questions.filter((q, i) => {
 const t = q.type ??"mcq";
 return t ==="mcq"? picks[i] !== undefined : (blanks[i] ??"").trim() !=="";
 }).length;
 }

 function score(): number {
 return Object.values(graded).filter(Boolean).length;
 }

 return (
 <div className="flex flex-col gap-3">
 {/* Quiz controls */}
 <div className="flex flex-col gap-2 bg-surface1 border-2 border-borderStrong3 p-2.5">
 <div className="flex items-center gap-2 flex-wrap">
 <SegGroup
 label="TYPE"
 value={kind}
 options={[["mcq","MCQ"], ["blank","FILL"], ["short","SHORT"], ["mixed","MIXED"]]}
 onChange={(v) => setKind(v as QuizKind)}
 />
 <SegGroup
 label="DIFF"
 value={difficulty}
 options={[["basic","BASIC"], ["standard","STD"], ["exam","EXAM"]]}
 onChange={(v) => setDifficulty(v as QuizDifficulty)}
 />
 <input
 value={focusTopic}
 onChange={(e) => setFocusTopic(e.target.value)}
 placeholder="focus topic (optional)"
 spellCheck={false}
 aria-label="Quiz focus topic"
 className="flex-1 min-w-[140px] bg-surface0 border-2 border-borderStrong3 px-2 py-1 font-mono text-[12px] outline-none focus:ring-2 focus:ring-accent"
 />
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <PixelButton variant="blue"armed={!busy} onClick={make}>
 {busy ?"Building…": quiz ?"New quiz":"Generate quiz"}
 </PixelButton>
 {quiz && !checked && (
 <PixelButton armed={answeredCount() > 0 && !grading} onClick={check}>
 {grading ?"GRADING…":"CHECK ANSWERS"}
 </PixelButton>
 )}
 {quiz && checked && (
 <span className="font-mono text-[14px] text-info text-info">
 SCORE {score()} / {quiz.questions.length}
 </span>
 )}
 {err && <span className="font-mono text-[11px] text-warning break-words">⚠ {err}</span>}
 </div>
 </div>
 {busy && <div role="status"aria-live="polite"className="bg-surface23 text-muted p-3 rounded font-mono text-[13px] forge-shimmer">building quiz…</div>}
 {quiz?.questions.map((q, i) => {
 const t = q.type ??"mcq";
 const pick = picks[i];
 const ok = checked && graded[i];
 const bad = checked && graded[i] === false;
 const ring = ok ?"border-success": bad ?"border-warning":"border-borderStrong3";
 return (
 <div
 key={i}
 className={`bg-surface0 border-[3px] shadow-sm p-2.5 pop-in quiz-q ${ring}`}
 style={{"--i": String(i) } as CSSProperties}
 >
 <div className="text-base mb-1.5 flex items-start gap-1.5">
 <span className="text-[10px] font-semibold text-muted1 mt-1">{t ==="mcq"?"MCQ": t ==="blank"?"FILL":"SHORT"}{i + 1}</span>
 <span className="flex-1">{t ==="blank"? <RichLine text={q.q} /> : q.q}</span>
 </div>
 {t ==="mcq"&& (
 <div className="flex flex-col gap-1">
 {(q.options ?? []).map((opt, j) => {
 const isPicked = pick === j;
 const isAnswer = checked && opt === q.answer;
 let cls ="bg-surface1 border-borderStrong3 text-muted3";
 if (isPicked && !checked) cls ="bg-accent text-surface0 border-accent";
 if (isAnswer) cls ="bg-success text-surface0 border-success";
 else if (isPicked && bad) cls ="bg-warning text-white border-warning";
 return (
 <button
 key={j}
 disabled={checked}
 aria-pressed={isPicked}
 onClick={() => setPicks((p) => ({ ...p, [i]: j }))}
 className={`text-left px-2.5 py-1 btn btn-sm font-mono text-[13px] ${cls} disabled:cursor-default`}
 >
 {String.fromCharCode(65 + j)}. {opt}
 </button>
 );
 })}
 </div>
 )}
 {t ==="blank"&& (
 <input
 value={blanks[i] ??""}
 disabled={checked}
 onChange={(e) => setBlanks((b) => ({ ...b, [i]: e.target.value }))}
 placeholder="type the missing term…"
 spellCheck={false}
 aria-label={`Answer for question ${i + 1}`}
 className={`w-full bg-surface0 border-2 ${ok ?"border-success": bad ?"border-warning":"border-borderStrong3"} px-2.5 py-1.5 font-mono text-[14px] outline-none focus:ring-2 focus:ring-accent`}
 />
 )}
 {t ==="short"&& (
 <textarea
 value={blanks[i] ??""}
 disabled={checked}
 onChange={(e) => setBlanks((b) => ({ ...b, [i]: e.target.value }))}
 placeholder="write your answer…"
 spellCheck={false}
 rows={2}
 aria-label={`Answer for question ${i + 1}`}
 className={`w-full bg-surface0 border-2 ${ok ?"border-success": bad ?"border-warning":"border-borderStrong3"} px-2.5 py-1.5 font-mono text-[13px] outline-none focus:ring-2 focus:ring-accent resize-y`}
 />
 )}
 {checked && (
 <div className="mt-1.5 flex flex-col gap-1">
 {t !=="mcq"&& (
 <div className={`font-mono text-[12px] ${ok ?"text-success":"text-warning"}`}>
 {ok ?"✓ correct":"✗"} model: <RichLine text={q.answer} />
 </div>
 )}
 {feedback[i] && <div className="font-mono text-[12px] text-info">↳ {feedback[i]}</div>}
 {q.explain && <div className="font-mono text-[12px] text-muted1">↳ {q.explain}</div>}
 </div>
 )}
 </div>
 );
 })}
 {quiz === null && !busy && !err && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[15px] text-muted1">
 Generate a quiz from these notes. Pick type (MCQ / fill / short / mixed), difficulty, optional focus topic, then GENERATE.
 </div>
 )}
 </div>
 );
}

// ── Study guide view ────────────────────────────────────────────────────
function GuideView({ cfg, doc, depth, language }: { cfg: AiConfig; doc: NoteDocument; depth: Depth; language: string }) {
 const [guide, setGuide] = useState<StudyGuideOutput | null>(null);
 const [busy, setBusy] = useState(false);
 const busyRef = useRef(false);
 const [err, setErr] = useState<string | null>(null);
 const notesText = useMemo(() => notesToText(toCornell(doc)), [doc]);

 async function make() {
 if (busyRef.current) return;
 busyRef.current = true;
 setErr(null);
 setBusy(true);
 setGuide(null);
 try {
 const out = await generateStudyGuide(cfg, doc.title, notesText, depth, language);
 setGuide(out);
 } catch (e) {
 setErr(e instanceof Error ? e.message : String(e));
 } finally {
 busyRef.current = false;
 setBusy(false);
 }
 }

 function copyGuide() {
 if (!guide) return;
 const md = [
 `# Study Guide — ${doc.title}`,
"",
"## Overview",
 guide.overview,
"",
"## Key terms",
 ...guide.keyTerms.map((t) => `- **${t.term}** — ${t.definition}`),
"",
"## Short-answer questions",
 ...guide.shortAnswer.map((q, i) => `${i + 1}. ${q}`),
"",
"## Essay questions",
 ...guide.essayQuestions.map((q, i) => `${i + 1}. ${q}`),
"",
"## Glossary",
 ...guide.glossary.map((g) => `- **${g.term}**: ${g.meaning}`),
 ].join("\n");
 navigator.clipboard?.writeText(md);
 }

 return (
 <div className="flex flex-col gap-3">
 <div className="flex items-center gap-2 flex-wrap">
 <PixelButton variant="blue"armed={!busy} onClick={make}>
 {busy ?"Building…": guide ?"Regenerate guide":"Create study guide"}
 </PixelButton>
 {guide && <PixelButton onClick={copyGuide}>COPY MD</PixelButton>}
 {err && <span className="font-mono text-[11px] text-warning break-words">⚠ {err}</span>}
 </div>
 {busy && <div role="status"aria-live="polite"className="bg-surface23 text-muted p-3 rounded font-mono text-[13px] forge-shimmer">building guide…</div>}
 {guide && (
 <>
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 pop-in"style={{"--i":"0"} as CSSProperties}>
 <div className="text-xs font-semibold text-muted1 mb-1">OVERVIEW</div>
 <div className="text-[16px] leading-snug">
 <RichText text={guide.overview} />
 </div>
 </div>
 {guide.keyTerms.length > 0 && (
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 pop-in"style={{"--i":"1"} as CSSProperties}>
 <div className="text-xs font-semibold text-muted1 mb-1.5">KEY TERMS</div>
 <div className="flex flex-col gap-1">
 {guide.keyTerms.map((t, i) => (
 <div key={i} className="text-[15px] leading-tight">
 <b className="text-accent">{t.term}</b> — <RichLine text={t.definition} />
 </div>
 ))}
 </div>
 </div>
 )}
 {guide.shortAnswer.length > 0 && (
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 pop-in"style={{"--i":"2", borderLeftWidth: 6, borderLeftColor:"var(--accent)"} as CSSProperties}>
 <div className="text-xs font-semibold text-muted1 mb-1.5">SHORT-ANSWER Qs</div>
 <ol className="list-decimal ml-5 flex flex-col gap-1">
 {guide.shortAnswer.map((q, i) => <li key={i} className="text-[15px] leading-tight"><RichLine text={q} /></li>)}
 </ol>
 </div>
 )}
 {guide.essayQuestions.length > 0 && (
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 pop-in"style={{"--i":"3", borderLeftWidth: 6, borderLeftColor:"var(--accent)"} as CSSProperties}>
 <div className="text-xs font-semibold text-muted1 mb-1.5">ESSAY Qs</div>
 <ol className="list-decimal ml-5 flex flex-col gap-1">
 {guide.essayQuestions.map((q, i) => <li key={i} className="text-[15px] leading-tight"><RichLine text={q} /></li>)}
 </ol>
 </div>
 )}
 {guide.glossary.length > 0 && (
 <div className="bg-surface0 border-[3px] border-borderStrong3 shadow-sm p-3 pop-in"style={{"--i":"4"} as CSSProperties}>
 <div className="text-xs font-semibold text-muted1 mb-1.5">GLOSSARY</div>
 <div className="grid sm:grid-cols-2 gap-1">
 {guide.glossary.map((g, i) => (
 <div key={i} className="bg-surface1 border-2 border-borderStrong3 px-2 py-1">
 <div className="text-[10px] font-semibold text-muted1">{g.term}</div>
 <div className="text-[14px] leading-tight"><RichLine text={g.meaning} /></div>
 </div>
 ))}
 </div>
 </div>
 )}
 </>
 )}
 {guide === null && !busy && !err && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[15px] text-muted1">
 Generate an exam-prep study guide (overview, key terms, short-answer + essay questions, glossary) from these notes.
 </div>
 )}
 </div>
 );
}

// ── Podcast view ────────────────────────────────────────────────────────
function PodcastView({ cfg, doc, language }: { cfg: AiConfig; doc: NoteDocument; language: string }) {
 const [script, setScript] = useState<PodcastScript | null>(null);
 const [busy, setBusy] = useState(false);
 const busyRef = useRef(false);
 const [err, setErr] = useState<string | null>(null);
 const [length, setLength] = useState<"quick"|"deep">("quick");
 const notesText = useMemo(() => notesToText(toCornell(doc)), [doc]);

 async function make() {
 if (busyRef.current) return;
 busyRef.current = true;
 setErr(null);
 setBusy(true);
 setScript(null);
 try {
 const out = await generatePodcastScript(cfg, doc.title, notesText, length, language);
 setScript(out);
 } catch (e) {
 setErr(e instanceof Error ? e.message : String(e));
 } finally {
 busyRef.current = false;
 setBusy(false);
 }
 }

 return (
 <div className="flex flex-col gap-3">
 <div className="flex items-center gap-2 flex-wrap">
 <PixelButton variant="blue"armed={!busy} onClick={make}>
 {busy ?"Writing…": script ?"Regenerate":"Create study podcast"}
 </PixelButton>
 <SegGroup
 label="LEN"
 value={length}
 options={[["quick","QUICK"], ["deep","DEEP"]]}
 onChange={(v) => setLength(v as"quick"|"deep")}
 />
 {err && <span className="font-mono text-[11px] text-warning break-words">⚠ {err}</span>}
 </div>
 {busy && <div role="status"aria-live="polite"className="bg-surface23 text-muted p-3 rounded font-mono text-[13px] forge-shimmer">writing podcast script…</div>}
 {script && <PodcastPlayer script={script} />}
 {script === null && !busy && !err && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[15px] text-muted1">
 Turn these notes into a two-host Study Podcast. The script is LLM-generated; your browser reads it aloud (speechSynthesis). Pick length, hit Study Podcast.
 </div>
 )}
 </div>
 );
}

// ── Match view ──────────────────────────────────────────────────────────
function MatchView({ doc }: { doc: NoteDocument }) {
 const pairs: MatchPair[] = useMemo(() => {
 const all = doc.sections.flatMap((s) => s.qcards).map((q) => ({ term: q.q, def: q.a }));
 const clean = all.filter((p) => p.term && p.def && !p.term.includes("{{c1::"));
 // cap + ensure distinct terms
 const seen = new Set<string>();
 const out: MatchPair[] = [];
 for (const p of clean) {
 if (!seen.has(p.term)) {
 seen.add(p.term);
 out.push(p);
 }
 if (out.length >= 6) break;
 }
 return out;
 }, [doc]);

 if (pairs.length < 4) {
 return (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[15px] text-muted1">
 Matching needs at least 4 Q-cards in these notes. Generate more detailed notes (or add Q-cards) first.
 </div>
 );
 }
 return <MatchGame pairs={pairs} />;
}

function ChatFirstView({
 prompt,
 onPromptChange,
 onGenerate,
 generating,
 engine,
 onUseExample,
}: {
 prompt: string;
 onPromptChange: (value: string) => void;
 onGenerate: () => void;
 generating: boolean;
 engine: string;
 onUseExample: (value: string) => void;
}) {
 const examples = [
"Explain photosynthesis like I’m preparing for an exam",
"Create a study guide for eigenvalues",
"Quiz me on the causes of World War I",
 ];

 return (
 <section className="rounded-xl border-2 border-borderStrong bg-surface0 p-4 sm:p-5 shadow-sm"aria-label="Start a study chat">
 <div className="flex items-start gap-3">
 <span className="studyboy-chat-mark h-9 w-9 shrink-0"aria-hidden="true" />
 <div className="min-w-0">
 <div className="mb-1 text-[17px] font-semibold text-muted3">What do you want to learn?</div>
 <p className="text-[15px] leading-relaxed text-muted1">Ask for an explanation, a study guide, practice questions, or a set of flashcards. You can start from a prompt — uploads are optional.</p>
 </div>
 </div>
 <form className="mt-5"onSubmit={(e) => { e.preventDefault(); onGenerate(); }}>
 <label htmlFor="study-prompt"className="sr-only">What do you want to learn?</label>
 <div className="rounded-xl border-2 border-borderStrong3 bg-white p-2 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-blue/20">
 <textarea
 id="study-prompt"
 value={prompt}
 onChange={(e) => onPromptChange(e.target.value)}
 onKeyDown={(e) => {
 if ((e.metaKey || e.ctrlKey) && e.key ==="Enter") {
 e.preventDefault();
 onGenerate();
 }
 }}
 rows={3}
 placeholder="e.g. Help me understand the causes of the French Revolution…"
 className="min-h-[76px] w-full resize-none bg-transparent px-2 py-1 text-[16px] leading-relaxed text-muted3 outline-none"
 autoFocus
 />
 <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borderStrong/40 px-2 pt-2">
 <span className="text-[12px] text-muted1">{engine} · ⌘/Ctrl + Enter to send</span>
 <button type="submit"disabled={generating || !prompt.trim()} className="rounded-lg bg-accent px-4 py-2 text-[15px] font-semibold text-surface0 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
 {generating ?"Generating…":"Generate notes"}
 </button>
 </div>
 </div>
 </form>
 <div className="mt-4 flex flex-wrap gap-2"aria-label="Example prompts">
 {examples.map((example) => (
 <button key={example} type="button"onClick={() => onUseExample(example)} className="rounded-full border border-borderStrong bg-surface1 px-3 py-1.5 text-left text-[13px] text-muted1 transition hover:border-accent hover:bg-accent/10 hover:text-muted3">
 {example}
 </button>
 ))}
 </div>
 <p className="mt-4 text-[12px] text-muted1">Tip: add files or pasted notes from <strong className="text-muted3">Add optional context</strong> when you want the answer grounded in your own material.</p>
 </section>
 );
}

// ── Chat view ───────────────────────────────────────────────────────────
function ChatView({ cfg, doc, initialPrompt }: { cfg: AiConfig; doc: NoteDocument; initialPrompt?: string }) {
 const [msgs, setMsgs] = useState<{ role:"user"|"ai"; text: string }[]>(() =>
 initialPrompt?.trim()
 ? [
 { role:"user", text: initialPrompt.trim() },
 { role:"ai", text: `I turned that into study notes. ${doc.summary}` },
 ]
 : [],
 );
 const [input, setInput] = useState("");
 const [busy, setBusy] = useState(false);
 const inputRef = useRef<HTMLTextAreaElement>(null);
 const quickAsks = ["Explain the key idea","Quiz me","What should I review next?"];
 useEffect(() => {
 inputRef.current?.focus();
 }, [doc.id]);
 const busyRef = useRef(false);
 const notesText = useMemo(() => notesToText(toCornell(doc)), [doc]);

 async function send() {
 const q = input.trim();
 if (!q || busyRef.current) return;
 busyRef.current = true;
 setInput("");
 setMsgs((m) => [...m, { role:"user", text: q }]);
 setBusy(true);
 try {
 const a = await chatAboutNotes(cfg, notesText, q);
 setMsgs((m) => [...m, { role:"ai", text: a }]);
 } catch (e) {
 setMsgs((m) => [...m, { role:"ai", text: `⚠ ${e instanceof Error ? e.message : String(e)}` }]);
 } finally {
 busyRef.current = false;
 setBusy(false);
 }
 }

 return (
 <div className="flex flex-col gap-3 rounded-xl border border-borderStrong bg-surface0 p-3 sm:p-4">
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-2 text-[15px] font-semibold text-muted3">
 <span className="studyboy-chat-mark"aria-hidden="true" />
 Study chat
 </div>
 <span className="font-mono text-[11px] text-muted1">grounded in your notes</span>
 </div>
 <div className="flex flex-wrap gap-1.5"aria-label="Suggested questions">
 {quickAsks.map((ask) => (
 <button key={ask} type="button"onClick={() => { setInput(ask); inputRef.current?.focus(); }} className="min-h-[36px] rounded-full border border-borderStrong bg-surface1 px-3 py-1 text-[12px] text-muted1 transition hover:border-accent hover:bg-accent/10 hover:text-muted3">
 {ask}
 </button>
 ))}
 </div>
 <div className="flex min-h-[240px] max-h-[420px] flex-col gap-3 overflow-auto rounded-lg bg-surface1 p-3"aria-label="Study chat conversation">
 {msgs.length === 0 && <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[15px] leading-relaxed text-muted3 shadow-sm">I’m ready to help you review these notes. Ask me to explain a concept, compare ideas, or make a practice question.</div>}
 {msgs.map((m, i) => <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words shadow-sm ${m.role ==="user"?"self-end rounded-tr-sm bg-accent text-surface0":"self-start rounded-tl-sm bg-white text-muted3"}`}>{m.text}</div>)}
 {busy && <div className="self-start rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[14px] text-muted1"role="status">Thinking…</div>}
 </div>
 <div className="sr-only"role="status"aria-live="polite">{busy ?"StudyBoy is thinking.": msgs.at(-1)?.role ==="ai"? msgs.at(-1)?.text :""}</div>
 <form className="flex gap-2"onSubmit={(e) => { e.preventDefault(); void send(); }}>
 <label htmlFor="study-chat-input"className="sr-only">Ask a follow-up question</label>
 <textarea ref={inputRef} id="study-chat-input"value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key ==="Enter"&& !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} rows={1} placeholder="Ask StudyBoy a follow-up…"aria-label="Ask a follow-up question"className="min-h-[44px] flex-1 resize-none rounded-xl border-2 border-borderStrong3 bg-white px-4 py-2 text-[15px] leading-relaxed text-muted3 outline-none focus:border-accent focus:ring-2 focus:ring-blue/20"/>
 <button type="submit"disabled={busy || !input.trim()} className="min-h-[44px] rounded-xl bg-accent px-4 text-[15px] font-semibold text-surface0 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">Send</button>
 </form>
 </div>
 );
}

// ── helpers ─────────────────────────────────────────────────────────────
function toCornell(doc: NoteDocument): CornellOutput {
 return {
 summary: doc.summary,
 sections: doc.sections.map((s) => ({ topic: s.topic, cues: s.cues, notes: s.notes, qcards: s.qcards })),
 };
}

function docToMarkdown(doc: NoteDocument): string {
 const lines = [`# ${doc.title}`,"", `> ${doc.summary}`,""];
 for (const s of doc.sections) {
 lines.push(`## ${s.topic}`);
 if (s.cues.length) lines.push("","**Cues:**"+ s.cues.map((c) => `_${c}_`).join("·"));
 if (s.notes.length) lines.push("", s.notes.map((n) => `- ${n}`).join("\n"));
 if (s.qcards.length) lines.push("","**Q-cards:**", s.qcards.map((q) => `- Q: ${q.q} → A: ${q.a}`).join("\n"));
 lines.push("");
 }
 if (doc.sourceCitations.length) {
 lines.push("---","**Sources:**"+ doc.sourceCitations.map((c) => `[${c.sourceTitle}${c.page ? ` p${c.page}` :""}]`).join(","));
 }
 return lines.join("\n");
}
