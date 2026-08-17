// StudyBoy — Calendar page (monthly aggregator: tasks + assignments + exams)
import { useMemo, useState } from"react";
import { useLiveQuery } from"dexie-react-hooks";
import { db, type Course, type CourseColor } from"../db";
import { Panel, PixelButton, Ptag } from"../components/ui";

const dayMs = 86_400_000;

const COURSE_COLOR: Record<CourseColor, string> = {
 cs:"var(--accent)",
 math:"var(--info)",
 phys:"var(--surface-2)",
 eng:"var(--text-secondary)",
 bio:"var(--accent)",
 hist:"var(--text-muted)",
};

const DOW = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

type ItemKind ="T"|"A"|"E";

interface CalItem {
 id: string;
 kind: ItemKind;
 at: number; // epoch ms
 title: string;
 color: string; // CSS color (course accent or neutral)
 courseCode?: string;
}

function startOfDay(t: number) {
 const d = new Date(t);
 d.setHours(0, 0, 0, 0);
 return d.getTime();
}

// Mon=0 .. Sun=6
function mondayIndex(d: Date) {
 return (d.getDay() + 6) % 7;
}

function monthLabel(year: number, month: number) {
 return new Date(year, month, 1).toLocaleDateString(undefined, {
 month:"long",
 year:"numeric",
 });
}

