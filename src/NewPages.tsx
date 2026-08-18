import { useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowCounterClockwise as RotateCcw, ArrowRight, BookOpen, CalendarBlank, CardsThree, Check, CheckCircle,
  ClockCountdown, Gear, NotePencil, Plus, Target, Timer,
  Trash, TrendUp,
} from "@phosphor-icons/react";
import { db, type Assignment, type Course, type CourseColor, type NotebookPage as NotebookPageType, type Task } from "./db";

type CanvasCourse = { id: number; name: string; code?: string };
type CanvasAssignment = { id: number; course_id: number; name: string; due_at: string | null; points_possible: number; submitted: boolean; html_url?: string };
const courseColors: CourseColor[] = ["cs", "math", "bio", "phys", "eng", "hist"];

function Page({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <motion.section className="product-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>{children}
  </motion.section>;
}

export function TodayPage({ onNavigate }: { onNavigate: (view: "chat" | "flashcards") => void }) {
  const tasks = useLiveQuery(() => db.tasks.where("status").notEqual("done").toArray(), []) ?? [];
  const assignments = useLiveQuery(() => db.assignments.toArray(), []) ?? [];
  const cards = useLiveQuery(() => db.flashcards.toArray(), []) ?? [];
  const dueCards = cards.filter((card) => new Date(card.fsrs.due).getTime() <= Date.now());
  return <Page title="Today" description="A clear view of what deserves your attention.">
    <div className="today-layout">
      <section className="today-primary"><h2>Start here</h2><button className="next-action" onClick={() => onNavigate("chat")}><span className="action-icon"><BookOpen size={22} /></span><span><small>Continue studying</small><strong>Your latest study conversation</strong><em>Pick up where you left off</em></span><ArrowRight size={20} /></button>
        <div className="agenda"><h2>Coming up</h2>{assignments.slice(0, 4).map((item) => <div key={item.id}><span className="agenda-date">{new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span><strong>{item.title}</strong><small>{item.state}</small></span></div>)}</div>
      </section>
      <aside className="today-side"><div className="memory-callout"><CardsThree size={24} /><strong>{dueCards.length} cards ready</strong><p>{dueCards.length ? "A short review now will protect what you learned." : "You are caught up for now."}</p><button disabled={!dueCards.length} onClick={() => onNavigate("flashcards")}>Review cards<ArrowRight size={16} /></button></div><div className="task-preview"><h2>Tasks</h2>{tasks.slice(0, 4).map((task) => <button key={task.id} onClick={() => void db.tasks.update(task.id, { status: "done", completedAt: new Date().toISOString() })}><span /><strong>{task.title}</strong></button>)}</div></aside>
    </div>
  </Page>;
}

export function NotebookPage() {
  const pages = useLiveQuery(() => db.notebookPages.toArray().then((items) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []) ?? [];
  const [selectedId, setSelectedId] = useState<string>();
  const selected = pages.find((page) => page.id === selectedId) ?? pages[0];
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  useEffect(() => { setTitle(selected?.title ?? ""); setBody(selected?.body ?? ""); }, [selected?.id]);
  async function create() { const page: NotebookPageType = { id: crypto.randomUUID(), title: "Untitled note", body: "", updatedAt: new Date().toISOString() }; await db.notebookPages.add(page); setSelectedId(page.id); }
  async function save() { if (selected) await db.notebookPages.update(selected.id, { title, body, updatedAt: new Date().toISOString() }); }
  return <Page title="Notebook" description="Notes from lectures, conversations, and your own thinking." action={<button className="page-action" onClick={() => void create()}><Plus size={17} />New note</button>}>
    <div className="notebook-layout"><aside className="note-index">{pages.map((page) => <button key={page.id} className={selected?.id === page.id ? "active" : ""} onClick={() => setSelectedId(page.id)}><strong>{page.title}</strong><small>{new Date(page.updatedAt).toLocaleDateString()}</small></button>)}</aside><section className="note-editor">{selected ? <><input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Note title" /><textarea value={body} onChange={(event) => setBody(event.target.value)} aria-label="Note body" placeholder="Start writing…" /><div><button className="quiet-danger" onClick={() => void db.notebookPages.delete(selected.id)}><Trash size={16} />Delete</button><button className="page-action" onClick={() => void save()}>Save note</button></div></> : <Empty icon={<NotePencil size={24} />} title="No notes yet" body="Create a note or save one from a study conversation." />}</section></div>
  </Page>;
}

export function FlashcardsPage() {
  const cards = useLiveQuery(() => db.flashcards.toArray().then((items) => items.filter((item) => new Date(item.fsrs.due).getTime() <= Date.now()).sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due))), []) ?? [];
  const [index, setIndex] = useState(0); const [revealed, setRevealed] = useState(false);
  const card = cards[index % Math.max(cards.length, 1)];
  async function rate(label: string) {
    if (!card) return;
    const grade = { Again: 1, Hard: 2, Good: 3, Easy: 4 }[label] ?? 3;
    const elapsed = card.fsrs.lastReview ? Math.max(0, (Date.now() - new Date(card.fsrs.lastReview).getTime()) / 86_400_000) : 0;
    const recall = Math.pow(1 + elapsed / (9 * Math.max(.1, card.fsrs.stability)), -1);
    const difficulty = Math.min(10, Math.max(1, card.fsrs.difficulty + (3 - grade) * .55));
    const stability = grade === 1 ? Math.max(.1, card.fsrs.stability * .35) : card.fsrs.stability * (1 + Math.exp((10 - difficulty) / 8) * (grade === 2 ? .35 : grade === 3 ? .8 : 1.25) * Math.max(.25, 1 - recall));
    const intervalDays = grade === 1 ? 10 / 1440 : Math.max(1, stability * (grade === 2 ? .7 : grade === 4 ? 1.3 : 1));
    await db.flashcards.update(card.id, { fsrs: { difficulty, stability, lastReview: new Date().toISOString(), due: new Date(Date.now() + intervalDays * 86_400_000).toISOString(), retrievability: 1, state: grade === 1 ? 1 : 2 } });
    setRevealed(false); setIndex((value) => value + 1);
  }
  return <Page title="Flashcards" description="Review at the edge of forgetting." action={<span className="page-count">{cards.length} cards</span>}>
    <div className="review-layout">{card ? <><div className={`review-card ${revealed ? "revealed" : ""}`} onClick={() => setRevealed(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setRevealed(true); } }} role="button" tabIndex={0}><small>{revealed ? "Answer" : "Question"}</small><p>{revealed ? card.back : card.front}</p><span>{revealed ? "How well did you know it?" : "Click to reveal"}</span></div><div className="review-actions">{revealed ? <>{["Again", "Hard", "Good", "Easy"].map((label) => <button key={label} onClick={() => void rate(label)}>{label}</button>)}</> : <button className="page-action" onClick={() => setRevealed(true)}>Show answer</button>}</div></> : <Empty icon={<CardsThree size={24} />} title="No cards to review" body="Generate flashcards from a study conversation." />}</div>
  </Page>;
}

export function FocusPage() {
  const [seconds, setSeconds] = useState(25 * 60); const [running, setRunning] = useState(false); const [startedAt, setStartedAt] = useState<string>();
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setSeconds((value) => value > 0 ? value - 1 : 0), 1000); return () => window.clearInterval(id); }, [running]);
  useEffect(() => { if (!running && "__TAURI_INTERNALS__" in window) void invoke("blocker_stop"); }, [running]);
  useEffect(() => () => { if ("__TAURI_INTERNALS__" in window) void invoke("blocker_stop"); }, []);
  useEffect(() => { if (seconds === 0) setRunning(false); }, [seconds]);
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  async function toggle() { if (!running) { const profile = (await db.blockProfiles.toArray()).find((item) => item.active); if (profile?.mode === "blocklist" && profile.blocklist.length && "__TAURI_INTERNALS__" in window) await invoke("blocker_start", { blocklist: profile.blocklist }).catch(() => undefined); setStartedAt(new Date().toISOString()); setRunning(true); return; } setRunning(false); if ("__TAURI_INTERNALS__" in window) await invoke("blocker_stop").catch(() => undefined); if (startedAt) await db.focusSessions.add({ id: crypto.randomUUID(), startedAt, endedAt: new Date().toISOString(), plannedFocusMinutes: 25, actualFocusMinutes: Math.max(1, Math.round((25 * 60 - seconds) / 60)), pomodoroCount: 1, interruptions: [], blockingTier: "None" }); }
  return <Page title="Focus" description="Protect one useful block of time."><div className="focus-layout"><section className="focus-clock"><ClockCountdown size={32} /><span>{time}</span><p>Linear Algebra review</p><div><button className="page-action" onClick={() => void toggle()}>{running ? "Pause and save" : "Start focus"}</button><button className="icon-action" onClick={() => { setRunning(false); setStartedAt(undefined); setSeconds(25 * 60); }} aria-label="Reset timer"><RotateCcw size={18} /></button></div></section><aside className="focus-plan"><h2>This session</h2><label><CheckCircle size={19} /><span><strong>Block distracting apps</strong><small>Configure app blocking in the desktop focus profile</small></span></label><label><Timer size={19} /><span><strong>25 minute focus</strong><small>Followed by a 5 minute break</small></span></label></aside></div></Page>;
}

