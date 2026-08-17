import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, genHeatmap, type Course } from "../db";
import { Panel, Donut, MasteryRamp, Heatmap, FocusScreen, Ptag } from "../components/ui";

const COLOR: Record<string, string> = {
 cs: "var(--accent)",
 math: "var(--info)",
 phys: "var(--text-secondary)",
 eng: "var(--text-muted)",
 bio: "#8b5cf6",
 hist: "var(--text-faint)",
};

function hrsFromNow(iso: string) {
 return Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
}

export function Dashboard() {
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
 const tasks = useLiveQuery(() => db.tasks.where("status").anyOf(["next", "inbox"]).toArray(), []) ?? [];
 const savePoints = useLiveQuery(() => db.savePoints.orderBy("at").reverse().limit(6).toArray(), []) ?? [];
 const heatmap = useMemo(() => genHeatmap(), []);

 const gpa = 3.74;
 const [armed, setArmed] = useState(false);
 const [time, setTime] = useState("24:18");
 useEffect(() => {
 if (!armed) return;
 let [m, s] = time.split(":").map(Number);
 const id = setInterval(() => {
 s -= 1;
 if (s < 0) {
 s = 59;
 m -= 1;
 }
 setTime(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
 if (m === 0 && s === 0) clearInterval(id);
 }, 1000);
 return () => clearInterval(id);
 }, [armed, time]);

 const nextUp = useMemo(() => {
 return [...tasks]
 .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
 .slice(0, 5);
 }, [tasks]);

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel title="Courses" sub={`${courses.length} active`} span={12} ariaLabel="Courses">
 <div className="grid grid-cols-3 gap-2.5 max-[1100px]:grid-cols-2">
 {courses.map((c) => (
 <CourseCard key={c.id} c={c} />
 ))}
 </div>
 </Panel>

 <Panel title="GPA" sub="this term" span={4} ariaLabel="GPA">
 <div className="flex flex-col gap-2 justify-center h-full">
 <div className="font-mono text-5xl text-accent leading-none tabular-nums">
 {gpa.toFixed(2)}
 </div>
 <div className="flex items-center gap-2 text-sm">
 <span className="text-success">▲</span>
 <span><b className="tabular-nums">+0.06</b> vs last term</span>
 </div>
 <div className="text-xs text-muted">Scale 0.00 — 4.00 · 6 courses counted</div>
 <hr className="border-0 border-t border-border my-1" />
 <div className="flex flex-wrap gap-1.5">
 <Ptag tone="ink">Dean's List</Ptag>
 <Ptag tone="ember">2 due</Ptag>
 </div>
 </div>
 </Panel>

 <Panel title="Focus" sub="session 3 of 4" span={4} ariaLabel="Focus timer">
 <FocusScreen
 time={time}
 session="Session 03"
 pipsOn={2}
 pipsCur={2}
 label={armed ? "Focus mode active. Distractions blocked." : "Start a session to begin."}
 armed={armed}
 onStart={() => setArmed(true)}
 onPause={() => setArmed(false)}
 mini="25m work · 5m break"
 />
 </Panel>

 <Panel title="Study Heatmap" sub="last 26 weeks" span={4} ariaLabel="Study heatmap">
 <div className="flex flex-col gap-2">
 <Heatmap cells={heatmap} />
 <div className="flex items-center gap-1.5 text-[10px] text-muted mt-1">
 less
 <span className="w-3 h-3 rounded-sm bg-surface3" />
 <span className="w-3 h-3 rounded-sm bg-accentLight" />
 <span className="w-3 h-3 rounded-sm bg-accent" />
 <span className="w-3 h-3 rounded-sm bg-accentHover" />
 <span className="w-3 h-3 rounded-sm bg-warning" />
 more
 </div>
 <div className="text-xs text-muted">Last 7 days · 8h 05m logged</div>
 </div>
 </Panel>

 <Panel title="Deadline Timeline" sub="next 14 days" span={8} ariaLabel="Deadline timeline">
 <DeadlineTimeline courses={courses} />
 </Panel>

 <Panel title="Next Up" sub={`${nextUp.length} queued`} span={4} ariaLabel="Next Up">
 <div className="flex flex-col gap-1.5">
 {nextUp.map((t, i) => {
 const hrs = t.dueDate ? hrsFromNow(t.dueDate) : null;
 return (
 <div
 key={t.id}
 className={`grid items-center gap-2 px-2.5 py-2 rounded border ${i === 0 ? "bg-dangerLight border-danger text-white" : "bg-surface1 border-border"}`}
 style={{ gridTemplateColumns: "1fr auto auto" }}
 >
 <span className="text-sm leading-tight">{t.title}</span>
 <span className="font-mono text-xs">{hrs != null ? `${hrs}h` : "—"}</span>
 <span className="text-muted cursor-pointer">→</span>
 </div>
 );
 })}
 </div>
 </Panel>

 <Panel title="Recent Sessions" sub="study log" span={12} ariaLabel="Recent sessions">
 <div className="flex flex-col gap-1 max-h-[200px] overflow-auto scroll-pretty">
 {savePoints.map((s) => (
 <div
 key={s.id}
 className="grid items-center gap-2 px-2 py-1.5 border border-border rounded bg-surface1 text-xs"
 style={{ gridTemplateColumns: "auto 1fr auto" }}
 >
 <span className="w-2.5 h-2.5 rounded-full bg-info" />
 <span className="text-secondary">{s.label}</span>
 <span className="text-muted">{new Date(s.at).toLocaleString()}</span>
 </div>
 ))}
 </div>
 </Panel>
 </main>
 );
}