export function Calendar() {
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
 const assignments = useLiveQuery(() => db.assignments.toArray(), []) ?? [];
 const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? [];
 const exams = useLiveQuery(() => db.exams.toArray(), []) ?? [];

 const today = useMemo(() => startOfDay(Date.now()), []);
 const [cursor, setCursor] = useState(() => {
 const d = new Date();
 return { year: d.getFullYear(), month: d.getMonth() };
 });

 const courseMap = useMemo(() => {
 const m = new Map<string, Course>();
 for (const c of courses) m.set(c.id, c);
 return m;
 }, [courses]);

 // Derive all calendar items once.
 const items = useMemo<CalItem[]>(() => {
 const out: CalItem[] = [];
 for (const a of assignments) {
 const c = courseMap.get(a.courseId);
 out.push({
 id:"a:"+ a.id,
 kind:"A",
 at: new Date(a.dueAt).getTime(),
 title: a.title,
 color: c ? COURSE_COLOR[c.color] :"var(--text-secondary)",
 courseCode: c?.code,
 });
 }
 for (const e of exams) {
 const c = courseMap.get(e.courseId);
 out.push({
 id:"e:"+ e.id,
 kind:"E",
 at: new Date(e.date).getTime(),
 title: e.title,
 color: c ? COURSE_COLOR[c.color] :"var(--text-secondary)",
 courseCode: c?.code,
 });
 }
 for (const t of tasks) {
 if (!t.dueDate) continue;
 if (t.status ==="trashed"|| t.status ==="done") continue;
 out.push({
 id:"t:"+ t.id,
 kind:"T",
 at: new Date(t.dueDate).getTime(),
 title: t.title,
 color:"var(--text-secondary)",
 });
 }
 return out;
 }, [assignments, exams, tasks, courseMap]);

 // Index items by day-of-year bucket key (yyyy-mm-dd local).
 const byDay = useMemo(() => {
 const m = new Map<string, CalItem[]>();
 for (const it of items) {
 const d = new Date(it.at);
 d.setHours(0, 0, 0, 0);
 const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
 const arr = m.get(key);
 if (arr) arr.push(it);
 else m.set(key, [it]);
 }
 for (const arr of m.values()) arr.sort((a, b) => a.at - b.at);
 return m;
 }, [items]);

 // Build 6-week grid (42 cells) covering the month, Mon-anchored.
 const cells = useMemo(() => {
 const first = new Date(cursor.year, cursor.month, 1);
 const lead = mondayIndex(first);
 const gridStart = startOfDay(first.getTime() - lead * dayMs);
 const out: { date: Date; key: string; inMonth: boolean; isToday: boolean }[] = [];
 for (let i = 0; i < 42; i++) {
 const t = gridStart + i * dayMs;
 const d = new Date(t);
 d.setHours(0, 0, 0, 0);
 out.push({
 date: d,
 key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
 inMonth: d.getMonth() === cursor.month,
 isToday: t === today,
 });
 }
 return out;
 }, [cursor, today]);

 // Upcoming this week (next 7 days, inclusive of today).
 const upcoming = useMemo(() => {
 const end = today + 7 * dayMs;
 return items
 .filter((it) => {
 const s = startOfDay(it.at);
 return s >= today && s < end;
 })
 .sort((a, b) => a.at - b.at);
 }, [items, today]);

 // Counts for legend HUD
 const counts = useMemo(() => {
 let a = 0, t = 0, e = 0;
 for (const it of items) {
 if (it.kind ==="A") a++;
 else if (it.kind ==="T") t++;
 else e++;
 }
 return { a, t, e };
 }, [items]);

 function prevMonth() {
 setCursor((c) => {
 const m = c.month - 1;
 if (m < 0) return { year: c.year - 1, month: 11 };
 return { year: c.year, month: m };
 });
 }
 function nextMonth() {
 setCursor((c) => {
 const m = c.month + 1;
 if (m > 11) return { year: c.year + 1, month: 0 };
 return { year: c.year, month: m };
 });
 }
 function goToday() {
 const d = new Date();
 setCursor({ year: d.getFullYear(), month: d.getMonth() });
 }

 const monthItems = items.filter((it) => {
 const d = new Date(it.at);
 return d.getMonth() === cursor.month && d.getFullYear() === cursor.year;
 }).length;

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel
 title="SCHEDULE · MONTH GRID"
 sub={`${monthLabel(cursor.year, cursor.month)} · ${monthItems} markers`}
 span={8}
 ariaLabel="Month calendar"
 >
 <div className="flex items-center gap-2 mb-3 flex-wrap">
 <PixelButton onClick={prevMonth} title="Previous month">
 ◀ PREV
 </PixelButton>
 <div className="text-sm font-semibold text-muted3 flex-1 text-center">
 {monthLabel(cursor.year, cursor.month).toUpperCase()}
 </div>
 <PixelButton onClick={nextMonth} title="Next month">
 NEXT ▶
 </PixelButton>
 <PixelButton variant="blue"onClick={goToday} title="Jump to today">
 TODAY
 </PixelButton>
 </div>

 {/* Day-of-week header */}
 <div
 className="grid gap-[3px] mb-1"
 style={{ gridTemplateColumns:"repeat(7, 1fr)"}}
 >
 {DOW.map((d) => (
 <div
 key={d}
 className="text-xs font-semibold text-muted1 text-center py-1 bg-surface1 border-2 border-borderStrong3"
 >
 {d}
 </div>
 ))}
 </div>

 {/* 6x7 grid */}
 <div
 className="grid gap-[3px]"
 style={{ gridTemplateColumns:"repeat(7, 1fr)", gridAutoRows:"1fr"}}
 >
 {cells.map((c) => {
 const dayItems = byDay.get(c.key) ?? [];
 return (
 <DayCell
 key={c.key}
 date={c.date}
 inMonth={c.inMonth}
 isToday={c.isToday}
 items={dayItems}
 />
 );
 })}
 </div>

 <div className="mt-3 flex gap-3 flex-wrap items-center font-mono text-[11px] text-muted1">
 <span className="flex items-center gap-1">
 <span className="w-2.5 h-2.5 border border-borderStrong3 bg-surface21"/> TASK (T)
 </span>
 <span className="flex items-center gap-1">
 <span className="w-2.5 h-2.5 border border-borderStrong3 bg-surface21 rounded-sm"/> ASSIGNMENT (A)
 </span>
 <span className="flex items-center gap-1">
 <span
 className="w-2.5 h-2.5 border border-borderStrong3"
 style={{ transform:"rotate(45deg)", background:"var(--text-secondary)"}}
 />{""}
 EXAM (E)
 </span>
 </div>
 </Panel>

 <Panel title="LEGEND · UPCOMING"sub={`next 7 days · ${upcoming.length}`} span={4} ariaLabel="Legend and upcoming">
 <div className="mb-3">
 <div className="text-xs font-semibold text-muted1 mb-1.5">
 COURSE COLORS
 </div>
 <div className="grid grid-cols-2 gap-1.5">
 {courses.length === 0 ? (
 <div className="text-[13px] text-muted1 italic col-span-2">
 no Courses inserted
 </div>
 ) : (
 courses.map((c) => (
 <div
 key={c.id}
 className="flex items-center gap-1.5 bg-surface1 border-2 border-borderStrong3 px-1.5 py-1"
 >
 <span
 className="w-2.5 h-2.5 border border-borderStrong3 flex-shrink-0"
 style={{ background: COURSE_COLOR[c.color] }}
 />
 <span className="font-mono text-[11px] text-muted1 leading-none">
 {c.code}
 </span>
 </div>
 ))
 )}
 </div>
 </div>

 <div className="mb-3">
 <div className="text-xs font-semibold text-muted1 mb-1.5">
 MARKER TYPES
 </div>
 <div className="flex flex-col gap-1">
 <div className="flex items-center gap-2 bg-surface1 border-2 border-borderStrong3 px-1.5 py-1">
 <span className="w-2.5 h-2.5 border border-borderStrong3 bg-surface21 flex-shrink-0"/>
 <span className="text-[14px]">
 <b className="text-xs font-semibold text-muted3">T</b> · Task
 </span>
 <span className="ml-auto font-mono text-[11px] text-muted1">
 {counts.t}
 </span>
 </div>
 <div className="flex items-center gap-2 bg-surface1 border-2 border-borderStrong3 px-1.5 py-1">
 <span className="w-2.5 h-2.5 border border-borderStrong3 bg-surface21 flex-shrink-0"/>
 <span className="text-[14px]">
 <b className="text-xs font-semibold text-muted3">A</b> · Assignment
 </span>
 <span className="ml-auto font-mono text-[11px] text-muted1">
 {counts.a}
 </span>
 </div>
 <div className="flex items-center gap-2 bg-surface1 border-2 border-borderStrong3 px-1.5 py-1">
 <span
 className="w-2.5 h-2.5 border border-borderStrong3 flex-shrink-0"
 style={{ transform:"rotate(45deg)", background:"var(--text-secondary)"}}
 />
 <span className="text-[14px]">
 <b className="text-xs font-semibold text-muted3">E</b> · Exam
 </span>
 <span className="ml-auto font-mono text-[11px] text-muted1">
 {counts.e}
 </span>
 </div>
 </div>
 </div>

 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">
 UPCOMING THIS WEEK
 </div>
 {upcoming.length === 0 ? (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-2 text-[14px] text-muted1 flex gap-2 items-center">
 ▲ Clear runway. No Recent Sessions scheduled this week — power on a new
 quest.
 </div>
 ) : (
 <div className="flex flex-col gap-1">
 {upcoming.map((it) => (
 <UpcomingRow key={it.id} item={it} />
 ))}
 </div>
 )}
 </div>
 </Panel>
 </main>
 );
}

