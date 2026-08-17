// StudyBoy — Dexie v3 local-first store (single read surface for all TS modules).
// Mirrors the StudyForge/StudyBoy spec schema; personal-use demo mode (no multi-tenant).
import Dexie, { type Table } from "dexie";

export type CourseColor = "cs" | "math" | "phys" | "eng" | "bio" | "hist";

export interface Course {
  id: string;
  code: string; // e.g. "CS 286"
  name: string;
  color: CourseColor;
  credits?: number;
  weeklyTargetMin?: number;
  targetGrade?: string;
  completionPct: number; // 0..100
  currentPercent?: number;
  currentLetter?: string;
  gradeTrend?: "up" | "down" | "flat";
  nextDue?: { title: string; at: string }; // ISO
  remoteUpdatedAt?: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  dueAt: string; // ISO
  pointsPossible: number;
  pointsEarned?: number;
  submitted: boolean;
  state: "unsubmitted" | "submitted" | "graded" | "late";
  url?: string;
}

export interface Grade {
  id: string;
  courseId: string;
  assignmentId?: string;
  category?: string;
  pointsEarned?: number;
  pointsPossible: number;
  weight?: number;
  letter?: string;
  percent?: number;
  gradedAt?: string;
  source: "lms" | "manual";
}

export type TaskStatus = "inbox" | "next" | "waiting" | "done" | "trashed";
export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: "none" | "low" | "medium" | "high";
  projectId?: string;
  tagIds: string[];
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  sortOrder: number;
  externalRef?: { source: string; externalId: string; url?: string };
}

export interface Project {
  id: string;
  name: string;
  color: CourseColor;
  courseId?: string;
  archived: boolean;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
  color: CourseColor;
}

export interface FocusSession {
  id: string;
  profileId?: string;
  courseId?: string;
  taskId?: string;
  startedAt: string;
  endedAt?: string;
  plannedFocusMinutes: number;
  actualFocusMinutes: number;
  pomodoroCount: number;
  interruptions: { at: string; recovered: boolean; recoveredAfterSec: number }[];
  blockingTier: "None" | "KillLoop" | "PrivilegedHelper";
}

export interface NoteMakerSession {
  id: string;
  courseId?: string;
  assignmentId?: string;
  title: string;
  status: "draft" | "capturing" | "ingesting" | "generating" | "ready";
  llmMode: "cloud" | "local";
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  noteDocumentId?: string;
  kind: "qa" | "cloze";
  front: string;
  back: string;
  sourceRef?: string;
  fsrs: {
    difficulty: number;
    stability: number;
    retrievability: number;
    state: number;
    lastReview?: string;
    due: string;
  };
}

export interface SavePoint {
  id: string;
  at: string;
  minutes: number;
  courseId?: string;
  label: string;
}

export interface NoteSource {
  id: string;
  sessionId: string;
  kind: "audio" | "pdf" | "text" | "web" | "note" | "transcript";
  title: string;
  status: "imported" | "transcribing" | "ready" | "error";
  pageCount?: number;
  durationSec?: number;
}

export interface NoteDocument {
  id: string;
  sessionId: string;
  format: "cornell" | "outline" | "qcards";
  title: string;
  summary: string;
  sections: { id: string; topic: string; cues: string[]; notes: string[]; qcards: { q: string; a: string; options?: string[] }[] }[];
  sourceCitations: { sourceTitle: string; page?: number }[];
  updatedAt: string;
}

/** Freeform OneNote-style rich note page (markdown-ish body, rich-text rendered). */
export interface NotebookPage {
  id: string;
  title: string;
  body: string; // markdown-ish: headings, bold/ital, lists, code, tables, KaTeX, ==highlight==
  updatedAt: string;
}

export interface Settings {
  id: string; // "app"
  scanlines: boolean;
  reducedMotion: boolean;
  llmMode: "cloud" | "local";
  apiKey?: string;
}

export interface BlockProfile {
  id: string;
  name: string;
  mode: "allowlist" | "blocklist";
  blocklist: string[];
  allowlist: string[];
  pomodoro: { work: number; break: number; longBreak: number; cycles: number };
  active: boolean;
}

export type HabitType = "manual" | "focus-min" | "srs-count" | "todos-done";
export interface Habit {
  id: string;
  name: string;
  type: HabitType;
  target: number;
  schedule: "daily" | "weekly";
  color: CourseColor;
  active: boolean;
}
export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string; // ISO day
  value: number;
  auto: boolean;
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  date: string; // ISO
  weight: number; // % of grade
  readiness: number; // 0..100
}

export interface GameEvent {
  id: string;
  ts: string;
  type: "focus" | "todo" | "srs" | "streak" | "level";
  xp: number;
  courseId?: string;
}