function CourseCard({ c }: { c: Course }) {
 const dueHrs = c.nextDue ? hrsFromNow(c.nextDue.at) : null;
 const dueSoon = dueHrs != null && dueHrs <= 18;
 const trendArrow = c.gradeTrend === "up" ? "▲" : c.gradeTrend === "down" ? "▼" : "■";
 return (
 <div
 className="bg-surface0 border border-border rounded-lg p-3 relative grid gap-1.5 shadow-sm"
 style={{ gridTemplateColumns: "auto 1fr", gridTemplateRows: "auto auto auto" }}
 >
 {dueSoon && (
 <span className="absolute -top-2 -right-2 bg-danger text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full shadow-sm">
 Due
 </span>
 )}
 <div className="row-span-3 self-center justify-self-center w-16 h-16 grid place-items-center">
 <div className="relative">
 <Donut pct={c.completionPct} color={COLOR[c.color]} />
 <div className="absolute inset-0 grid place-items-center">
 <span className="font-mono text-sm tabular-nums font-medium">{c.completionPct}%</span>
 </div>
 </div>
 </div>
 <div className="text-[10px] text-muted font-medium">{c.code}</div>
 <div className="text-sm leading-tight col-span-full" style={{ gridColumn: "1/3", marginTop: "-2px" }}>
 {c.name}
 </div>
 <div className="flex flex-col gap-0.5">
 <span className="text-xs text-muted">
 {c.currentLetter} · {c.currentPercent}% {trendArrow}
 </span>
 {c.nextDue && (
 <span className={`text-[11px] inline-flex items-center gap-1 w-fit px-1.5 py-0.5 rounded ${dueSoon ? "bg-danger text-white" : "bg-surface2 text-secondary"}`}>
 ⏱ {c.nextDue.title} · {dueHrs}h
 </span>
 )}
 </div>
 <MasteryRamp level={Math.min(3, Math.floor(c.completionPct / 25)) as 0 | 1 | 2 | 3} />
 </div>
 );
}

function DeadlineTimeline({ courses }: { courses: Course[] }) {
 const today = Date.now();
 const dots = courses
 .filter((c) => c.nextDue)
 .map((c) => {
 const offsetDays = Math.max(0, (new Date(c.nextDue!.at).getTime() - today) / 86400_000);
 return { c, pct: (offsetDays / 14) * 100 };
 });
 return (
 <div>
 <div
 className="relative h-[100px] border border-border rounded bg-surface2"
 style={{
 background:
 "repeating-linear-gradient(90deg,transparent 0 calc(100%/14 - 1px),rgba(0,0,0,.06) calc(100%/14 - 1px) calc(100%/14)),var(--surface-2)",
 }}
 >
 <div
 className="absolute left-0 top-0 bottom-0 w-[8%] border-r-2 border-dashed border-warning"
 style={{ background: "rgba(245,158,11,0.08)" }}
 />
 <div className="absolute top-0 bottom-0 w-px bg-border left-[8%]" />
 <div className="absolute top-1 left-[9%] text-[10px] bg-surface0 border border-border rounded px-1.5 py-0.5 text-muted">Now</div>
 {dots.map(({ c, pct }) => (
 <span
 key={c.id}
 className="absolute w-3 h-3 rounded-full border-2 border-surface0 -translate-x-1/2 -translate-y-1/2"
 style={{ left: `${Math.min(98, 8 + pct * 0.92)}%`, top: "50%", background: COLOR[c.color] }}
 title={`${c.code} · ${c.nextDue!.title}`}
 />
 ))}
 </div>
 <div className="flex justify-between text-[10px] text-muted mt-1 px-0.5">
 <span>Today</span>
 <span>+7d</span>
 <span>+14d</span>
 </div>
 <div className="flex flex-wrap gap-3 mt-2 text-xs">
 {courses.map((c) => (
 <span key={c.id} className="flex items-center gap-1">
 <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLOR[c.color] }} />
 <span className="text-muted">{c.code}</span>
 </span>
 ))}
 </div>
 </div>
 );
}