// StudyBoy — Progress page: Habits + Exam Countdown + Score/Gamification
import { useMemo } from"react";
import { useLiveQuery } from"dexie-react-hooks";
import { db, type Habit, type GameEvent, type CourseColor } from"../db";
import { Panel, PixelButton, Ptag } from"../components/ui";

const dayMs = 86_400_000;

function todayIso(): string {
 return new Date().toISOString().slice(0, 10);
}
function startOfDay(t: number): number {
 const d = new Date(t);
 d.setHours(0, 0, 0, 0);
 return d.getTime();
}

const COURSE_ACCENT: Record<CourseColor, string> = {
 cs:"var(--accent)",
 math:"var(--info)",
 phys:"var(--surface-2)",
 eng:"var(--text-secondary)",
 bio:"var(--accent)",
 hist:"var(--text-muted)",
};

const HABIT_TYPE_LABEL: Record<Habit["type"], string> = {
 manual:"MANUAL",
"focus-min":"FOCUS·MIN",
"srs-count":"SRS·CT",
"todos-done":"TODOS",
};
const HABIT_TYPE_NOTE: Record<Habit["type"], string> = {
 manual:"Manual check-in.",
"focus-min":"Auto-fulfills from Focus session minutes.",
"srs-count":"Auto-fulfills from SRS flashcard reviews.",
"todos-done":"Auto-fulfills from completed todos.",
};

const GAME_TYPE_ICON: Record<GameEvent["type"], string> = {
 focus:"▶",
 todo:"✓",
 srs:"♦",
 streak:"★",
 level:"L",
};

// ── Helpers ──────────────────────────────────────────────────────────
// compute current streak (consecutive days up to today with a checkin)
function computeStreak(dates: Set<string>): number {
 let streak = 0;
 const today = startOfDay(Date.now());
 for (let i = 0; i < 400; i++) {
 const iso = new Date(today - i * dayMs).toISOString().slice(0, 10);
 if (dates.has(iso)) streak++;
 else if (i === 0) continue; // today not yet checked = don't break streak
 else break;
 }
 return streak;
}