export function CalendarPage() {
  const assignments = useLiveQuery(() => db.assignments.toArray().then((items) => items.sort((a, b) => a.dueAt.localeCompare(b.dueAt))), []) ?? [];
  return <Page title="Calendar" description="See the pressure before it arrives."><div className="timeline">{assignments.map((item) => <article key={item.id}><time><strong>{new Date(item.dueAt).toLocaleDateString(undefined, { day: "numeric" })}</strong><span>{new Date(item.dueAt).toLocaleDateString(undefined, { month: "short" })}</span></time><div><strong>{item.title}</strong><p>{item.state} · {item.pointsPossible} points</p></div><span className={`status ${item.state}`}>{item.state}</span></article>)}</div></Page>;
}

export function TasksPage() {
  const tasks = useLiveQuery(() => db.tasks.toArray().then((items) => items.sort((a, b) => a.sortOrder - b.sortOrder)), []) ?? [];
  const [draft, setDraft] = useState("");
  async function add() { if (!draft.trim()) return; const task: Task = { id: crypto.randomUUID(), title: draft.trim(), status: "inbox", priority: "none", tagIds: [], createdAt: new Date().toISOString(), sortOrder: tasks.length }; await db.tasks.add(task); setDraft(""); }
  return <Page title="Tasks" description="Small commitments, clearly held."><form className="task-composer" onSubmit={(event) => { event.preventDefault(); void add(); }}><Plus size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task" /><button disabled={!draft.trim()}>Add</button></form><div className="task-list">{tasks.map((task) => <article key={task.id} className={task.status === "done" ? "done" : ""}><button className="task-check" aria-label={`${task.status === "done" ? "Mark incomplete" : "Complete"}: ${task.title}`} onClick={() => void db.tasks.update(task.id, { status: task.status === "done" ? "inbox" : "done", completedAt: task.status === "done" ? undefined : new Date().toISOString() })}>{task.status === "done" && <Check size={14} weight="bold" />}</button><div><strong>{task.title}</strong><small>{task.priority === "none" ? "No due date" : `${task.priority} priority`}</small></div><button className="task-delete" onClick={() => void db.tasks.delete(task.id)} aria-label={`Delete ${task.title}`}><Trash size={16} /></button></article>)}</div></Page>;
}

