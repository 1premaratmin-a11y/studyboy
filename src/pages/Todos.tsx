import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Task, type TaskStatus } from "../db";
import { Panel, PixelButton, Ptag } from "../components/ui";

const PRIORITY_LABEL: Record<Task["priority"], string> = {
 high: "High",
 medium: "Med",
 low: "Low",
 none: "—",
};
const PRIORITY_TONE: Record<Task["priority"], "default" | "ember" | "cyan" | "ink"> = {
 high: "ember",
 medium: "cyan",
 low: "default",
 none: "default",
};

const dayMs = 86_400_000;
function startOfDay(t: number) {
 const d = new Date(t);
 d.setHours(0, 0, 0, 0);
 return d.getTime();
}

function parseDue(input: string): string | undefined {
 const t = input.trim().toLowerCase();
 if (!t) return undefined;
 const now = Date.now();
 const today = startOfDay(now);
 if (/\btoday\b/.test(t)) return new Date(today + 18 * 3_600_000).toISOString();
 if (/\btomorrow\b|\btmr\b/.test(t)) return new Date(today + dayMs + 18 * 3_600_000).toISOString();
 const m = t.match(/(\d+)\s*d/);
 if (m) return new Date(now + Number(m[1]) * dayMs).toISOString();
 const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
 const dm = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)\b/);
 if (dm) {
 const target = days.indexOf(dm[1]);
 let diff = (target - new Date().getDay() + 7) % 7;
 if (diff === 0) diff = 7;
 return new Date(today + diff * dayMs + 18 * 3_600_000).toISOString();
 }
 return undefined;
}

export function Todos() {
 const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? [];
 const [input, setInput] = useState("");
 const [view, setView] = useState<"list" | "kanban">("list");

 const groups = useMemo(() => {
 const now = Date.now();
 const buckets = {
 Overdue: { label: "Overdue", tone: "ember" as const, items: [] as Task[] },
 Today: { label: "Today", tone: "default" as const, items: [] as Task[] },
 Upcoming: { label: "Upcoming", tone: "default" as const, items: [] as Task[] },
 Inbox: { label: "Inbox", tone: "default" as const, items: [] as Task[] },
 Done: { label: "Done", tone: "default" as const, items: [] as Task[] },
 };
 for (const t of tasks) {
 if (t.status === "done" || t.status === "trashed") {
 buckets.Done.items.push(t);
 continue;
 }
 if (t.status === "inbox") {
 buckets.Inbox.items.push(t);
 continue;
 }
 if (!t.dueDate) {
 buckets.Inbox.items.push(t);
 continue;
 }
 const due = new Date(t.dueDate).getTime();
 const diffDays = Math.floor((startOfDay(due) - startOfDay(now)) / dayMs);
 if (diffDays < 0) buckets.Overdue.items.push(t);
 else if (diffDays === 0) buckets.Today.items.push(t);
 else buckets.Upcoming.items.push(t);
 }
 const g = [buckets.Overdue, buckets.Today, buckets.Upcoming, buckets.Inbox, buckets.Done];
 for (const b of g) b.items.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
 return g;
 }, [tasks]);

 async function add() {
 if (!input.trim()) return;
 const due = parseDue(input);
 const title = input.replace(/\b(today|tomorrow|tmr|in\s+\d+\s*days?|\d+d|sun|mon|tue|wed|thu|fri|sat)\b/gi, "").replace(/\s{2,}/g, " ").trim();
 const task: Task = {
 id: crypto.randomUUID(),
 title: title || input.trim(),
 status: "next",
 priority: "medium",
 tagIds: [],
 dueDate: due,
 createdAt: new Date().toISOString(),
 sortOrder: Date.now(),
 };
 await db.tasks.put(task);
 setInput("");
 }

 async function toggle(t: Task) {
 const done = t.status === "done";
 await db.tasks.update(t.id, {
 status: done ? "next" : ("done" as TaskStatus),
 completedAt: done ? undefined : new Date().toISOString(),
 });
 }

 async function del(id: string) {
 await db.tasks.update(id, { status: "trashed" });
 }

 async function promote(t: Task) {
 await db.tasks.update(t.id, { status: "next" });
 }

 const counts = {
 total: tasks.filter((t) => t.status !== "trashed" && t.status !== "done").length,
 done: tasks.filter((t) => t.status === "done").length,
 overdue: groups[0].items.length,
 };

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel title="Tasks" sub={`${counts.total} active · ${counts.done} done · ${counts.overdue} overdue`} span={12} ariaLabel="Todos">
 <div className="flex gap-2 items-center mb-3 flex-wrap">
 <input
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && add()}
 placeholder="Add a task… (try: 'finish lab report tomorrow' or 'review ch5 3d')"
 className="flex-1 min-w-[260px]"
 />
 <PixelButton variant="blue" onClick={add}>Add</PixelButton>
 <div className="flex border border-border rounded overflow-hidden">
 <PixelButton variant={view === "list" ? "blue" : "default"} armed={view === "list"} onClick={() => setView("list")}>
 List
 </PixelButton>
 <PixelButton variant={view === "kanban" ? "blue" : "default"} armed={view === "kanban"} onClick={() => setView("kanban")}>
 Board
 </PixelButton>
 </div>
 </div>

 {view === "list" ? (
 <div className="flex flex-col gap-3">
 {groups.map((grp) =>
 grp.items.length ? (
 <div key={grp.label}>
 <div className={`text-xs font-semibold mb-1.5 ${grp.tone === "ember" ? "text-danger" : "text-muted"}`}>
 {grp.label} · {grp.items.length}
 </div>
 <div className="flex flex-col gap-1">
 {grp.items.map((t) => (
 <TaskRow key={t.id} t={t} onToggle={() => toggle(t)} onDelete={() => del(t.id)} onPromote={() => promote(t)} />
 ))}
 </div>
 </div>
 ) : null,
 )}
 {counts.total === 0 && (
 <div className="border border-dashed border-borderStrong bg-surface1 p-3 text-sm text-muted rounded">
 No tasks yet. Add one above to get started.
 </div>
 )}
 </div>
 ) : (
 <Kanban tasks={tasks} onToggle={toggle} onDelete={del} />
 )}
 </Panel>
 </main>
 );
}