export class StudyBoyDB extends Dexie {
  courses!: Table<Course, string>;
  assignments!: Table<Assignment, string>;
  grades!: Table<Grade, string>;
  tasks!: Table<Task, string>;
  projects!: Table<Project, string>;
  tags!: Table<Tag, string>;
  focusSessions!: Table<FocusSession, string>;
  noteMakerSessions!: Table<NoteMakerSession, string>;
  flashcards!: Table<Flashcard, string>;
  savePoints!: Table<SavePoint, string>;
  noteSources!: Table<NoteSource, string>;
  noteDocuments!: Table<NoteDocument, string>;
  notebookPages!: Table<NotebookPage, string>;
  blockProfiles!: Table<BlockProfile, string>;
  habits!: Table<Habit, string>;
  habitCheckins!: Table<HabitCheckin, string>;
  exams!: Table<Exam, string>;
  gameEvents!: Table<GameEvent, string>;
  settings!: Table<Settings, string>;
}

const db = new StudyBoyDB("studyboy");
db.version(3).stores({
  courses: "id, code, color",
  assignments: "id, courseId, dueAt, state",
  grades: "id, courseId, assignmentId",
  tasks: "id, status, priority, dueDate, projectId",
  projects: "id, courseId, archived",
  tags: "id",
  focusSessions: "id, courseId, startedAt",
  noteMakerSessions: "id, courseId, status",
  flashcards: "id, noteDocumentId",
  savePoints: "id, at, courseId",
  settings: "id",
});
db.version(4).stores({
  courses: "id, code, color",
  assignments: "id, courseId, dueAt, state",
  grades: "id, courseId, assignmentId",
  tasks: "id, status, priority, dueDate, projectId",
  projects: "id, courseId, archived",
  tags: "id",
  focusSessions: "id, courseId, startedAt",
  noteMakerSessions: "id, courseId, status",
  flashcards: "id, noteDocumentId",
  savePoints: "id, at, courseId",
  noteSources: "id, sessionId, status",
  noteDocuments: "id, sessionId",
  settings: "id",
});
db.version(5).stores({
  courses: "id, code, color",
  assignments: "id, courseId, dueAt, state",
  grades: "id, courseId, assignmentId",
  tasks: "id, status, priority, dueDate, projectId",
  projects: "id, courseId, archived",
  tags: "id",
  focusSessions: "id, courseId, startedAt",
  noteMakerSessions: "id, courseId, status",
  flashcards: "id, noteDocumentId",
  savePoints: "id, at, courseId",
  noteSources: "id, sessionId, status",
  noteDocuments: "id, sessionId",
  blockProfiles: "id, active",
  habits: "id, active",
  habitCheckins: "id, habitId, date",
  exams: "id, courseId, date",
  gameEvents: "id, ts, type",
  settings: "id",
});
db.version(6).stores({
  courses: "id, code, color",
  assignments: "id, courseId, dueAt, state",
  grades: "id, courseId, assignmentId",
  tasks: "id, status, priority, dueDate, projectId",
  projects: "id, courseId, archived",
  tags: "id",
  focusSessions: "id, courseId, startedAt",
  noteMakerSessions: "id, courseId, status",
  flashcards: "id, noteDocumentId",
  savePoints: "id, at, courseId",
  noteSources: "id, sessionId, status",
  noteDocuments: "id, sessionId",
  notebookPages: "id, updatedAt",
  blockProfiles: "id, active",
  habits: "id, active",
  habitCheckins: "id, habitId, date",
  exams: "id, courseId, date",
  gameEvents: "id, ts, type",
  settings: "id",
});

export { db };