export function CoursesPage() {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  return <Page title="Courses" description="Every class, with the next useful move visible."><div className="course-list">{courses.map((course) => <article key={course.id}><div className={`course-swatch ${course.color}`} /><div><small>{course.code}</small><strong>{course.name}</strong><p>{course.nextDue?.title ?? "No upcoming work"}</p></div><div className="course-progress"><span>{course.completionPct}%</span><div><i style={{ width: `${course.completionPct}%` }} /></div></div><ArrowRight size={18} /></article>)}</div></Page>;
}

export function ProgressPage() {
  const events = useLiveQuery(() => db.gameEvents.toArray(), []) ?? [];
  const saves = useLiveQuery(() => db.savePoints.toArray(), []) ?? [];
  const totalXp = events.reduce((sum, event) => sum + event.xp, 0); const totalMinutes = saves.reduce((sum, save) => sum + save.minutes, 0);
  return <Page title="Progress" description="Evidence that the work is adding up."><div className="progress-summary"><div><TrendUp size={22} /><strong>{Math.round(totalMinutes / 60)}h</strong><span>focused</span></div><div><Target size={22} /><strong>{totalXp}</strong><span>total XP</span></div><div><CheckCircle size={22} /><strong>{events.length}</strong><span>completed sessions</span></div></div><section className="activity-list"><h2>Recent activity</h2>{events.slice(-8).reverse().map((event) => <div key={event.id}><span className="activity-mark" /><strong>{event.type}</strong><span>+{event.xp} XP</span><time>{new Date(event.ts).toLocaleDateString()}</time></div>)}</section></Page>;
}

