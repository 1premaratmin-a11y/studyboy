import { useEffect, useRef, useState } from"react";
import { invoke } from"@tauri-apps/api/core";
import { useLiveQuery } from"dexie-react-hooks";
import { db, type BlockProfile, type FocusSession } from"../db";
import { Panel, PixelButton, Ptag, PixelDivider, FocusScreen } from"../components/ui";

// Tauri presence guard — frontend must degrade gracefully in a plain browser
// (vite dev at localhost:5173 without the Tauri shell).
const inTauri = typeof (window as any).__TAURI_INTERNALS__ !=="undefined";

// Blocker status returned by the Rust `blocker_status` command.
type BlockerStatus = { running: boolean; killed: number; blocklist: string[] };

// NOTE on allowlist mode (kill-loop tier):
// The Phase 7 kill-loop blocker only knows how to KILL named processes. A true
// allowlist (block everything except listed apps) requires enumerating all
// running processes each tick and killing the unlisted ones — that is the
// privileged-helper tier, not this tier. So for `mode === 'allowlist'` profiles
// we DO NOT start the blocker here; we surface a note instead. Only
// `mode === 'blocklist'` profiles are enforced by the kill-loop at this tier.
async function startBlocker(profile: BlockProfile | undefined): Promise<void> {
 if (!inTauri) return;
 if (!profile) return;
 if (profile.mode !=="blocklist") return; // allowlist deferred — see note above
 const blocklist = profile.blocklist ?? [];
 if (blocklist.length === 0) return;
 try {
 await invoke("blocker_start", { blocklist });
 } catch (e) {
 // Surface but never crash the timer.
 console.error("blocker_start failed:", String(e));
 }
}

async function stopBlocker(): Promise<void> {
 if (!inTauri) return;
 try {
 await invoke("blocker_stop");
 } catch (e) {
 console.error("blocker_stop failed:", String(e));
 }
}

async function fetchBlockerStatus(): Promise<BlockerStatus | null> {
 if (!inTauri) return null;
 try {
 return await invoke<BlockerStatus>("blocker_status");
 } catch (e) {
 console.error("blocker_status failed:", String(e));
 return null;
 }
}

/// Fetch the list of currently-running process names (lowercased, with `.exe`)
/// from the Rust backend, for the blocklist autocomplete. Returns [] in a plain
/// browser (no Tauri shell) so the UI degrades to free-text entry.
async function listProcesses(): Promise<string[]> {
 if (!inTauri) return [];
 try {
 return await invoke<string[]>("blocker_list_processes");
 } catch (e) {
 console.error("blocker_list_processes failed:", String(e));
 return [];
 }
}

type Phase ="work"|"break"|"longBreak";

const PHASE_LABEL: Record<Phase, string> = {
 work:"WORK",
 break:"BREAK",
 longBreak:"LONG BREAK",
};

