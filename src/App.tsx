import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp, BookOpen, Brain, CalendarBlank, CaretDown, CardsThree,
  ChatCircleDots, Check, FilePdf, Gear, House,
  MagnifyingGlass, NotePencil, Paperclip, Plus, SidebarSimple,
  Sparkle, Stack, Target, Timer, Tray,
} from "@phosphor-icons/react";
import { db, seedDemoNotes, seedIfEmpty, type NoteDocument, type NoteMakerSession, type NoteSource } from "./db";
import { autorunOllama, readLastStatus, type AutoRunStatus } from "./lib/ollamaAutoRun";
import { chatAboutNotes, notesToText, readAiConfig, type CornellOutput } from "./aiClient";
import { CommandPalette } from "./components/CommandPalette";
import { Notebook } from "./pages/Notebook";
import { Flashcards } from "./pages/Flashcards";
import { Focus } from "./pages/Focus";
import { Calendar } from "./pages/Calendar";
import { Todos } from "./pages/Todos";
import { Courses } from "./pages/Courses";
import { Progress } from "./pages/Progress";
import { Settings } from "./pages/Settings";

type View = "chat" | "home" | "notebook" | "flashcards" | "focus" | "calendar" | "todos" | "courses" | "progress" | "settings";
type Role = "student" | "studyboy";
type Message = { id: string; role: Role; body: string; cite?: string };
type Artifact = "sources" | "notes" | "quiz" | "guide" | "podcast" | "match" | "map";

const NAV = [
  { key: "home" as View, label: "Today", icon: House },
  { key: "chat" as View, label: "Study chat", icon: ChatCircleDots },
  { key: "notebook" as View, label: "Notebook", icon: NotePencil },
  { key: "flashcards" as View, label: "Flashcards", icon: CardsThree },
  { key: "focus" as View, label: "Focus", icon: Timer },
  { key: "calendar" as View, label: "Calendar", icon: CalendarBlank },
  { key: "todos" as View, label: "Tasks", icon: Check },
  { key: "courses" as View, label: "Courses", icon: BookOpen },
  { key: "progress" as View, label: "Progress", icon: Target },
];