export function SettingsPage({ llmMode, setLlmMode, onReset }: { llmMode: "cloud" | "local"; setLlmMode: (mode: "cloud" | "local") => void; onReset: () => void }) {
  const [sync, setSync] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [canvasUrl, setCanvasUrl] = useState(() => localStorage.getItem("studyboy.canvas.baseUrl") ?? "");
  const [canvasToken, setCanvasToken] = useState(() => localStorage.getItem("studyboy.canvas.token") ?? "");
  async function syncCanvas() {
    const baseUrl = canvasUrl.trim(); const token = canvasToken.trim();
    if (!baseUrl || !token) { setSync("error"); return; }
    localStorage.setItem("studyboy.canvas.baseUrl", baseUrl); localStorage.setItem("studyboy.canvas.token", token);
    setSync("syncing");
    try { const remote = await invoke<CanvasCourse[]>("canvas_sync_courses", { baseUrl, token }); for (const [index, item] of remote.entries()) { const course: Course = { id: `canvas-${item.id}`, code: item.code || item.name.slice(0, 6).toUpperCase(), name: item.name, color: courseColors[index % courseColors.length], completionPct: 0, remoteUpdatedAt: new Date().toISOString() }; await db.courses.put(course); const assignments = await invoke<CanvasAssignment[]>("canvas_sync_assignments", { baseUrl, token, courseId: item.id }).catch(() => []); for (const remoteAssignment of assignments) { const dueAt = remoteAssignment.due_at || new Date(0).toISOString(); const assignment: Assignment = { id: `canvas-${remoteAssignment.id}`, courseId: `canvas-${remoteAssignment.course_id}`, title: remoteAssignment.name, dueAt, pointsPossible: remoteAssignment.points_possible, submitted: remoteAssignment.submitted, state: remoteAssignment.submitted ? "submitted" : new Date(dueAt).getTime() < Date.now() ? "late" : "unsubmitted", url: remoteAssignment.html_url }; await db.assignments.put(assignment); } } setSync("ok"); } catch { setSync("error"); }
  }
  return <Page title="Settings" description="Margin stays private by default."><div className="settings-list"><section><div><Gear size={20} /><span><strong>AI engine</strong><small>Choose where study responses are generated.</small></span></div><div className="segmented"><button className={llmMode === "local" ? "active" : ""} onClick={() => setLlmMode("local")}>Local</button><button className={llmMode === "cloud" ? "active" : ""} onClick={() => setLlmMode("cloud")}>Cloud</button></div></section><section className="canvas-settings"><div><CalendarBlank size={20} /><span><strong>Canvas LMS</strong><small>{sync === "ok" ? "Courses synced and saved offline." : sync === "error" ? "Check your Canvas URL and access token." : "Assignments remain available offline after sync."}</small></span></div><div className="canvas-connect"><input aria-label="Canvas URL" placeholder="https://school.instructure.com" value={canvasUrl} onChange={(event) => setCanvasUrl(event.target.value)} /><input aria-label="Canvas access token" type="password" placeholder="Access token" value={canvasToken} onChange={(event) => setCanvasToken(event.target.value)} /><button className="secondary-action" disabled={sync === "syncing"} onClick={() => void syncCanvas()}>{sync === "syncing" ? "Syncing…" : "Sync now"}</button></div></section><section><div><Target size={20} /><span><strong>Study data</strong><small>Remove local notes, cards, tasks, chats, credentials, and progress.</small></span></div><button className="danger-action" onClick={onReset}>Reset data</button></section></div></Page>;
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) { return <div className="page-empty"><span>{icon}</span><strong>{title}</strong><p>{body}</p></div>; }
