import { useMemo, useState } from"react";
import { invoke } from"@tauri-apps/api/core";
import { useLiveQuery } from"dexie-react-hooks";
import { db, type Assignment, type Course, type CourseColor } from"../db";
import { Panel, Ptag, Donut, HudCell, PixelDivider, PixelButton } from"../components/ui";

const CANVAS_BASE_STORAGE ="studyboy.canvas.baseUrl";
const CANVAS_TOKEN_STORAGE ="studyboy.canvas.token";

type CanvasCourse = {
 id: number;
 name: string;
 code: string;
 term: string | null;
};
type CanvasAssignment = {
 id: number;
 course_id: number;
 name: string;
 due_at: string | null;
 points_possible: number;
 html_url: string;
 submitted: boolean;
};

const COURSE_COLORS: CourseColor[] = ["cs","math","phys","eng","bio","hist"];
function pickColor(seed: string): CourseColor {
 let h = 0;
 for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
 return COURSE_COLORS[h % COURSE_COLORS.length];
}

// Course color -> CSS var accent (matches spec map)
const COURSE_ACCENT: Record<CourseColor, string> = {
 cs:"var(--accent)",
 math:"var(--info)",
 phys:"var(--surface-2)",
 eng:"var(--text-secondary)",
 bio:"var(--accent)",
 hist:"var(--text-muted)",
};

const TREND_ARROW: Record<NonNullable<Course["gradeTrend"]>, { glyph: string; cls: string; label: string }> = {
 up: { glyph:"▲", cls:"text-info", label:"trending up"},
 down: { glyph:"▼", cls:"text-warning", label:"trending down"},
 flat: { glyph:"▶", cls:"text-muted1", label:"holding"},
};

const STATE_TONE: Record<Assignment["state"],"default"|"ember"|"cyan"|"ink"> = {
 unsubmitted:"ember",
 submitted:"cyan",
 graded:"ink",
 late:"ember",
};
const STATE_LABEL: Record<Assignment["state"], string> = {
 unsubmitted:"UNSUB",
 submitted:"SUBMIT",
 graded:"GRADED",
 late:"LATE",
};

const H48 = 48 * 3600_000;

function fmtDue(iso: string): string {
 const d = new Date(iso);
 return (
 d.toLocaleDateString(undefined, { month:"short", day:"numeric"}) +
""+
 d.toLocaleTimeString(undefined, { hour:"numeric"}) +
"h"
 );
}

function fmtWeekly(min?: number): string {
 if (!min) return"—";
 const h = Math.floor(min / 60);
 const m = min % 60;
 return m ? `${h}h${m}m` : `${h}h`;
}