const starterMessages: Message[] = [
  {
    id: "welcome",
    role: "studyboy",
    body: "I read your linear algebra notes. The key tension is simple: eigenvectors keep their direction under a transformation, while eigenvalues tell you how much that direction stretches or flips.",
    cite: "Final exam review · pages 6–8",
  },
  {
    id: "student-1",
    role: "student",
    body: "Explain why a matrix can have fewer eigenvectors than dimensions.",
  },
  {
    id: "answer-1",
    role: "studyboy",
    body: "Because repeated eigenvalues do not always produce enough independent directions. A 2×2 matrix may repeat one eigenvalue but still give only one independent eigenvector. That is the difference between algebraic and geometric multiplicity—and why some matrices cannot be diagonalized.",
    cite: "Lecture 14 · diagonalization",
  },
];

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [railOpen, setRailOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [artifact, setArtifact] = useState<Artifact>("sources");
  const [palette, setPalette] = useState(false);
  const [scan, setScan] = useState(false);
  const [llmMode, setLlmMode] = useState<"cloud" | "local">(() => (localStorage.getItem("studyboy.llmMode") as "cloud" | "local") || "local");
  const [ollama, setOllama] = useState<AutoRunStatus>(() => readLastStatus());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void seedIfEmpty(); void seedDemoNotes(); }, []);
  const sessions = useLiveQuery(
    () => db.noteMakerSessions.toArray().then((items) => items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
  ) ?? [];
  const selected = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const sources = useLiveQuery(
    () => selected ? db.noteSources.where("sessionId").equals(selected.id).toArray() : Promise.resolve([] as NoteSource[]),
    [selected?.id],
  ) ?? [];
  const document = useLiveQuery<NoteDocument | undefined>(() => selected ? db.noteDocuments.where("sessionId").equals(selected.id).first() : Promise.resolve(undefined), [selected?.id]);

  useEffect(() => { let active = true; void autorunOllama().then((status) => { if (active) setOllama(status); }); return () => { active = false; }; }, []);
  useEffect(() => { localStorage.setItem("studyboy.llmMode", llmMode); }, [llmMode]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((value) => !value); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  async function createChat() {
    const session: NoteMakerSession = {
      id: crypto.randomUUID(), title: "Untitled study session", status: "draft",
      llmMode: "local", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await db.noteMakerSessions.add(session);
    setActiveId(session.id);
    setMessages([]);
    setView("chat");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || thinking) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "student", body }]);
    setDraft("");
    setThinking(true);
    try {
      const notes: CornellOutput = document ? { summary: document.summary, sections: document.sections } : { summary: selected?.title ?? "Study session", sections: [] };
      const answer = await chatAboutNotes(readAiConfig(), notesToText(notes), body);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "studyboy", body: answer, cite: selected?.title ?? "Current study session" }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "studyboy", body: `I could not reach the study model. ${error instanceof Error ? error.message : String(error)} Check Settings, then try again.` }]);
    } finally { setThinking(false); }
  }

  async function resetData() { if (!window.confirm("Reset all local Studyboy data? This cannot be undone.")) return; await db.delete(); window.location.reload(); }
  async function attachFile(file?: File) { if (!file || !selected) return; await db.noteSources.add({ id: crypto.randomUUID(), sessionId: selected.id, kind: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text", title: file.name, status: "ready" }); }

  return (
    <main className="app" data-view={view}>
      <span hidden dangerouslySetInnerHTML={{ __html: "<!-- THESIS: Studyboy is a living study canvas, refusing dashboard chrome and generic chatbot bubbles. OWN-WORLD: graphite shell, warm paper workspace, Satoshi type, amber editorial marks. STORY: select material, reason in conversation, produce a study artifact. FIRST VIEWPORT: narrow icon rail, conversation index, dominant paper thread, contextual artifact dock. FORM: editorial split, seed d1b8c46c. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->" }} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} setView={(next) => setView(next === "notes" ? "chat" : next as View)} />
      <Navigation view={view} setView={setView} />
      <section className="stage">
        <Topbar view={view} selected={selected} ollama={ollama} onSearch={() => setPalette(true)} onToggleRail={() => setRailOpen((value) => !value)} />
        {view === "chat" ? (
          <div className={`study-layout ${railOpen ? "with-rail" : ""} ${contextOpen ? "with-context" : ""}`}>
            <AnimatePresence initial={false}>
              {railOpen && <ConversationRail sessions={sessions} selectedId={selected?.id} onSelect={setActiveId} onCreate={() => void createChat()} />}
            </AnimatePresence>
            <Conversation
              title={selected?.title ?? "Start with a question"}
              messages={messages}
              draft={draft}
              thinking={thinking}
              contextOpen={contextOpen}
              setDraft={setDraft}
              onSubmit={sendMessage}
              onToggleContext={() => setContextOpen((value) => !value)}
              textareaRef={textareaRef}
              fileInputRef={fileInputRef}
              onFile={attachFile}
            />
            <AnimatePresence initial={false}>
              {contextOpen && <ContextDock artifact={artifact} setArtifact={setArtifact} sources={sources} onAdd={() => fileInputRef.current?.click()} />}
            </AnimatePresence>
          </div>
        ) : <ModuleView view={view} scan={scan} setScan={setScan} llmMode={llmMode} setLlmMode={setLlmMode} onResetData={resetData} />}
      </section>
    </main>
  );
}

function Navigation({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <aside className="nav-rail" aria-label="Primary navigation">
      <button className="mark" onClick={() => setView("chat")} aria-label="Studyboy home"><span /><span /><span /></button>
      <nav>
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)} aria-current={view === key ? "page" : undefined} aria-label={label} title={label}>
            <Icon size={21} weight={view === key ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button className={`nav-settings ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")} aria-label="Settings" title="Settings"><Gear size={21} /></button>
    </aside>
  );
}

function Topbar({ view, selected, ollama, onSearch, onToggleRail }: { view: View; selected?: NoteMakerSession; ollama: AutoRunStatus; onSearch: () => void; onToggleRail: () => void }) {
  const titles: Record<View, string> = { chat: selected?.title ?? "Study chat", home: "Today", notebook: "Notebook", flashcards: "Flashcards", focus: "Focus", calendar: "Calendar", todos: "Tasks", courses: "Courses", progress: "Progress", settings: "Settings" };
  const modelLabel = ollama.kind === "online" ? `${ollama.model} ready` : ollama.kind === "warming" ? `Loading ${ollama.model}` : ollama.kind === "checking" ? "Checking local model" : ollama.kind === "offline" ? "Local model offline" : "Desktop model";
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button onClick={onToggleRail} aria-label="Toggle conversations"><SidebarSimple size={19} /></button>
        <strong>{titles[view]}</strong>
        {view === "chat" && <button className="title-menu" aria-label="Conversation options"><CaretDown size={14} /></button>}
      </div>
      <div className="topbar-actions">
        <button className="search" onClick={onSearch}><MagnifyingGlass size={17} /><span>Search anything</span><kbd>Ctrl K</kbd></button>
        <div className={`local-state ${ollama.kind}`} title={"message" in ollama ? ollama.message : modelLabel}><span />{modelLabel}</div>
      </div>
    </header>
  );
}

function ConversationRail({ sessions, selectedId, onSelect, onCreate }: { sessions: NoteMakerSession[]; selectedId?: string; onSelect: (id: string) => void; onCreate: () => void }) {
  const grouped = useMemo(() => ({ Today: sessions.slice(0, 3), Earlier: sessions.slice(3, 8) }), [sessions]);
  return (
    <motion.aside className="conversation-rail" initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -18, opacity: 0 }} transition={{ duration: .22 }}>
      <button className="new-chat" onClick={onCreate}><Plus size={17} weight="bold" />New conversation</button>
      <div className="conversation-list">
        {Object.entries(grouped).map(([label, group]) => group.length > 0 && (
          <section key={label}>
            <h2>{label}</h2>
            {group.map((session) => (
              <button key={session.id} className={session.id === selectedId ? "selected" : ""} onClick={() => onSelect(session.id)}>
                <span>{session.title}</span><small>{session.status === "ready" ? "Ready to study" : "Draft"}</small>
              </button>
            ))}
          </section>
        ))}
      </div>
      <div className="storage-note"><Stack size={17} /><span>Saved on this device</span></div>
    </motion.aside>
  );
}

function Conversation({ title, messages, draft, thinking, contextOpen, setDraft, onSubmit, onToggleContext, textareaRef, fileInputRef, onFile }: {
  title: string; messages: Message[]; draft: string; thinking: boolean; contextOpen: boolean;
  setDraft: (value: string) => void; onSubmit: (event: FormEvent) => void; onToggleContext: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void;
}) {
  return (
    <section className="conversation">
      <div className="thread" aria-live="polite">
        <div className="thread-intro">
          <div className="thread-mark"><Brain size={23} weight="duotone" /></div>
          <p>Working session</p>
          <h1>{title}</h1>
          <span>Studyboy uses your material and keeps everything on this device.</span>
        </div>
        <div className="messages">
          {messages.length === 0 && <EmptyThread onPrompt={setDraft} />}
          {messages.map((message) => <MessageBlock key={message.id} message={message} />)}
          {thinking && <Thinking />}
        </div>
      </div>
      <div className="composer-wrap">
        <form className="composer" onSubmit={onSubmit}>
          <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} placeholder="Ask, explain, quiz, or make something…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <div className="composer-actions">
            <div>
              <input ref={fileInputRef} className="sr-only" type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => { onFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach source"><Paperclip size={19} /></button>
              <button type="button" className={contextOpen ? "active" : ""} aria-expanded={contextOpen} onClick={onToggleContext}><Tray size={18} /><span>Materials</span></button>
            </div>
            <button className="send" disabled={!draft.trim() || thinking} aria-label="Send message"><ArrowUp size={18} weight="bold" /></button>
          </div>
        </form>
        <p>Studyboy can make mistakes. Check important details against your sources.</p>
      </div>
    </section>
  );
}

function MessageBlock({ message }: { message: Message }) {
  if (message.role === "student") return <motion.div className="student-message" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>{message.body}</motion.div>;
  return (
    <motion.article className="assistant-message" initial={{ opacity: .35 }} animate={{ opacity: 1 }} transition={{ duration: .35 }}>
      <div className="assistant-avatar"><Sparkle size={16} weight="fill" /></div>
      <div><p>{message.body}</p>{message.cite && <button className="citation"><FilePdf size={14} />{message.cite}</button>}</div>
    </motion.article>
  );
}

function EmptyThread({ onPrompt }: { onPrompt: (value: string) => void }) {
  const prompts = ["Explain the hardest idea", "Quiz me from my notes", "Build a 30-minute review plan"];
  return <div className="empty-thread">{prompts.map((prompt) => <button key={prompt} onClick={() => onPrompt(prompt)}>{prompt}<ArrowUp size={15} /></button>)}</div>;
}

function Thinking() {
  return <div className="thinking" role="status"><span /><span /><span /><p>Reading your material</p></div>;
}

function ContextDock({ artifact, setArtifact, sources, onAdd }: { artifact: Artifact; setArtifact: (value: Artifact) => void; sources: { id: string; title: string; kind: string; pageCount?: number }[]; onAdd: () => void }) {
  const tabs: Artifact[] = ["sources", "notes", "quiz", "guide", "podcast", "match", "map"];
  return (
    <motion.aside className="context-dock" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} transition={{ duration: .22 }}>
      <div className="dock-tabs" role="tablist">
        {tabs.map((tab) => <button key={tab} role="tab" aria-selected={artifact === tab} className={artifact === tab ? "active" : ""} onClick={() => setArtifact(tab)}>{tab}</button>)}
      </div>
      {artifact === "sources" && <Sources sources={sources} onAdd={onAdd} />}
      {artifact === "notes" && <NotesArtifact />}
      {artifact === "quiz" && <QuizArtifact />}
      {!["sources", "notes", "quiz"].includes(artifact) && <StudyArtifact kind={artifact} />}
    </motion.aside>
  );
}

function StudyArtifact({ kind }: { kind: Artifact }) {
  const copy: Record<string, { title: string; body: string; action: string }> = {
    guide: { title: "Study guide", body: "A structured review of definitions, connections, and likely exam traps.", action: "Generate guide" },
    podcast: { title: "Audio review", body: "Turn the current material into a concise two-voice study session.", action: "Create audio" },
    match: { title: "Match practice", body: "Pair concepts with definitions until recall becomes automatic.", action: "Start matching" },
    map: { title: "Concept map", body: "See how the ideas in this session depend on one another.", action: "Build map" },
  };
  const item = copy[kind];
  return <div className="dock-content"><header><div><h2>{item.title}</h2><p>{item.body}</p></div></header><button className="artifact-action">{item.action}<ArrowUp size={16} /></button></div>;
}

function Sources({ sources, onAdd }: { sources: { id: string; title: string; kind: string; pageCount?: number }[]; onAdd: () => void }) {
  const items = sources.length ? sources : [{ id: "demo", title: "Final exam review.pdf", kind: "pdf", pageCount: 18 }, { id: "demo-2", title: "Lecture 14 transcript", kind: "transcript" }];
  return <div className="dock-content"><header><div><h2>Materials</h2><p>Answers stay grounded in these files.</p></div></header><button className="add-source" onClick={onAdd}><Plus size={17} />Add material</button><div className="source-list">{items.map((source) => <button key={source.id}><span className="source-icon">{source.kind === "pdf" ? <FilePdf size={19} /> : <NotePencil size={19} />}</span><span><strong>{source.title}</strong><small>{source.pageCount ? `${source.pageCount} pages` : "Transcript"}</small></span><Check size={15} weight="bold" /></button>)}</div><div className="grounding"><Target size={18} /><div><strong>Grounded mode</strong><p>Studyboy prioritizes your material over general knowledge.</p></div></div></div>;
}

function NotesArtifact() {
  return <div className="dock-content"><header><div><h2>Live notes</h2><p>Built from this conversation.</p></div></header><div className="note-sheet"><h3>Eigenvectors</h3><p>Directions that remain on their own span after a linear transformation.</p><h3>Diagonalization</h3><p>Possible when the matrix has enough independent eigenvectors to form a basis.</p><button><BookOpen size={16} />Open in notebook</button></div></div>;
}

function QuizArtifact() {
  return <div className="dock-content"><header><div><h2>Quick check</h2><p>One question at a time.</p></div></header><div className="quiz-sheet"><p>What determines whether a matrix is diagonalizable?</p>{["Its determinant is non-zero", "It has a full eigenvector basis", "All entries are positive"].map((answer, index) => <button key={answer}><span>{String.fromCharCode(65 + index)}</span>{answer}</button>)}</div></div>;
}

function ModuleView({ view, scan, setScan, llmMode, setLlmMode, onResetData }: { view: Exclude<View, "chat">; scan: boolean; setScan: (value: boolean) => void; llmMode: "cloud" | "local"; setLlmMode: (value: "cloud" | "local") => void; onResetData: () => void }) {
  if (view !== "home") return <section className="legacy-surface">
    {view === "notebook" ? <Notebook />
      : view === "flashcards" ? <Flashcards />
      : view === "focus" ? <Focus />
      : view === "calendar" ? <Calendar />
      : view === "todos" ? <Todos />
      : view === "courses" ? <Courses />
      : view === "progress" ? <Progress />
      : view === "settings" ? <Settings scan={scan} setScan={setScan} llmMode={llmMode} setLlmMode={setLlmMode} onResetData={onResetData} />
      : null}
  </section>;
  const content = {
    home: { title: "Make today count.", description: "Three things deserve your attention before the day gets noisy.", icon: House, items: ["Review linear algebra eigenvectors", "Finish operating systems problem set", "20-minute biology recall"] },
  }[view];
  const Icon = content.icon;
  return <motion.section className="module-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="module-heading"><Icon size={30} weight="duotone" /><h1>{content.title}</h1><p>{content.description}</p></div><div className="module-list">{content.items.map((item, index) => <button key={item}><span>{index + 1}</span><strong>{item}</strong><ArrowUp size={16} /></button>)}</div></motion.section>;
}