function fmt(sec: number): string {
 const m = Math.max(0, Math.floor(sec / 60));
 const s = Math.max(0, sec % 60);
 return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function courseAccent(color?: string): string {
 switch (color) {
 case"cs": return"var(--accent)";
 case"math": return"var(--info)";
 case"phys": return"var(--surface-2)";
 case"eng": return"var(--text-secondary)";
 case"bio": return"var(--accent)";
 case"hist": return"var(--text-muted)";
 default: return"var(--text-secondary)";
 }
}

export function Focus() {
 const profiles = useLiveQuery(() => db.blockProfiles.toArray(), []) ?? [];
 const sessions = useLiveQuery(
 () => db.focusSessions.orderBy("startedAt").reverse().limit(8).toArray(),
 [],
 ) ?? [];
 const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];

 const active = profiles.find((p) => p.active) ?? profiles[0];

 const Pomodoro = active?.pomodoro ?? { work: 25, break: 5, longBreak: 15, cycles: 4 };

 // Timer state
 const [phase, setPhase] = useState<Phase>("work");
 const [cycleIndex, setCycleIndex] = useState(0); // 0..Pomodoro.cycles-1
 const [PomodorosDone, setPomodorosDone] = useState(0);
 const [running, setRunning] = useState(false);
 const [remaining, setRemaining] = useState(Pomodoro.work * 60);
 const phaseStartedAtRef = useRef<number>(Date.now());
 const tickRef = useRef<number | null>(null);

 // Live blocker status (poll from Rust every ~3s).
 const [blockerStatus, setBlockerStatus] = useState<BlockerStatus | null>(null);

 // Standalone blocker arm — decoupled from the pomodoro timer. When true the
 // kill-loop runs for the active blocklist profile regardless of timer phase,
 // so blocking works without starting a work session. The timer's work-phase
 // auto-arm still applies on top of this.
 const [armed, setArmed] = useState(false);

 // When the active profile changes (or first load), reset timer to the work phase.
 useEffect(() => {
 setPhase("work");
 setCycleIndex(0);
 setPomodorosDone(0);
 setRunning(false);
 setRemaining(Pomodoro.work * 60);
 phaseStartedAtRef.current = Date.now();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [active?.id]);

 // Recompute remaining target when phase length changes via profile switch handled above.
 // Tick loop.
 useEffect(() => {
 if (!running) {
 if (tickRef.current) {
 clearInterval(tickRef.current);
 tickRef.current = null;
 }
 return;
 }
 tickRef.current = window.setInterval(() => {
 setRemaining((r) => {
 if (r > 1) return r - 1;
 // phase complete
 return 0;
 });
 }, 1000);
 return () => {
 if (tickRef.current) {
 clearInterval(tickRef.current);
 tickRef.current = null;
 }
 };
 }, [running]);

 // Handle phase completion when remaining hits 0 while running.
 useEffect(() => {
 if (!running || remaining !== 0) return;
 void completePhase();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [remaining, running]);

 // Blocker lifecycle — armed when the user toggled ARM BLOCKER OR a work
 // phase is running. Covers: manual arm/disarm, work-phase start, resume from
 // pause, pause, reset, work-phase completion, break/longBreak, session end.
 useEffect(() => {
 const shouldArm = armed || (running && phase ==="work");
 if (shouldArm) {
 // (re)arm with the active profile's blocklist; idempotent on the Rust side.
 void startBlocker(active);
 } else {
 void stopBlocker();
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [armed, running, phase, active?.id]);

 // Ensure the kill-loop is always stopped when Focus unmounts (e.g. nav away).
 useEffect(() => {
 return () => {
 void stopBlocker();
 };
 }, []);

 // Poll blocker_status every ~3s for the live status panel.
 useEffect(() => {
 let cancelled = false;
 async function poll() {
 const s = await fetchBlockerStatus();
 if (!cancelled) setBlockerStatus(s);
 }
 void poll();
 const id = window.setInterval(() => void poll(), 3000);
 return () => {
 cancelled = true;
 clearInterval(id);
 };
 }, []);

 async function completePhase() {
 if (phase ==="work") {
 const elapsedMin = Math.round((Date.now() - phaseStartedAtRef.current) / 60000) || Pomodoro.work;
 const newPomodoros = PomodorosDone + 1;
 setPomodorosDone(newPomodoros);
 // log focus session
 const session: FocusSession = {
 id: crypto.randomUUID(),
 profileId: active?.id,
 startedAt: new Date(Date.now() - elapsedMin * 60000).toISOString(),
 endedAt: new Date().toISOString(),
 plannedFocusMinutes: Pomodoro.work,
 actualFocusMinutes: elapsedMin,
 pomodoroCount: newPomodoros,
 interruptions: [],
 blockingTier:"KillLoop",
 };
 await db.focusSessions.put(session);
 // transition to break
 const isLong = cycleIndex + 1 >= Pomodoro.cycles;
 const nextPhase: Phase = isLong ?"longBreak":"break";
 setPhase(nextPhase);
 setRemaining((isLong ? Pomodoro.longBreak : Pomodoro.break) * 60);
 phaseStartedAtRef.current = Date.now();
 // keep running? Pause to let user start break when ready.
 setRunning(false);
 } else {
 // finished a break — start next work cycle
 if (phase ==="longBreak") {
 setCycleIndex(0);
 setPomodorosDone(0);
 } else {
 setCycleIndex((i) => Math.min(i + 1, Pomodoro.cycles - 1));
 }
 setPhase("work");
 setRemaining(Pomodoro.work * 60);
 phaseStartedAtRef.current = Date.now();
 setRunning(false);
 }
 }

 function handleStart() {
 if (remaining === 0) return;
 if (!running) {
 phaseStartedAtRef.current = Date.now() - (phaseLen(phase) * 60 - remaining) * 1000;
 setRunning(true);
 }
 }
 function handlePause() {
 setRunning(false);
 }
 function handleReset() {
 setRunning(false);
 setPhase("work");
 setCycleIndex(0);
 setPomodorosDone(0);
 setRemaining(Pomodoro.work * 60);
 phaseStartedAtRef.current = Date.now();
 }

 function phaseLen(p: Phase): number {
 return p ==="work"? Pomodoro.work : p ==="break"? Pomodoro.break : Pomodoro.longBreak;
 }

 function skipPhase() {
 setRemaining(0);
 if (!running) {
 // force completion path
 void completePhase();
 }
 }

 const pipsOn = phase ==="work"? Math.min(PomodorosDone, Pomodoro.cycles) : PomodorosDone;
 const pipsCur = phase ==="work"? Math.min(cycleIndex, Pomodoro.cycles - 1) : -1;
 const time = fmt(remaining);
 const label =
 phase ==="work"
 ? `Focus mode engaged. Cycle ${cycleIndex + 1}/${Pomodoro.cycles} · ${Pomodoro.work}m work`
 : phase ==="break"
 ? `Short break — breathe. ${Pomodoro.break}m.`
 : `Long break — you earned it. ${Pomodoro.longBreak}m.`;
 const mini = `cycle ${cycleIndex + 1}/${Pomodoro.cycles} · Pomodoro ${PomodorosDone + (phase ==="work"? 0 : 0)}`;

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 {/* LEFT — pomodoro console */}
 <Panel title="FOCUS · pomodoro"sub={active ? `${active.name} · ${Pomodoro.work}/${Pomodoro.break}/${Pomodoro.longBreak} · ${Pomodoro.cycles}x` :"no profile"} span={5} ariaLabel="Focus console">
 <div className="flex flex-col gap-2.5 h-full">
 <FocusScreen
 time={time}
 session={PHASE_LABEL[phase]}
 pipsOn={pipsOn}
 pipsCur={pipsCur}
 label={label}
 armed={running}
 onStart={handleStart}
 onPause={handlePause}
 mini={mini}
 />
 <div className="flex gap-2 items-center justify-between flex-wrap">
 <div className="flex gap-1.5">
 <PixelButton variant="default"onClick={handleReset} title="Reset timer">
 RESET
 </PixelButton>
 <PixelButton variant="blue"onClick={skipPhase} title="Skip to next phase">
 SKIP ▶▶
 </PixelButton>
 </div>
 <div className="font-mono text-[12px] text-muted1">
 <span className="text-muted3">{PomodorosDone}</span> Pomodoros ·{""}
 <span className="text-info">{Math.round(PomodorosDone * Pomodoro.work)}m</span> banked
 </div>
 </div>
 <div className="border-2 border-borderStrong3 bg-surface1 p-2.5 text-[15px] text-muted1 leading-tight">
 <span className="text-xs font-semibold text-muted3 block mb-1">STATUS</span>
 {running
 ? phase ==="work"
 ?"Focus mode engaged. Distractions blocked — ."
 :"Recharging. Save point reached — hydrate, stretch, breathe."
 : remaining === phaseLen(phase) * 60
 ?"Course loaded. Arm a session to power on."
 :"Paused. Hold the line — resume when ready."}
 </div>
 </div>
 </Panel>

 {/* RIGHT — blocker + editor + log */}
 <div className="flex flex-col gap-2.5"style={{ gridColumn:"span 7 / span 7"}}>
 {/* (a) Blocker status */}
 <Panel title="BLOCKER · STATUS"sub="kill-loop tier"span={7} ariaLabel="Blocker status">
 <div className="flex items-center gap-2 flex-wrap mb-2.5">
 {blockerStatus?.running ? (
 <span
 className="text-xs font-semibold px-2.5 py-1.5 border-2 border-borderStrong3 bg-warning text-muted3 shadow-[2px_2px_0_#000] rounded-sm animate-pulse"
 title="Kill-loop is blocking listed apps"
 >
 BLOCKING
 </span>
 ) : (
 <span
 className="text-xs font-semibold px-2.5 py-1.5 border-2 border-borderStrong3 bg-surface1 text-muted1 shadow-[2px_2px_0_#000] rounded-sm"
 title="Kill-loop idle"
 >
 IDLE
 </span>
 )}
 <span className="font-mono text-[11px] text-muted1">
 killed{""}
 <span className="text-warning">
 {blockerStatus?.killed ?? 0}
 </span>{""}
 apps
 </span>
 <span className="font-mono text-[11px] text-muted1">
 · blocklist{""}
 <span className="text-muted3">
 {blockerStatus?.blocklist?.length ?? active?.blocklist.length ?? 0}
 </span>
 </span>
 {active?.mode ==="blocklist"&& (
 <PixelButton
 variant={armed ?"orange":"blue"}
 armed={armed}
 onClick={() => setArmed((a) => !a)}
 title={
 armed
 ?"Disarm kill-loop blocker (stop killing listed apps)"
 :"Arm kill-loop blocker now — kills listed apps independent of the timer"
 }
 >
 {armed ?"DISARM":"ARM BLOCKER"}
 </PixelButton>
 )}
 </div>
 <div className="border-2 border-borderStrong3 bg-surface1 p-2 text-[12px] text-muted1 leading-tight mb-2.5">
 <span className="text-xs font-semibold text-muted3 block mb-1">TIER · KILL-LOOP</span>
 kill-loop tier IS active now — listed apps are killed each tick. Full
 real-blocking (privileged helper) is Phase 7.
 </div>
 {active?.mode ==="allowlist"&& (
 <div className="border-2 border-dashed border-info bg-surface1 p-2 text-[12px] text-info leading-tight mb-2.5">
 <span className="text-xs font-semibold text-muted3 block mb-1">ALLOWLIST MODE</span>
 allowlist enforcement deferred — kill-loop tier blocks named apps only.
 Switch to BLOCKLIST to enforce blocking now.
 </div>
 )}
 <div className="flex items-center gap-2 mb-2 flex-wrap">
 <span className="text-xs font-semibold text-muted3">ACTIVE PROFILE:</span>
 <Ptag tone="ink">{active ? active.name :"—"}</Ptag>
 <Ptag tone={active?.mode ==="allowlist"?"cyan":"ember"}>
 {active ? active.mode.toUpperCase() :"—"}
 </Ptag>
 </div>
 <div className="grid grid-cols-2 gap-2.5">
 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">BLOCKLIST</div>
 <div className="flex flex-wrap gap-1.5 min-h-[28px]">
 {active && active.blocklist.length ? (
 active.blocklist.map((app) => (
 <Ptag key={app} tone="ember">
 {app}
 </Ptag>
 ))
 ) : (
 <span className="text-[13px] text-muted1 italic">empty</span>
 )}
 </div>
 </div>
 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">ALLOWLIST</div>
 <div className="flex flex-wrap gap-1.5 min-h-[28px]">
 {active && active.allowlist.length ? (
 active.allowlist.map((app) => (
 <Ptag key={app} tone="cyan">
 {app}
 </Ptag>
 ))
 ) : (
 <span className="text-[13px] text-muted1 italic">empty</span>
 )}
 </div>
 </div>
 </div>

 <PixelDivider />
 <div className="text-xs font-semibold text-muted3 mb-1.5">SELECT PROFILE</div>
 <div className="flex flex-wrap gap-1.5">
 {profiles.map((p) => (
 <PixelButton
 key={p.id}
 variant={p.active ?"blue":"default"}
 armed={p.active}
 onClick={() => void setActiveProfile(p.id)}
 title={`${p.name} · ${p.mode}`}
 >
 {p.name.toUpperCase()}
 </PixelButton>
 ))}
 {profiles.length === 0 && (
 <span className="text-[13px] text-muted1 italic">no profiles — create one below</span>
 )}
 </div>
 </Panel>

 {/* (b) Profile editor */}
 <Panel title="PROFILE · EDITOR"sub={active ? active.name :"—"} span={7} ariaLabel="Block profile editor">
 {active ? <ProfileEditor key={active.id} profile={active} /> : (
 <div className="text-[15px] text-muted1 italic">No block profile available.</div>
 )}
 </Panel>

 {/* (c) Session log */}
 <Panel title="SESSION · LOG"sub={`${sessions.length} recent`} span={7} ariaLabel="Focus session log">
 <div className="flex flex-col gap-1">
 {sessions.length === 0 && (
 <div className="border-2 border-dashed border-borderStrong1 bg-surface1 p-2.5 text-[15px] text-muted1 flex gap-2 items-center">
 ▲ No Recent Sessions yet. Arm a pomodoro and bank your first session.
 </div>
 )}
 {sessions.map((s) => (
 <SessionRow key={s.id} s={s} courses={courses} />
 ))}
 </div>
 </Panel>
 </div>
 </main>
 );
}

async function setActiveProfile(id: string) {
 const all = await db.blockProfiles.toArray();
 await db.transaction("rw", db.blockProfiles, async () => {
 for (const p of all) {
 await db.blockProfiles.update(p.id, { active: p.id === id });
 }
 });
}

function SessionRow({ s, courses }: { s: FocusSession; courses: { id: string; code: string; name: string; color: string }[] }) {
 const course = courses.find((c) => c.id === s.courseId);
 const when = new Date(s.startedAt);
 const whenLabel = when.toLocaleDateString(undefined, { month:"short", day:"numeric"}) +
""+ when.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit"});
 const accent = courseAccent(course?.color);
 return (
 <div
 className="grid items-center gap-2 px-2.5 py-1.5 border-2 border-borderStrong3 bg-surface1"
 style={{ gridTemplateColumns:"auto 1fr auto auto auto"}}
 >
 <span
 className="w-2.5 h-2.5 border border-borderStrong3"
 style={{ background: accent }}
 title={course ? `${course.code} · ${course.name}` :"no course"}
 />
 <span className="font-mono text-[12px] text-muted1 min-w-0 truncate">{whenLabel}</span>
 <span className="font-mono text-[12px] text-info">{s.actualFocusMinutes}m</span>
 <span className="font-mono text-[11px] text-muted1">x{s.pomodoroCount}</span>
 <Ptag tone={s.blockingTier ==="KillLoop"?"cyan":"default"}>
 {s.blockingTier ==="KillLoop"?"KILL": s.blockingTier ==="PrivilegedHelper"?"PRIV":"NONE"}
 </Ptag>
 </div>
 );
}

function ProfileEditor({ profile }: { profile: BlockProfile }) {
 const [appInput, setAppInput] = useState("");
 const [editPomodoro, setEditPomodoro] = useState(profile.pomodoro);
 // Running-process autocomplete: fetched from the Rust backend on focus.
 const [procNames, setProcNames] = useState<string[]>([]);
 const [showSug, setShowSug] = useState(false);

 const targetList = profile.mode ==="allowlist"? profile.allowlist : profile.blocklist;
 const otherList = profile.mode ==="allowlist"? profile.blocklist : profile.allowlist;

 async function persist(patch: Partial<BlockProfile>) {
 await db.blockProfiles.update(profile.id, patch);
 }
 async function persistPomodoro(p: BlockProfile["pomodoro"]) {
 await db.blockProfiles.update(profile.id, { pomodoro: p });
 }

 async function refreshProcs() {
 const list = await listProcesses();
 setProcNames(list);
 }

 async function addAppRaw(value: string) {
 const v = value.trim().toLowerCase();
 if (!v) return;
 if (targetList.includes(v)) {
 setAppInput("");
 setShowSug(false);
 return;
 }
 const list = [...targetList, v];
 const patch = profile.mode ==="allowlist"? { allowlist: list } : { blocklist: list };
 await persist(patch);
 setAppInput("");
 setShowSug(false);
 }
 async function addApp() {
 await addAppRaw(appInput);
 }

 // Autocomplete candidates: running processes matching the typed query,
 // excluding apps already in the target list. Capped for the dropdown.
 const q = appInput.trim().toLowerCase();
 const filtered = procNames
 .filter((n) => !q || n.includes(q))
 .filter((n) => !targetList.includes(n))
 .slice(0, 12);
 async function removeApp(app: string) {
 const list = targetList.filter((a) => a !== app);
 const patch = profile.mode ==="allowlist"? { allowlist: list } : { blocklist: list };
 await persist(patch);
 }
 async function toggleMode() {
 const nextMode = profile.mode ==="allowlist"?"blocklist":"allowlist";
 await persist({ mode: nextMode });
 }
 async function commitPomodoro(field: keyof BlockProfile["pomodoro"], val: number) {
 const next = { ...editPomodoro, [field]: Math.max(1, Math.min(120, val)) };
 setEditPomodoro(next);
 await persistPomodoro(next);
 }

 return (
 <div className="flex flex-col gap-2.5">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-xs font-semibold text-muted3">MODE:</span>
 <PixelButton variant={profile.mode ==="blocklist"?"orange":"default"} armed={profile.mode ==="blocklist"} onClick={toggleMode} title="Toggle block/allow mode">
 {profile.mode ==="blocklist"?"BLOCKLIST":"ALLOWLIST"}
 </PixelButton>
 <span className="text-[13px] text-muted1">
 {profile.mode ==="blocklist"
 ?"block listed apps, allow everything else"
 :"allow listed apps, block everything else"}
 </span>
 </div>

 <div className="flex gap-1.5 items-start flex-wrap">
 <div className="relative flex-1 min-w-[240px]">
 <input
 value={appInput}
 onChange={(e) => {
 setAppInput(e.target.value);
 setShowSug(true);
 }}
 onFocus={() => {
 setShowSug(true);
 void refreshProcs();
 }}
 onBlur={() => {
 // delay so a suggestion click (mousedown) registers before blur hides it
 window.setTimeout(() => setShowSug(false), 150);
 }}
 onKeyDown={(e) => {
 if (e.key ==="Enter") {
 e.preventDefault();
 void addApp();
 } else if (e.key ==="Escape") {
 setShowSug(false);
 }
 }}
 placeholder={profile.mode ==="blocklist"?"search / add app to block (e.g. steam)":"search / add app to allow (e.g. code)"}
 className="w-full bg-surface0 border-[3px] border-borderStrong3 shadow-sm px-2.5 py-1.5 text-base outline-none focus:ring-2 focus:ring-accent"
 />
 {showSug && filtered.length > 0 && (
 <div className="absolute z-30 left-0 top-full mt-1 w-full max-w-[340px] max-h-[210px] overflow-auto scroll-pretty bg-surface0 border-2 border-borderStrong3 shadow-sm">
 {filtered.map((n) => (
 <button
 key={n}
 type="button"
 onMouseDown={(e) => {
 e.preventDefault();
 void addAppRaw(n);
 }}
 className="block w-full text-left px-2.5 py-1 text-sm text-muted3 hover:bg-accent hover:text-surface0 border-b border-borderStrong2 last:border-b-0"
 title={`Add ${n}`}
 >
 {n}
 </button>
 ))}
 </div>
 )}
 </div>
 <PixelButton variant="blue"onClick={addApp}>
 + ADD
 </PixelButton>
 </div>
 <div className="font-mono text-[11px] text-muted1 -mt-1">
 {inTauri
 ?"type to search running apps · click a suggestion or enter to add"
 :"type an exe name (e.g. steam.exe) · app list available in the desktop app"}
 </div>

 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">
 {profile.mode ==="blocklist"?"BLOCKED APPS":"ALLOWED APPS"} · {targetList.length}
 </div>
 <div className="flex flex-wrap gap-1.5 min-h-[28px]">
 {targetList.length ? (
 targetList.map((app) => (
 <span
 key={app}
 className={`ptag ${profile.mode ==="blocklist"?"ember":"cyan"} flex items-center gap-1.5`}
 >
 {app}
 <button
 onClick={() => removeApp(app)}
 className="font-mono text-[11px] text-warning hover:text-muted3"
 title={`Remove ${app}`}
 >
 [x]
 </button>
 </span>
 ))
 ) : (
 <span className="text-[13px] text-muted1 italic">empty</span>
 )}
 </div>
 </div>

 {profile.mode ==="blocklist"&& otherList.length > 0 && (
 <div>
 <div className="text-xs font-semibold text-muted1 mb-1.5">ALLOWLIST (advisory) · {otherList.length}</div>
 <div className="flex flex-wrap gap-1.5">
 {otherList.map((app) => (
 <Ptag key={app} tone="cyan">
 {app}
 </Ptag>
 ))}
 </div>
 </div>
 )}

 <PixelDivider />
 <div className="text-xs font-semibold text-muted3 mb-1">pomodoro TIMING (min)</div>
 <div className="grid grid-cols-4 gap-2">
 {([
 { key:"work", label:"WORK"},
 { key:"break", label:"BREAK"},
 { key:"longBreak", label:"LONG"},
 { key:"cycles", label:"CYCLES"},
 ] as const).map((f) => (
 <label key={f.key} className="flex flex-col gap-1">
 <span className="text-[10px] font-semibold text-muted1">{f.label}</span>
 <input
 type="number"
 min={1}
 max={120}
 value={editPomodoro[f.key]}
 onChange={(e) => commitPomodoro(f.key, Number(e.target.value))}
 className="bg-surface0 border-2 border-borderStrong3 px-2 py-1.5 font-mono text-[14px] text-muted3 text-center outline-none focus:ring-2 focus:ring-accent"
 />
 </label>
 ))}
 </div>
 </div>
 );
}