function DayCell({
 date,
 inMonth,
 isToday,
 items,
}: {
 date: Date;
 inMonth: boolean;
 isToday: boolean;
 items: CalItem[];
}) {
 // Cap rendered markers to keep cells readable;"+N"overflow chip.
 const MAX = 5;
 const shown = items.slice(0, MAX);
 const overflow = items.length - shown.length;
 return (
 <div
 className={`relative border-2 ${
 isToday ?"border-accent":"border-borderStrong3"
 } ${inMonth ?"bg-surface1":"bg-surface0"} ${
 isToday ?"shadow-[inset_0_0_0_2px_var(--surface-0),inset_0_0_0_4px_var(--accent)]":""
 } p-1 min-h-[64px] flex flex-col gap-1`}
 aria-label={`${date.toDateString()} · ${items.length} items`}
 >
 <div
 className={`font-mono text-[12px] leading-none ${
 isToday ?"text-accent": inMonth ?"text-muted3":"text-muted"
 }`}
 >
 {date.getDate()}
 </div>
 {shown.length > 0 && (
 <div className="flex flex-wrap gap-[3px] content-start">
 {shown.map((it) => (
 <Marker key={it.id} item={it} />
 ))}
 </div>
 )}
 {overflow > 0 && (
 <div className="font-mono text-[10px] text-muted1 leading-none mt-auto">
 +{overflow} more
 </div>
 )}
 </div>
 );
}

function Marker({ item }: { item: CalItem }) {
 if (item.kind ==="E") {
 // Diamond, larger
 return (
 <span
 title={`${item.kind} · ${item.title}${item.courseCode ?"·"+ item.courseCode :""}`}
 className="inline-block w-3 h-3 border border-borderStrong3 flex-shrink-0"
 style={{ transform:"rotate(45deg)", background: item.color }}
 />
 );
 }
 if (item.kind ==="A") {
 // Square with small radius
 return (
 <span
 title={`${item.kind} · ${item.title}${item.courseCode ?"·"+ item.courseCode :""}`}
 className="inline-block w-2.5 h-2.5 border border-borderStrong3 rounded-sm flex-shrink-0"
 style={{ background: item.color }}
 />
 );
 }
 // T: plain neutral square
 return (
 <span
 title={`T · ${item.title}`}
 className="inline-block w-2.5 h-2.5 border border-borderStrong3 flex-shrink-0"
 style={{ background: item.color }}
 />
 );
}

function UpcomingRow({ item }: { item: CalItem }) {
 const d = new Date(item.at);
 const dayLabel = d.toLocaleDateString(undefined, {
 weekday:"short",
 month:"short",
 day:"numeric",
 });
 const timeLabel = d.toLocaleTimeString(undefined, {
 hour:"numeric",
 minute:"2-digit",
 });
 const kindLabel =
 item.kind ==="E"?"EXAM": item.kind ==="A"?"DUE":"TASK";
 const kindTone:"ember"|"blue"|"default"=
 item.kind ==="E"?"ember": item.kind ==="A"?"blue":"default";
 return (
 <div className="grid items-center gap-1.5 px-1.5 py-1 border-2 border-borderStrong3 bg-surface1"style={{ gridTemplateColumns:"auto 1fr auto"}}>
 <span
 className="w-2.5 h-2.5 border border-borderStrong3 flex-shrink-0"
 style={{
 background: item.color,
 ...(item.kind ==="E"? { transform:"rotate(45deg)"} : {}),
 ...(item.kind ==="A"? { borderRadius:"2px"} : {}),
 }}
 />
 <div className="min-w-0">
 <div className="text-[14px] leading-tight truncate text-muted3">
 {item.title}
 </div>
 <div className="font-mono text-[10px] text-muted1 leading-none">
 {dayLabel} · {timeLabel}
 {item.courseCode ?"·"+ item.courseCode :""}
 </div>
 </div>
 <Ptag tone={kindTone}>{kindLabel}</Ptag>
 </div>
 );
}