export function Courses() {
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
 const assignments = useLiveQuery(() => db.assignments.toArray(), []) ?? [];
 const grades = useLiveQuery(() => db.grades.toArray(), []) ?? [];
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [syncStatus, setSyncStatus] = useState<
 | { kind:"idle"}
 | { kind:"syncing"}
 | { kind:"ok"; courses: number; assignments: number }
 | { kind:"err"; msg: string }
 >({ kind:"idle"});

 async function syncCanvas() {
 const inTauri = typeof (window as any).__TAURI_INTERNALS__ !=="undefined";
 if (!inTauri) {
 window.alert("Run inside the StudyBoy desktop app.");
 return;
 }
 const baseUrl = localStorage.getItem(CANVAS_BASE_STORAGE) ??"";
 const token = localStorage.getItem(CANVAS_TOKEN_STORAGE) ??"";
 if (!baseUrl || !token) {
 window.alert("Connect Canvas in Settings first.");
 return;
 }
 setSyncStatus({ kind:"syncing"});
 try {
 const remoteCourses = await invoke<CanvasCourse[]>("canvas_sync_courses", {
 baseUrl,
 token,
 });
 let totalAssignments = 0;
 for (const c of remoteCourses) {
 const courseId = `canvas-${c.id}`;
 const code = c.code || c.name.slice(0, 6).toUpperCase();
 const course: Course = {
 id: courseId,
 code,
 name: c.name,
 color: pickColor(c.code || c.name),
 completionPct: 0,
 credits: 3,
 weeklyTargetMin: 180,
 };
 await db.courses.put(course);
 try {
 const remoteAssignments = await invoke<CanvasAssignment[]>(
"canvas_sync_assignments",
 { baseUrl, token, courseId: c.id },
 );
 for (const a of remoteAssignments) {
 const dueAt = a.due_at || new Date(0).toISOString();
 const state: Assignment["state"] = a.submitted
 ?"submitted"
 : a.due_at && new Date(a.due_at).getTime() < Date.now()
 ?"late"
 :"unsubmitted";
 const assignment: Assignment = {
 id: `canvas-${a.id}`,
 courseId: `canvas-${a.course_id}`,
 title: a.name,
 dueAt,
 pointsPossible: a.points_possible,
 submitted: a.submitted,
 state,
 url: a.html_url,
 };
 await db.assignments.put(assignment);
 totalAssignments++;
 }
 } catch (e) {
 // per-course assignment sync failure non-fatal
 }
 }
 setSyncStatus({
 kind:"ok",
 courses: remoteCourses.length,
 assignments: totalAssignments,
 });
 } catch (e) {
 setSyncStatus({ kind:"err", msg: String(e) });
 }
 }

 const dueSoonCount = useMemo(() => {
 const now = Date.now();
 return courses.filter((c) => c.nextDue && new Date(c.nextDue.at).getTime() - now <= H48 && new Date(c.nextDue.at).getTime() - now >= -H48 * 7).length;
 }, [courses]);

 const totalCredits = useMemo(
 () => courses.reduce((s, c) => s + (c.credits ?? 0), 0),
 [courses],
 );

 const selected = courses.find((c) => c.id === selectedId) ?? null;
 const selAssignments = useMemo(
 () =>
 assignments
 .filter((a) => a.courseId === selectedId)
 .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
 [assignments, selectedId],
 );
 const selGrades = useMemo(
 () => grades.filter((g) => g.courseId === selectedId),
 [grades, selectedId],
 );
 const selAvgPct = useMemo(() => {
 const withPct = selGrades
 .map((g) => g.percent ?? (g.pointsPossible ? ((g.pointsEarned ?? 0) / g.pointsPossible) * 100 : undefined))
 .filter((x): x is number => typeof x ==="number"&& !isNaN(x));
 if (!withPct.length) return null;
 return Math.round(withPct.reduce((s, x) => s + x, 0) / withPct.length);
 }, [selGrades]);

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel title="Course LIBRARY"sub={`${courses.length} loaded · ${totalCredits} credits`} span={12} ariaLabel="Courses summary">
 <div className="flex flex-wrap items-center gap-2.5">
 <HudCell icon="▣"value={courses.length} title="Total courses loaded"/>
 <HudCell icon="⊕"value={totalCredits} title="Total enrolled credits"/>
 <HudCell icon="⌛"value={dueSoonCount} title="Courses with something due within 48h"/>
 <div className="ml-auto flex items-center gap-2 flex-wrap">
 {syncStatus.kind ==="ok"&& (
 <span className="font-mono text-[12px] text-info">
 synced {syncStatus.courses} courses · {syncStatus.assignments} assignments
 </span>
 )}
 {syncStatus.kind ==="err"&& (
 <span className="font-mono text-[12px] text-warning break-words max-w-[280px]">
 {syncStatus.msg}
 </span>
 )}
 {syncStatus.kind ==="syncing"&& (
 <span className="font-mono text-[12px] text-muted1">syncing…</span>
 )}
 <PixelButton
 variant="blue"
 armed={syncStatus.kind ==="syncing"}
 onClick={syncCanvas}
 title="pull courses + assignments from Canvas"
 >
 {syncStatus.kind ==="syncing"?"…":"SYNC CANVAS"}
 </PixelButton>
 </div>
 </div>
 </Panel>

 <Panel title="COURSE Courses"sub="select a Course to inspect"span={12} ariaLabel="Course catalog">
 {courses.length === 0 ? (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[16px] text-muted1 flex gap-2 items-center">
 ▲ No Courses inserted. Insert a course to power on your semester.
 </div>
 ) : (
 <div className="grid grid-cols-3 gap-2.5 max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1">
 {courses.map((c) => (
 <CourseCourse
 key={c.id}
 course={c}
 selected={c.id === selectedId}
 onClick={() => setSelectedId((id) => (id === c.id ? null : c.id))}
 />
 ))}
 </div>
 )}
 </Panel>

 {selected && (
 <Panel
 title={`Course · ${selected.code}`}
 sub={selected.name}
 span={12}
 ariaLabel={`Detail for ${selected.code}`}
 >
 <div className="flex flex-wrap items-center gap-3 mb-3">
 <span className="text-xs font-semibold text-muted1">ASSIGNMENTS</span>
 <span className="font-mono text-[11px] text-muted1">· {selAssignments.length} logged</span>
 <span className="text-xs font-semibold text-muted1 ml-2">GRADE AVG</span>
 <span className="font-mono text-[13px] text-muted3">
 {selAvgPct === null ?"—": `${selAvgPct}%`}
 </span>
 {selected.targetGrade && (
 <>
 <span className="text-xs font-semibold text-muted1 ml-2">TARGET</span>
 <Ptag tone="blue">{selected.targetGrade}</Ptag>
 </>
 )}
 </div>

 {selAssignments.length === 0 ? (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[16px] text-muted1 flex gap-2 items-center">
 ▲ Save point empty — no assignments logged for this Course yet.
 </div>
 ) : (
 <div className="overflow-x-auto scroll-pretty">
 <table className="w-full border-collapse text-sm min-w-[560px]">
 <thead>
 <tr className="text-xs font-semibold text-muted1 text-left">
 <th className="py-1.5 pr-3 border-b-2 border-borderStrong3">TITLE</th>
 <th className="py-1.5 pr-3 border-b-2 border-borderStrong3">DUE</th>
 <th className="py-1.5 pr-3 border-b-2 border-borderStrong3">PTS</th>
 <th className="py-1.5 pr-3 border-b-2 border-borderStrong3">STATE</th>
 <th className="py-1.5 pr-3 border-b-2 border-borderStrong3">SUB</th>
 </tr>
 </thead>
 <tbody>
 {selAssignments.map((a) => {
 const overdue = new Date(a.dueAt).getTime() < Date.now() && a.state !=="graded";
 return (
 <tr key={a.id} className="align-top">
 <td className="py-1.5 pr-3 leading-tight">
 {a.url ? (
 <a href={a.url} className="text-accent hover:underline"target="_blank"rel="noreferrer">
 {a.title}
 </a>
 ) : (
 a.title
 )}
 </td>
 <td className={`py-1.5 pr-3 font-mono text-[12px] ${overdue ?"text-warning":"text-muted1"}`}>
 {fmtDue(a.dueAt)}
 {overdue && <span className="ml-1 text-[10px] font-semibold text-warning">!</span>}
 </td>
 <td className="py-1.5 pr-3 font-mono text-[12px] text-muted1">
 {a.pointsEarned != null ? `${a.pointsEarned}/${a.pointsPossible}` : `/${a.pointsPossible}`}
 </td>
 <td className="py-1.5 pr-3">
 <Ptag tone={STATE_TONE[a.state]}>{STATE_LABEL[a.state]}</Ptag>
 </td>
 <td className="py-1.5 pr-3 font-mono text-[12px]">
 {a.submitted ? (
 <span className="text-info">✓ yes</span>
 ) : (
 <span className="text-muted1">— no</span>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </Panel>
 )}
 </main>
 );
}

function CourseCourse({
 course,
 selected,
 onClick,
}: {
 course: Course;
 selected: boolean;
 onClick: () => void;
}) {
 const accent = COURSE_ACCENT[course.color];
 const now = Date.now();
 const dueAt = course.nextDue ? new Date(course.nextDue.at).getTime() : null;
 const dueSoon = dueAt != null && dueAt - now <= H48 && dueAt - now > -H48 * 7;
 const overdue = dueAt != null && dueAt < now;
 const trend = TREND_ARROW[course.gradeTrend ??"flat"];

 return (
 <button
 onClick={onClick}
 aria-label={`Open ${course.code} ${course.name}`}
 className={`group text-left bg-surface1 border-[3px] p-3 rounded-sm transition-transform hover:-translate-y-[1px] ${
 selected ?"shadow-[0_0_0_3px_var(--surface-0),0_0_0_6px_var(--accent)]":"shadow-[3px_3px_0_var(--surface-2)]"
 }`}
 style={{ borderColor: accent }}
 >
 {/* header row: code + color dot */}
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-xs font-semibold text-muted3">{course.code}</span>
 <span
 className="w-3 h-3 border-2 border-borderStrong3"
 style={{ background: accent }}
 aria-hidden
 />
 </div>

 {/* name + donut */}
 <div className="flex items-start gap-2.5 mb-2">
 <div className="relative flex-shrink-0">
 <Donut pct={course.completionPct} size={74} color={accent} />
 <span
 className="absolute inset-0 grid place-items-center font-mono text-[13px] text-muted3 font-medium"
 style={{ pointerEvents:"none"}}
 >
 {course.completionPct}%
 </span>
 </div>
 <div className="min-w-0 flex-1">
 <div className="text-lg leading-tight text-muted3 break-words">{course.name}</div>
 <div className="flex items-center gap-1.5 mt-1">
 <span className="font-mono text-[14px] text-muted3 font-medium">
 {course.currentLetter ??"—"}
 </span>
 <span className="font-mono text-[12px] text-muted1">
 {course.currentPercent != null ? `${course.currentPercent}%` :"—"}
 </span>
 <span className={`${trend.cls} text-[12px]`} title={trend.label} aria-label={trend.label}>
 {trend.glyph}
 </span>
 </div>
 </div>
 </div>

 <PixelDivider />

 {/* stat row */}
 <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] text-muted1">
 <div title="Credits">
 <div className="text-[10px] font-semibold uppercase text-muted1">CR</div>
 <div className="text-muted3">{course.credits ??"—"}</div>
 </div>
 <div title="Weekly target minutes">
 <div className="text-[10px] font-semibold uppercase text-muted1">WK</div>
 <div className="text-muted3">{fmtWeekly(course.weeklyTargetMin)}</div>
 </div>
 <div title="Target grade">
 <div className="text-[10px] font-semibold uppercase text-muted1">TGT</div>
 <div className="text-muted3">{course.targetGrade ??"—"}</div>
 </div>
 </div>

 {/* next due */}
 <div className="mt-2 flex items-center gap-1.5 min-h-[20px]">
 {course.nextDue ? (
 <>
 <span
 className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border-2 border-borderStrong3 ${
 overdue ?"bg-warning text-white": dueSoon ?"bg-warning text-white":"bg-surface23 text-surface0"
 }`}
 >
 {overdue ?"OVERDUE": dueSoon ?"DUE":"NEXT"}
 </span>
 <span className="text-sm text-muted1 leading-tight truncate">
 {course.nextDue.title}
 </span>
 <span className="font-mono text-[10px] text-muted1 ml-auto whitespace-nowrap">
 {fmtDue(course.nextDue.at)}
 </span>
 </>
 ) : (
 <span className="text-[14px] text-muted1 italic">no Recent Sessions due</span>
 )}
 </div>
 </button>
 );
}