// ── HABITS PANEL ─────────────────────────────────────────────────────
function HabitsPanel() {
 const habits = useLiveQuery(() => db.habits.toArray(), []) ?? [];
 const checkins = useLiveQuery(() => db.habitCheckins.toArray(), []) ?? [];

 const byHabit = useMemo(() => {
 const m = new Map<string, Map<string, HabitCheckinVal>>();
 for (const c of checkins) {
 let dm = m.get(c.habitId);
 if (!dm) {
 dm = new Map();
 m.set(c.habitId, dm);
 }
 dm.set(c.date, { value: c.value, auto: c.auto, id: c.id });
 }
 return m;
 }, [checkins]);

 // 14-day strip window
 const stripDays = useMemo(() => {
 const today = startOfDay(Date.now());
 const arr: { iso: string; label: string }[] = [];
 for (let i = 13; i >= 0; i--) {
 const t = today - i * dayMs;
 arr.push({ iso: new Date(t).toISOString().slice(0, 10), label: String(new Date(t).getDate()) });
 }
 return arr;
 }, []);

 async function toggleToday(h: Habit) {
 const iso = todayIso();
 const dm = byHabit.get(h.id);
 const existing = dm?.get(iso);
 if (existing) {
 await db.habitCheckins.delete(existing.id);
 } else {
 await db.habitCheckins.put({
 id: crypto.randomUUID(),
 habitId: h.id,
 date: iso,
 value: h.target,
 auto: false,
 });
 }
 }

 return (
 <Panel title="HABITS"sub={`${habits.length} tracked`} span={6} ariaLabel="Habits">
 <div className="flex flex-col gap-2">
 {habits.length === 0 && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[16px] text-muted1">
 ▲ No habits armed. Power on a habit to start your streak.
 </div>
 )}
 {habits.map((h) => {
 const dm = byHabit.get(h.id) ?? new Map();
 const checkedToday = dm.has(todayIso());
 const dates = new Set(dm.keys());
 const streak = computeStreak(dates);
 const accent = COURSE_ACCENT[h.color];
 const isAuto = h.type !=="manual";
 return (
 <div key={h.id} className="border-2 border-borderStrong3 bg-surface1 p-2.5">
 <div className="flex items-center justify-between gap-2 mb-1.5">
 <div className="flex items-center gap-2 min-w-0">
 <span
 className="w-3 h-3 border border-borderStrong3 flex-shrink-0"
 style={{ background: accent }}
 aria-hidden
 />
 <span className="text-[18px] leading-tight truncate">{h.name}</span>
 </div>
 <PixelButton
 variant={checkedToday ?"blue":"default"}
 armed={checkedToday}
 onClick={() => toggleToday(h)}
 className="flex-shrink-0"
 >
 {checkedToday ?"✓ DONE":"CHECK IN"}
 </PixelButton>
 </div>

 <div className="flex items-center gap-2 flex-wrap mb-2">
 <Ptag tone="ink">{HABIT_TYPE_LABEL[h.type]}</Ptag>
 <span className="font-mono text-[11px] text-muted1">
 TGT {h.target}
 {h.type ==="focus-min"?"m": h.type ==="srs-count"?"cards": h.type ==="todos-done"?"todos":"×"}
 </span>
 <span className="font-mono text-[11px] text-info">{streak}d streak</span>
 <span className="font-mono text-[10px] text-muted uppercase">{h.schedule}</span>
 </div>

 {/* 14-day strip */}
 <div className="flex gap-[3px] items-center mb-1.5">
 {stripDays.map((d) => {
 const hit = dm.has(d.iso);
 return (
 <div
 key={d.iso}
 title={`${d.iso}${hit ?"· checked":"· —"}`}
 className={`w-[14px] h-[18px] border border-borderStrong3/40 ${hit ?"":"bg-surface0"}`}
 style={hit ? { background:"var(--info)"} : undefined}
 />
 );
 })}
 <span className="font-mono text-[10px] text-muted1 ml-1">14d</span>
 </div>

 {isAuto && (
 <div className="font-mono text-[10px] text-muted italic">
 ⚙ {HABIT_TYPE_NOTE[h.type]}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </Panel>
 );
}

type HabitCheckinVal = { value: number; auto: boolean; id: string };

// ── EXAM COUNTDOWN PANEL ─────────────────────────────────────────────
function ExamCountdownPanel() {
 const exams = useLiveQuery(() => db.exams.toArray(), []) ?? [];
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];

 const courseMap = useMemo(() => {
 const m = new Map<string, { code: string; color: CourseColor }>();
 for (const c of courses) m.set(c.id, { code: c.code, color: c.color });
 return m;
 }, [courses]);

 const sorted = useMemo(
 () => [...exams].sort((a, b) => a.date.localeCompare(b.date)),
 [exams],
 );
 const now = Date.now();
 const next = sorted.find((e) => new Date(e.date).getTime() >= now) ?? sorted[0];

 return (
 <Panel title="EXAM COUNTDOWN"sub={`${sorted.length} on the docket`} span={6} ariaLabel="Exam countdown">
 <div className="flex flex-col gap-2">
 {sorted.length === 0 && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-3 text-[16px] text-muted1">
 ▲ No exams scheduled. Save point reached — enjoy the calm.
 </div>
 )}
 {sorted.map((e) => {
 const due = new Date(e.date).getTime();
 const daysUntil = Math.ceil((due - now) / dayMs);
 const isNext = next?.id === e.id;
 const course = courseMap.get(e.courseId);
 const accent = course ? COURSE_ACCENT[course.color] :"var(--text-secondary)";
 const urgent = daysUntil < 7;
 const priority = Math.max(0, Math.round(e.weight * (100 - e.readiness) / 100));
 // readiness bar segments (10 cells)
 const filled = Math.round(e.readiness / 10);
 return (
 <div
 key={e.id}
 className={`border-2 p-2.5 ${isNext ?"border-accent bg-surface1 shadow-[2px_2px_0_var(--surface-2)]":"border-borderStrong3 bg-surface1"}`}
 >
 <div className="flex items-center justify-between gap-2 mb-1">
 <div className="flex items-center gap-2 min-w-0">
 <span
 className="w-3 h-3 border border-borderStrong3 flex-shrink-0"
 style={{ background: accent }}
 aria-hidden
 />
 <span className="text-base leading-tight truncate">{e.title}</span>
 {course && (
 <span className="font-mono text-[11px]"style={{ color: accent }}>
 {course.code}
 </span>
 )}
 </div>
 {isNext && <Ptag tone="blue">NEXT</Ptag>}
 </div>

 <div className="flex items-end justify-between gap-2 mb-2">
 <div>
 <div
 className={`font-mono text-[34px] leading-none ${urgent ?"text-warning":"text-muted3"}`}
 >
 {daysUntil < 0 ?"PAST": daysUntil === 0 ?"0d": `${daysUntil}d`}
 </div>
 <div className="font-mono text-[10px] text-muted1 uppercase">
 {new Date(e.date).toLocaleDateString(undefined, { month:"short", day:"numeric"})}
 </div>
 </div>
 <div className="text-right">
 <div className="font-mono text-[12px] text-muted1">WEIGHT {e.weight}%</div>
 <div className="font-mono text-[11px] text-muted">READY {e.readiness}%</div>
 </div>
 </div>

 {/* readiness pixel bar */}
 <div className="flex gap-[2px] mb-1.5">
 {Array.from({ length: 10 }).map((_, i) => (
 <div
 key={i}
 className={`flex-1 h-2.5 border border-borderStrong3/40 ${i < filled ?"":"bg-surface0"}`}
 style={i < filled ? { background:"var(--info)"} : undefined}
 />
 ))}
 </div>

 <div className="font-mono text-[10px] text-muted1">
 priority ≈ {e.weight} × (100 − {e.readiness}) / 100 = <span className="text-warning">{priority}</span>
 </div>
 </div>
 );
 })}
 </div>
 </Panel>
 );
}

// ── SCORE / GAMIFICATION PANEL ───────────────────────────────────────
function ScorePanel() {
 const events = useLiveQuery(() => db.gameEvents.toArray(), []) ?? [];
 const savePoints = useLiveQuery(() => db.savePoints.toArray(), []) ?? [];
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];

 const courseMap = useMemo(() => {
 const m = new Map<string, { code: string; color: CourseColor }>();
 for (const c of courses) m.set(c.id, { code: c.code, color: c.color });
 return m;
 }, [courses]);

 const totalXp = useMemo(() => events.reduce((s, e) => s + e.xp, 0), [events]);
 const level = Math.floor(totalXp / 500) + 1;
 const levelFloorXp = (level - 1) * 500;
 const levelProgress = ((totalXp - levelFloorXp) / 500) * 100;

 // current streak derived from savePoints: consecutive days with a save point up to today
 const streak = useMemo(() => {
 const days = new Set(savePoints.map((s) => new Date(s.at).toISOString().slice(0, 10)));
 return computeStreak(days);
 }, [savePoints]);

 const recent = useMemo(
 () => [...events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 10),
 [events],
 );

 // Badges (deterministic)
 const badges = useMemo(() => {
 const list: { name: string; icon: string; earned: boolean; hint: string }[] = [
 { name:"First Power-On", icon:"⚡", earned: events.length > 0, hint:"Earn your first XP."},
 { name:"7-Day Streak", icon:"★", earned: streak >= 7, hint:"7-day save-point streak."},
 { name:"1000 XP", icon:"✦", earned: totalXp >= 1000, hint:"Bank 1000 total XP."},
 { name:"Level 5", icon:"L", earned: level >= 5, hint:"Reach level 5."},
 { name:"Exam Slayer", icon:"⚔", earned: false, hint:"Ace an exam (manual)."},
 { name:"Focus 10h", icon:"▶", earned: events.filter((e) => e.type ==="focus").reduce((s, e) => s + e.xp, 0) >= 600, hint:"Bank 600 focus XP."},
 { name:"SRS 500", icon:"♦", earned: events.filter((e) => e.type ==="srs").reduce((s, e) => s + e.xp, 0) >= 500, hint:"Bank 500 SRS XP."},
 { name:"Todo Crusher", icon:"✓", earned: events.filter((e) => e.type ==="todo").reduce((s, e) => s + e.xp, 0) >= 200, hint:"Bank 200 todo XP."},
 ];
 return list;
 }, [events, streak, totalXp, level]);

 const earnedCount = badges.filter((b) => b.earned).length;

 return (
 <Panel
 title="SCORE · GAMIFICATION"
 sub={`${earnedCount}/${badges.length} badges · LV ${level}`}
 span={12}
 ariaLabel="Score and gamification"
 >
 <div className="grid grid-cols-12 gap-2.5">
 {/* Stat block */}
 <div className="col-span-12 md:col-span-4 flex flex-col gap-2">
 <div className="border-2 border-borderStrong3 bg-surface23 text-muted p-3 rounded-sm shadow-[2px_2px_0_#000]">
 <div className="text-xs font-semibold text-muted mb-1">TOTAL XP</div>
 <div className="font-mono text-[40px] leading-none text-surface0">{totalXp.toLocaleString()}</div>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div className="border-2 border-borderStrong3 bg-surface1 p-2">
 <div className="text-[10px] font-semibold uppercase text-muted1 mb-0.5">LEVEL</div>
 <div className="font-mono text-[26px] leading-none text-accent">{level}</div>
 </div>
 <div className="border-2 border-borderStrong3 bg-surface1 p-2">
 <div className="text-[10px] font-semibold uppercase text-muted1 mb-0.5">STREAK</div>
 <div className="font-mono text-[26px] leading-none text-info">{streak}d</div>
 </div>
 </div>
 {/* level progress bar */}
 <div className="border-2 border-borderStrong3 bg-surface1 p-2">
 <div className="flex items-center justify-between font-mono text-[10px] text-muted1 mb-1">
 <span>LV {level}</span>
 <span>{totalXp - levelFloorXp}/500 → LV {level + 1}</span>
 </div>
 <div className="flex gap-[2px]">
 {Array.from({ length: 20 }).map((_, i) => {
 const filled = i < Math.round(levelProgress / 5);
 return (
 <div
 key={i}
 className={`flex-1 h-2 border border-borderStrong3/30 ${filled ?"":"bg-surface0"}`}
 style={filled ? { background:"var(--accent)"} : undefined}
 />
 );
 })}
 </div>
 </div>
 </div>

 {/* Recent XP log */}
 <div className="col-span-12 md:col-span-4 border-2 border-borderStrong3 bg-surface1 p-2.5">
 <div className="text-xs font-semibold text-muted1 mb-2">RECENT XP LOG</div>
 <div className="flex flex-col gap-1">
 {recent.length === 0 && (
 <div className="text-[14px] text-muted1 italic">No events yet — power on to earn XP.</div>
 )}
 {recent.map((e) => {
 const course = e.courseId ? courseMap.get(e.courseId) : undefined;
 const accent = course ? COURSE_ACCENT[course.color] :"var(--text-secondary)";
 return (
 <div
 key={e.id}
 className="flex items-center gap-2 px-2 py-1 border border-borderStrong3/40 bg-surface0"
 >
 <span className="font-mono text-[12px] text-muted1 w-[44px] flex-shrink-0">
 {new Date(e.ts).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit"})}
 </span>
 <span className="text-[14px] w-4 text-center"aria-hidden>
 {GAME_TYPE_ICON[e.type]}
 </span>
 <span className="font-mono text-[12px] text-info w-[44px] flex-shrink-0">+{e.xp}</span>
 <span className="font-mono text-[10px] uppercase text-muted1 flex-1 truncate">{e.type}</span>
 {course && (
 <span className="font-mono text-[10px] flex-shrink-0"style={{ color: accent }}>
 {course.code}
 </span>
 )}
 </div>
 );
 })}
 </div>
 </div>

 {/* Badge grid */}
 <div className="col-span-12 md:col-span-4 border-2 border-borderStrong3 bg-surface1 p-2.5">
 <div className="text-xs font-semibold text-muted1 mb-2">BADGES</div>
 <div className="grid grid-cols-2 gap-2">
 {badges.map((b) => (
 <div
 key={b.name}
 title={b.hint}
 className={`border-2 p-2 flex items-center gap-2 ${b.earned ?"border-accent bg-surface23 shadow-[2px_2px_0_#000]":"border-borderStrong3/50 bg-surface0 opacity-60"}`}
 >
 <div
 className={`w-7 h-7 border-2 border-borderStrong3 grid place-items-center text-sm font-semibold flex-shrink-0 ${b.earned ?"bg-accent text-surface0":"bg-surface1 text-muted1"}`}
 >
 {b.icon}
 </div>
 <div className="min-w-0">
 <div className={`text-[10px] font-semibold uppercase leading-tight ${b.earned ?"text-surface0":"text-muted1"}`}>
 {b.name.toUpperCase()}
 </div>
 <div className={`font-mono text-[9px] ${b.earned ?"text-info":"text-muted"}`}>
 {b.earned ?"EARNED":"LOCKED"}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </Panel>
 );
}

// ── PAGE ─────────────────────────────────────────────────────────────
export function Progress() {
 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <HabitsPanel />
 <ExamCountdownPanel />
 <ScorePanel />
 </main>
 );
}