// ── Demo notes for the Learn tab (idempotent, always seeded) ──
// Rich note sessions + documents + sources + flashcards so every study
// method tab has something to show without requiring AI keys. Uses fixed
// ids prefixed `demo-` so it never duplicates and can be re-run safely.
export async function seedDemoNotes() {
  // Per-session idempotency: seed each demo session + its related records only
  // when that session is missing, so partial state is healed instead of
  // skipped (a single global guard would leave a half-seeded set in place).
  const wantOs = !(await db.noteMakerSessions.get("demo-os"));
  const wantBio = !(await db.noteMakerSessions.get("demo-bio"));
  const wantLa = !(await db.noteMakerSessions.get("demo-linalg"));
  if (!wantOs && !wantBio && !wantLa) return;
  const t = Date.now();
  const isoN = (d: number) => new Date(t + d).toISOString();

  const sessions: NoteMakerSession[] = [
    { id: "demo-os", courseId: "c1", title: "OS · Process Scheduling (demo)", status: "ready", llmMode: "cloud", createdAt: isoN(-h(28)), updatedAt: isoN(-h(28)) },
    { id: "demo-bio", courseId: "c5", title: "Cell Bio · Membrane Transport (demo)", status: "ready", llmMode: "cloud", createdAt: isoN(-h(48)), updatedAt: isoN(-h(48)) },
    { id: "demo-linalg", courseId: "c2", title: "Linear Algebra · Eigenvalues (demo)", status: "ready", llmMode: "cloud", createdAt: isoN(-h(10)), updatedAt: isoN(-h(10)) },
  ];

  const sources: NoteSource[] = [
    { id: "demo-src1", sessionId: "demo-os", kind: "audio", title: "lecture-w12-process-scheduling.m4a", status: "ready", durationSec: 3120 },
    { id: "demo-src2", sessionId: "demo-os", kind: "pdf", title: "OS-textbook-ch5-scheduling.pdf", status: "ready", pageCount: 42 },
    { id: "demo-src3", sessionId: "demo-bio", kind: "text", title: "Chapter 9 — Membrane Transport (pasted)", status: "ready" },
    { id: "demo-src4", sessionId: "demo-linalg", kind: "pdf", title: "linalg-ch5-eigenvalues.pdf", status: "ready", pageCount: 18 },
  ];

  const docs: NoteDocument[] = [
    {
      id: "demo-nd-os",
      sessionId: "demo-os",
      format: "cornell",
      title: "Process Scheduling",
      summary:
        "The OS scheduler picks the next process to run on the CPU. Goals: fairness, throughput, response time. Key policies: FCFS, SJF, round-robin, multilevel feedback. Preemption + priority + aging trade off responsiveness vs overhead.",
      sections: [
        {
          id: "s1",
          topic: "Scheduling goals",
          cues: ["What 5 metrics?", "Why fairness vs throughput tension?"],
          notes: [
            "Metrics: CPU utilization, throughput, turnaround, waiting, response time.",
            "Throughput favors short jobs; fairness favors no starvation → conflict.",
            "Convoy effect: FCFS lets one slow job block many short ones.",
          ],
          qcards: [
            { q: "Name 5 scheduling metrics.", a: "CPU util, throughput, turnaround, waiting, response.", options: ["CPU util, throughput, turnaround, waiting, response", "Memory, disk, net, cache, bus", "Latency, jitter, loss, bandwidth, RTT"] },
            { q: "Why can throughput & fairness conflict?", a: "Short-job bias raises throughput but can starve long jobs.", options: ["Short-job bias raises throughput but can starve long jobs", "They never conflict", "Fairness always raises throughput"] },
          ],
        },
        {
          id: "s2",
          topic: "Round-robin",
          cues: ["What is the quantum?", "Effect of small vs large quantum?"],
          notes: [
            "Time quantum fixed; preempt on expiry; queue FIFO.",
            "Small q → overhead/context switches; large q → FCFS behavior.",
            "Rule of thumb: quantum ≥ 10ms keeps switch overhead < 1%.",
          ],
          qcards: [
            { q: "Define the round-robin quantum.", a: "Fixed time slice each process gets before preemption." },
            { q: "What happens with a very large RR quantum?", a: "Approaches FCFS behavior — low overhead, poor response." },
          ],
        },
        {
          id: "s3",
          topic: "Multilevel feedback queue",
          cues: ["What does feedback mean here?", "How does aging help?"],
          notes: [
            "Multiple queues, different priorities/quantums; processes move between them based on CPU burst behavior.",
            "Aging: boost priority over time to prevent starvation.",
          ],
          qcards: [{ q: "What does 'feedback' mean in MLFQ?", a: "The scheduler observes behavior and moves jobs between priority queues." }],
        },
      ],
      sourceCitations: [{ sourceTitle: "OS-textbook-ch5-scheduling.pdf", page: 14 }, { sourceTitle: "lecture-w12-process-scheduling.m4a" }],
      updatedAt: isoN(-h(28)),
    },
    {
      id: "demo-nd-bio",
      sessionId: "demo-bio",
      format: "cornell",
      title: "Membrane Transport",
      summary:
        "Crossing the bilayer: passive (diffusion, osmosis, facilitated) vs active (pumps using ATP). Concentration gradient + membrane proteins govern flux. Na+/K+ ATPase sets cell potential.",
      sections: [
        {
          id: "s1",
          topic: "Passive transport",
          cues: ["Simple vs facilitated?", "Does it need ATP?"],
          notes: [
            "No ATP; solute moves down its concentration gradient.",
            "Simple diffusion: small nonpolar (O2, CO2) cross the bilayer directly.",
            "Facilitated diffusion: channels/carriers move polar/charged solutes (ions, glucose).",
          ],
          qcards: [
            { q: "Active vs passive — ATP?", a: "Passive = no ATP, down gradient. Active = ATP, up gradient." },
            { q: "Which crosses the bilayer directly — O2 or glucose?", a: "O2 (small, nonpolar). Glucose needs a carrier (facilitated)." },
          ],
        },
        {
          id: "s2",
          topic: "Active transport & pumps",
          cues: ["Na+/K+ ATPase role?", "Primary vs secondary active?"],
          notes: [
            "Na+/K+ ATPase pumps 3 Na+ out, 2 K+ in, using 1 ATP → sets resting membrane potential.",
            "Primary active: directly uses ATP (pumps).",
            "Secondary active: uses gradient from primary (symport/antiport).",
          ],
          qcards: [{ q: "Na+/K+ ATPase stoichiometry?", a: "3 Na+ out, 2 K+ in, 1 ATP." }],
        },
      ],
      sourceCitations: [{ sourceTitle: "Chapter 9 — Membrane Transport (pasted)", page: 3 }],
      updatedAt: isoN(-h(48)),
    },
    {
      id: "demo-nd-linalg",
      sessionId: "demo-linalg",
      format: "outline",
      title: "Eigenvalues & Eigenvectors",
      summary:
        "Av = λv defines eigenpairs. Characteristic polynomial det(A − λI)=0 yields eigenvalues; eigenvectors come from nullspace of (A − λI). Diagonalizable iff A has n linearly independent eigenvectors.",
      sections: [
        {
          id: "s1",
          topic: "Definition",
          cues: ["Eigenvalue equation?", "When is A diagonalizable?"],
          notes: [
            "Av = λv: v (≠0) is an eigenvector, λ the matching eigenvalue.",
            "A diagonalizable ⟺ it has n linearly independent eigenvectors.",
          ],
          qcards: [
            { q: "Eigenvalue equation form?", a: "Av = λv, where v is eigenvector, λ eigenvalue." },
            { q: "When is a matrix diagonalizable?", a: "When it has n linearly independent eigenvectors." },
          ],
        },
        {
          id: "s2",
          topic: "Characteristic polynomial",
          cues: ["How find eigenvalues?", "Algebraic vs geometric multiplicity?"],
          notes: [
            "Solve det(A − λI) = 0 for λ.",
            "Algebraic mult = root multiplicity in the polynomial.",
            "Geometric mult = dim(nullspace of A − λI) ≤ algebraic mult.",
            "A is diagonalizable ⟺ algebraic = geometric for every λ.",
          ],
          qcards: [{ q: "Characteristic equation?", a: "det(A − λI) = 0." }],
        },
      ],
      sourceCitations: [{ sourceTitle: "linalg-ch5-eigenvalues.pdf", page: 7 }],
      updatedAt: isoN(-h(10)),
    },
  ];

  const flashcards: Flashcard[] = [
    { id: "demo-f1", noteDocumentId: "demo-nd-os", kind: "qa", front: "Name 5 scheduling metrics.", back: "CPU util, throughput, turnaround, waiting, response.", sourceRef: "OS ch5 p14", fsrs: { difficulty: 4.5, stability: 1.2, retrievability: 0.7, state: 2, lastReview: isoN(-h(200)), due: isoN(0) } },
    { id: "demo-f2", noteDocumentId: "demo-nd-os", kind: "qa", front: "Define the round-robin quantum.", back: "Fixed time slice each process gets before preemption.", sourceRef: "lecture w12", fsrs: { difficulty: 3.9, stability: 2.1, retrievability: 0.9, state: 2, lastReview: isoN(-h(24)), due: isoN(h(72)) } },
    { id: "demo-f3", noteDocumentId: "demo-nd-os", kind: "qa", front: "What does 'feedback' mean in MLFQ?", back: "The scheduler observes behavior and moves jobs between priority queues.", sourceRef: "OS ch5", fsrs: { difficulty: 4.0, stability: 1.5, retrievability: 0.65, state: 2, due: isoN(0) } },
    { id: "demo-f4", noteDocumentId: "demo-nd-bio", kind: "qa", front: "Active vs passive — ATP?", back: "Passive = no ATP, down gradient. Active = ATP, up gradient.", sourceRef: "ch9 p3", fsrs: { difficulty: 4.0, stability: 1.5, retrievability: 0.65, state: 2, due: isoN(0) } },
    { id: "demo-f5", noteDocumentId: "demo-nd-bio", kind: "cloze", front: "The {{c1::Na+/K+ ATPase}} sets the cell's resting potential.", back: "Na+/K+ ATPase", sourceRef: "ch9 p3", fsrs: { difficulty: 4.8, stability: 0.9, retrievability: 0.55, state: 2, due: isoN(h(4)) } },
    { id: "demo-f6", noteDocumentId: "demo-nd-linalg", kind: "qa", front: "Eigenvalue equation form?", back: "Av = λv, where v is eigenvector, λ eigenvalue.", sourceRef: "MTH 211", fsrs: { difficulty: 4.6, stability: 1.0, retrievability: 0.58, state: 2, due: isoN(h(8)) } },
    { id: "demo-f7", noteDocumentId: "demo-nd-linalg", kind: "cloze", front: "Solve {{c1::det(A − λI) = 0}} to find eigenvalues.", back: "det(A − λI) = 0", sourceRef: "linalg ch5", fsrs: { difficulty: 4.2, stability: 1.1, retrievability: 0.6, state: 2, due: isoN(h(6)) } },
  ];

  // Map each demo doc id -> session id so we can filter records per wanted session.
  const docToSession = new Map(docs.map((d) => [d.id, d.sessionId]));
  const want = (sid: string) => (sid === "demo-os" && wantOs) || (sid === "demo-bio" && wantBio) || (sid === "demo-linalg" && wantLa);
  const fSessions = sessions.filter((s) => want(s.id));
  const fSources = sources.filter((s) => want(s.sessionId));
  const fDocs = docs.filter((d) => want(d.sessionId));
  const fFlash = flashcards.filter((f) => f.noteDocumentId ? want(docToSession.get(f.noteDocumentId) ?? "") : true);

  await db.transaction("rw", [db.noteMakerSessions, db.noteSources, db.noteDocuments, db.flashcards], async () => {
    if (fSessions.length) await db.noteMakerSessions.bulkPut(fSessions);
    if (fSources.length) await db.noteSources.bulkPut(fSources);
    if (fDocs.length) await db.noteDocuments.bulkPut(fDocs);
    if (fFlash.length) await db.flashcards.bulkPut(fFlash);
  });
}