function TaskRow({
 t,
 onToggle,
 onDelete,
 onPromote,
}: {
 t: Task;
 onToggle: () => void;
 onDelete: () => void;
 onPromote: () => void;
}) {
 const done = t.status === "done";
 const due = t.dueDate ? new Date(t.dueDate) : null;
 const overdue = due && due.getTime() < Date.now() && !done;
 const dueLabel = due
 ? due.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
 " " +
 due.toLocaleTimeString(undefined, { hour: "numeric" }) +
 "h"
 : "no date";
 return (
 <div
 className="grid items-center gap-2 px-2.5 py-2 border border-border rounded bg-surface1"
 style={{ gridTemplateColumns: "auto 1fr auto auto auto" }}
 >
 <button
 onClick={onToggle}
 className={`w-4 h-4 rounded border-2 ${done ? "bg-success border-success text-white" : "border-borderStrong bg-surface0"} grid place-items-center text-[10px]`}
 title={done ? "Reopen" : "Complete"}
 >
 {done ? "✓" : ""}
 </button>
 <span className={`text-sm leading-tight min-w-0 break-words ${done ? "line-through text-muted" : "text-primary"}`}>{t.title}</span>
 <span className={`text-xs ${overdue ? "text-danger" : "text-muted"}`}>{dueLabel}</span>
 <Ptag tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Ptag>
 {t.status === "inbox" ? (
 <button onClick={onPromote} className="text-xs text-accent hover:underline" title="Move to Next">
 → Next
 </button>
 ) : (
 <button onClick={onDelete} className="text-xs text-danger hover:underline" title="Delete">
 Delete
 </button>
 )}
 </div>
 );
}

function Kanban({
 tasks,
 onToggle,
 onDelete,
}: {
 tasks: Task[];
 onToggle: (t: Task) => void;
 onDelete: (id: string) => void;
}) {
 const cols: { key: TaskStatus; label: string; tone: string }[] = [
 { key: "inbox", label: "Inbox", tone: "text-muted" },
 { key: "next", label: "Next", tone: "text-accent" },
 { key: "waiting", label: "Waiting", tone: "text-muted" },
 { key: "done", label: "Done", tone: "text-success" },
 ];
 return (
 <div className="grid grid-cols-4 gap-2.5 max-[1000px]:grid-cols-2">
 {cols.map((c) => {
 const items = tasks.filter((t) => t.status === c.key);
 return (
 <div key={c.key} className="bg-surface1 border border-border rounded p-2 min-h-[160px]">
 <div className={`text-xs font-semibold mb-2 ${c.tone}`}>{c.label} · {items.length}</div>
 <div className="flex flex-col gap-1.5">
 {items.map((t) => (
 <div key={t.id} className="bg-surface0 border border-border rounded p-2 shadow-sm">
 <div className="text-sm leading-tight mb-1">{t.title}</div>
 <div className="flex items-center justify-between">
 <Ptag tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Ptag>
 <div className="flex gap-1.5">
 <button onClick={() => onToggle(t)} className="text-xs text-success">✓</button>
 <button onClick={() => onDelete(t.id)} className="text-xs text-danger">×</button>
 </div>
 </div>
 </div>
 ))}
 {items.length === 0 && <div className="text-xs text-muted italic">empty</div>}
 </div>
 </div>
 );
 })}
 </div>
 );
}