// ── Demo seed (matches the mockup dashboard) ──
const NOW = new Date("2026-07-31T14:00:00Z").getTime();
const iso = (d: number) => new Date(NOW + d).toISOString();
const h = (n: number) => n * 3600_000;

export async function seedIfEmpty() {
  const count = await db.courses.count();
  if (count > 0) return;

  const courses: Course[] = [
    { id: "c1", code: "CS 286", name: "Operating Systems", color: "cs", credits: 4, weeklyTargetMin: 360, targetGrade: "A", completionPct: 72, currentPercent: 88, currentLetter: "B+", gradeTrend: "up", nextDue: { title: "Problem Set 4", at: iso(h(18)) } },
    { id: "c2", code: "MTH 211", name: "Linear Algebra", color: "math", credits: 3, weeklyTargetMin: 300, targetGrade: "A", completionPct: 64, currentPercent: 91, currentLetter: "A-", gradeTrend: "up", nextDue: { title: "Midterm 2 review", at: iso(h(30)) } },
    { id: "c3", code: "PHY 220", name: "Thermodynamics", color: "phys", credits: 4, weeklyTargetMin: 420, targetGrade: "B+", completionPct: 41, currentPercent: 79, currentLetter: "C+", gradeTrend: "flat", nextDue: { title: "Lab report 5", at: iso(h(66)) } },
    { id: "c4", code: "ENG 150", name: "Technical Writing", color: "eng", credits: 2, weeklyTargetMin: 180, targetGrade: "A", completionPct: 88, currentPercent: 95, currentLetter: "A", gradeTrend: "up", nextDue: { title: "Draft memo", at: iso(h(96)) } },
    { id: "c5", code: "BIO 130", name: "Cell Biology", color: "bio", credits: 3, weeklyTargetMin: 240, targetGrade: "B+", completionPct: 55, currentPercent: 84, currentLetter: "B", gradeTrend: "down", nextDue: { title: "Quiz 6", at: iso(h(12)) } },
    { id: "c6", code: "HST 101", name: "Modern Europe", color: "hist", credits: 3, weeklyTargetMin: 200, targetGrade: "B+", completionPct: 60, currentPercent: 86, currentLetter: "B+", gradeTrend: "flat", nextDue: { title: "Essay outline", at: iso(h(54)) } },
  ];

  const assignments: Assignment[] = [
    { id: "a1", courseId: "c1", title: "Problem Set 4", dueAt: iso(h(18)), pointsPossible: 50, submitted: false, state: "unsubmitted", url: "#" },
    { id: "a2", courseId: "c5", title: "Quiz 6", dueAt: iso(h(12)), pointsPossible: 20, submitted: false, state: "unsubmitted" },
    { id: "a3", courseId: "c2", title: "Midterm 2 review", dueAt: iso(h(30)), pointsPossible: 100, submitted: false, state: "unsubmitted" },
    { id: "a4", courseId: "c3", title: "Lab report 5", dueAt: iso(h(66)), pointsPossible: 40, submitted: false, state: "unsubmitted" },
    { id: "a5", courseId: "c6", title: "Essay outline", dueAt: iso(h(54)), pointsPossible: 30, submitted: true, state: "submitted" },
    { id: "a6", courseId: "c4", title: "Draft memo", dueAt: iso(h(96)), pointsPossible: 25, submitted: false, state: "unsubmitted" },
  ];

  const tasks: Task[] = [
    { id: "t1", title: "Finish CS 286 Problem Set 4", status: "next", priority: "high", tagIds: [], dueDate: iso(h(18)), createdAt: iso(-h(48)), sortOrder: 0, externalRef: { source: "canvas", externalId: "a1", url: "#" } },
    { id: "t2", title: "Review BIO 130 chapter 9 (membrane transport)", status: "next", priority: "high", tagIds: [], dueDate: iso(h(12)), createdAt: iso(-h(24)), sortOrder: 1 },
    { id: "t3", title: "Practice MTH 211 eigenvalue problems", status: "next", priority: "medium", tagIds: [], dueDate: iso(h(30)), createdAt: iso(-h(12)), sortOrder: 2 },
    { id: "t4", title: "Write PHY 220 lab report 5 abstract", status: "next", priority: "medium", tagIds: [], dueDate: iso(h(66)), createdAt: iso(-h(6)), sortOrder: 3 },
    { id: "t5", title: "Outline HST 101 essay — industrial revolution", status: "inbox", priority: "low", tagIds: [], dueDate: iso(h(54)), createdAt: iso(-h(3)), sortOrder: 4 },
  ];

  const savePoints: SavePoint[] = [
    { id: "s1", at: iso(-h(2)), minutes: 50, courseId: "c1", label: "Saved · 50 min focus · CS 286" },
    { id: "s2", at: iso(-h(5)), minutes: 25, courseId: "c2", label: "Saved · 25 min focus · MTH 211" },
    { id: "s3", at: iso(-h(26)), minutes: 45, courseId: "c3", label: "Saved · 45 min focus · PHY 220" },
    { id: "s4", at: iso(-h(28)), minutes: 30, courseId: "c5", label: "Saved · 30 min notes · BIO 130" },
    { id: "s5", at: iso(-h(50)), minutes: 60, courseId: "c1", label: "Saved · 60 min flashcards · CS 286" },
  ];

  const noteSessions: NoteMakerSession[] = [
    { id: "n1", courseId: "c1", title: "OS — Process Scheduling lecture", status: "ready", llmMode: "cloud", createdAt: iso(-h(30)), updatedAt: iso(-h(28)) },
    { id: "n2", courseId: "c5", title: "Cell membranes · chapter 9", status: "ready", llmMode: "cloud", createdAt: iso(-h(50)), updatedAt: iso(-h(48)) },
    { id: "n3", courseId: "c2", title: "Eigenvalues (draft)", status: "draft", llmMode: "cloud", createdAt: iso(-h(2)), updatedAt: iso(-h(2)) },
  ];

  const noteSources: NoteSource[] = [
    { id: "src1", sessionId: "n1", kind: "audio", title: "lecture-w12-process-scheduling.m4a", status: "ready", durationSec: 3120 },
    { id: "src2", sessionId: "n1", kind: "pdf", title: "OS-textbook-ch5-scheduling.pdf", status: "ready", pageCount: 42 },
    { id: "src3", sessionId: "n2", kind: "text", title: "Chapter 9 — Membrane Transport (pasted)", status: "ready" },
  ];

  const noteDocuments: NoteDocument[] = [
    {
      id: "nd1",
      sessionId: "n1",
      format: "cornell",
      title: "Process Scheduling",
      summary:
        "The OS scheduler picks the next process to run on the CPU. Goals: fairness, throughput, response time. Key policies: FCFS, SJF, round-robin, multilevel feedback. Preemption + priority + aging trade off responsiveness vs overhead.",
      sections: [
        {
          id: "sec1",
          topic: "Scheduling goals",
          cues: ["What 3 metrics?", "Why fairness vs throughput tension?"],
          notes: [
            "Metrics: CPU utilization, throughput, turnaround, waiting, response time.",
            "Throughput favors short jobs; fairness favors no starvation → conflict.",
          ],
          qcards: [
            { q: "Name 5 scheduling metrics.", a: "CPU util, throughput, turnaround, waiting, response." },
            { q: "Why can throughput & fairness conflict?", a: "Short-job bias raises throughput but can starve long jobs." },
          ],
        },
        {
          id: "sec2",
          topic: "Round-robin",
          cues: ["What is the quantum?", "Effect of small vs large quantum?"],
          notes: [
            "Time quantum fixed; preempt on expiry; queue FIFO.",
            "Small q → overhead/context switches; large q → FCFS behavior.",
          ],
          qcards: [{ q: "Define the round-robin quantum.", a: "Fixed time slice each process gets before preemption." }],
        },
      ],
      sourceCitations: [{ sourceTitle: "OS-textbook-ch5-scheduling.pdf", page: 14 }, { sourceTitle: "lecture-w12-process-scheduling.m4a" }],
      updatedAt: iso(-h(28)),
    },
    {
      id: "nd2",
      sessionId: "n2",
      format: "cornell",
      title: "Membrane Transport",
      summary:
        "Crossing the bilayer: passive (diffusion, osmosis, facilitated) vs active (pumps using ATP). Concentration gradient + membrane proteins govern flux. Na+/K+ ATPase sets cell potential.",
      sections: [
        {
          id: "sec1",
          topic: "Passive transport",
          cues: ["Simple vs facilitated?", "Does it need ATP?"],
          notes: ["No ATP; down gradient.", "Facilitated uses channels/carriers for polar/charged solutes."],
          qcards: [{ q: "Active vs passive — ATP?", a: "Passive = no ATP, down gradient. Active = ATP, up gradient." }],
        },
      ],
      sourceCitations: [{ sourceTitle: "Chapter 9 — Membrane Transport (pasted)", page: 3 }],
      updatedAt: iso(-h(48)),
    },
  ];

  const flashcards: Flashcard[] = [
    { id: "f1", noteDocumentId: "nd1", kind: "qa", front: "Name 5 scheduling metrics.", back: "CPU util, throughput, turnaround, waiting, response.", sourceRef: "OS ch5 p14", fsrs: { difficulty: 4.5, stability: 1.2, retrievability: 0.7, state: 2, lastReview: iso(-h(200)), due: iso(0) } },
    { id: "f2", noteDocumentId: "nd1", kind: "qa", front: "Why can throughput & fairness conflict?", back: "Short-job bias raises throughput but can starve long jobs.", sourceRef: "OS ch5 p14", fsrs: { difficulty: 5.1, stability: 0.8, retrievability: 0.5, state: 2, due: iso(h(2)) } },
    { id: "f3", noteDocumentId: "nd1", kind: "qa", front: "Define the round-robin quantum.", back: "Fixed time slice each process gets before preemption.", sourceRef: "lecture w12", fsrs: { difficulty: 3.9, stability: 2.1, retrievability: 0.9, state: 2, lastReview: iso(-h(24)), due: iso(h(72)) } },
    { id: "f4", noteDocumentId: "nd2", kind: "qa", front: "Active vs passive — ATP?", back: "Passive = no ATP, down gradient. Active = ATP, up gradient.", sourceRef: "ch9 p3", fsrs: { difficulty: 4.0, stability: 1.5, retrievability: 0.65, state: 2, due: iso(0) } },
    { id: "f5", noteDocumentId: "nd2", kind: "cloze", front: "The {{c1::Na+/K+ ATPase}} sets the cell's resting potential.", back: "Na+/K+ ATPase", sourceRef: "ch9 p3", fsrs: { difficulty: 4.8, stability: 0.9, retrievability: 0.55, state: 2, due: iso(h(4)) } },
    { id: "f6", kind: "qa", front: "What is a TLB?", back: "Translation Lookaside Buffer — caches recent virtual→physical page translations.", sourceRef: "OS ch4 p8", fsrs: { difficulty: 3.5, stability: 3.0, retrievability: 0.95, state: 2, lastReview: iso(-h(48)), due: iso(h(120)) } },
    { id: "f7", kind: "qa", front: "Difference: process vs thread?", back: "Process = own address space; thread shares process memory.", sourceRef: "OS ch3 p2", fsrs: { difficulty: 4.2, stability: 1.1, retrievability: 0.6, state: 2, due: iso(h(6)) } },
    { id: "f8", kind: "qa", front: "Eigenvalue equation form?", back: "Av = λv, where v is eigenvector, λ eigenvalue.", sourceRef: "MTH 211", fsrs: { difficulty: 4.6, stability: 1.0, retrievability: 0.58, state: 2, due: iso(h(8)) } },
    { id: "f9", kind: "qa", front: "First law of thermodynamics?", back: "ΔU = Q − W. Energy change = heat added − work done by system.", sourceRef: "PHY 220", fsrs: { difficulty: 3.8, stability: 2.4, retrievability: 0.92, state: 2, lastReview: iso(-h(72)), due: iso(h(48)) } },
    { id: "f10", kind: "qa", front: "Define enthalpy.", back: "H = U + pV. Heat content at constant pressure.", sourceRef: "PHY 220", fsrs: { difficulty: 4.4, stability: 0.9, retrievability: 0.5, state: 2, due: iso(h(10)) } },
    { id: "f11", kind: "cloze", front: "A {{c1::semipermeable}} membrane lets solvent pass but blocks solute.", back: "semipermeable", sourceRef: "ch9 p5", fsrs: { difficulty: 5.0, stability: 0.7, retrievability: 0.45, state: 2, due: iso(0) } },
    { id: "f12", kind: "qa", front: "Thesis statement placement?", back: "End of the intro paragraph; single arguable claim.", sourceRef: "ENG 150", fsrs: { difficulty: 3.6, stability: 2.6, retrievability: 0.9, state: 2, lastReview: iso(-h(30)), due: iso(h(96)) } },
  ];

  const blockProfiles: BlockProfile[] = [
    {
      id: "bp1",
      name: "Deep Work",
      mode: "blocklist",
      blocklist: ["steam.exe", "discord.exe", "chrome.exe", "spotify.exe", "epicgames.exe"],
      allowlist: ["code.exe", "ponder.exe", "notepad.exe"],
      pomodoro: { work: 25, break: 5, longBreak: 15, cycles: 4 },
      active: true,
    },
    {
      id: "bp2",
      name: "Exam Crunch",
      mode: "allowlist",
      blocklist: [],
      allowlist: ["ponder.exe", "code.exe", "notepad.exe"],
      pomodoro: { work: 50, break: 10, longBreak: 30, cycles: 3 },
      active: false,
    },
  ];

  const habits: Habit[] = [
    { id: "hb1", name: "Daily focus (60m)", type: "focus-min", target: 60, schedule: "daily", color: "cs", active: true },
    { id: "hb2", name: "Review 20 flashcards", type: "srs-count", target: 20, schedule: "daily", color: "bio", active: true },
    { id: "hb3", name: "Finish 3 todos", type: "todos-done", target: 3, schedule: "daily", color: "math", active: true },
    { id: "hb4", name: "Weekly reading", type: "manual", target: 1, schedule: "weekly", color: "hist", active: true },
  ];

  // last 14 days checkins, deterministic
  const habitCheckins: HabitCheckin[] = [];
  {
    let s = 11;
    const rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let d = 13; d >= 0; d--) {
      const dayIso = new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);
      for (const hb of habits) {
        const hit = rng() > 0.35;
        if (!hit) continue;
        const val = hb.type === "focus-min" ? 30 + Math.floor(rng() * 90) : hb.type === "srs-count" ? Math.floor(rng() * 30) : hb.type === "todos-done" ? Math.floor(rng() * 5) : 1;
        habitCheckins.push({ id: `hc-${hb.id}-${d}`, habitId: hb.id, date: dayIso, value: val, auto: hb.type !== "manual" });
      }
    }
  }

  const exams: Exam[] = [
    { id: "e1", courseId: "c1", title: "OS Midterm 2", date: iso(h(72)), weight: 25, readiness: 68 },
    { id: "e2", courseId: "c2", title: "Linear Algebra Final", date: iso(h(168)), weight: 40, readiness: 74 },
    { id: "e3", courseId: "c3", title: "Thermo Midterm", date: iso(h(48)), weight: 30, readiness: 41 },
    { id: "e4", courseId: "c5", title: "Cell Bio Final", date: iso(h(216)), weight: 35, readiness: 55 },
  ];

  const gameEvents: GameEvent[] = [
    { id: "g1", ts: iso(-h(1)), type: "focus", xp: 120, courseId: "c1" },
    { id: "g2", ts: iso(-h(3)), type: "todo", xp: 40 },
    { id: "g3", ts: iso(-h(5)), type: "srs", xp: 60, courseId: "c5" },
    { id: "g4", ts: iso(-h(26)), type: "streak", xp: 100 },
    { id: "g5", ts: iso(-h(30)), type: "focus", xp: 120, courseId: "c2" },
    { id: "g6", ts: iso(-h(48)), type: "todo", xp: 40 },
    { id: "g7", ts: iso(-h(50)), type: "srs", xp: 80, courseId: "c1" },
    { id: "g8", ts: iso(-h(72)), type: "focus", xp: 120, courseId: "c3" },
  ];

  await db.transaction(
    "rw",
    [
      db.courses,
      db.assignments,
      db.tasks,
      db.savePoints,
      db.noteMakerSessions,
      db.noteSources,
      db.noteDocuments,
      db.flashcards,
      db.blockProfiles,
      db.habits,
      db.habitCheckins,
      db.exams,
      db.gameEvents,
      db.settings,
    ],
    async () => {
      await db.courses.bulkPut(courses);
      await db.assignments.bulkPut(assignments);
      await db.tasks.bulkPut(tasks);
      await db.savePoints.bulkPut(savePoints);
      await db.noteMakerSessions.bulkPut(noteSessions);
      await db.noteSources.bulkPut(noteSources);
      await db.noteDocuments.bulkPut(noteDocuments);
      await db.flashcards.bulkPut(flashcards);
      await db.blockProfiles.bulkPut(blockProfiles);
      await db.habits.bulkPut(habits);
      await db.habitCheckins.bulkPut(habitCheckins);
      await db.exams.bulkPut(exams);
      await db.gameEvents.bulkPut(gameEvents);
      await db.settings.put({ id: "app", scanlines: true, reducedMotion: false, llmMode: "cloud" });
    },
  );
}

// ── Heatmap data (deterministic, 26 weeks x 7 days) ──
export function genHeatmap(): { date: number; minutes: number }[] {
  const cells: { date: number; minutes: number }[] = [];
  let seed = 7;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 182; i >= 0; i--) {
    const dow = (new Date(NOW - i * 86400_000).getDay() + 6) % 7; // Mon=0
    const weekend = dow >= 5;
    const r = rng();
    let minutes = 0;
    if (r < 0.3) minutes = 0;
    else if (r < 0.55) minutes = 15 + Math.floor(rng() * 30);
    else if (r < 0.8) minutes = 45 + Math.floor(rng() * 45);
    else if (r < 0.93) minutes = 90 + Math.floor(rng() * 60);
    else minutes = 150 + Math.floor(rng() * 90);
    if (weekend) minutes = Math.floor(minutes * 0.7);
    cells.push({ date: NOW - i * 86400_000, minutes });
  }
  return cells;
}