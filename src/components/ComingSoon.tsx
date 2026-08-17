import { type ViewKey } from "./Sidebar";

const LABELS: Record<ViewKey, { title: string; sub: string }> = {
 dashboard: { title: "Dashboard", sub: "" },
 courses: { title: "Courses", sub: "LMS integration (Canvas)" },
 focus: { title: "Focus", sub: "Pomodorodoro + app blocker" },
 todos: { title: "Todos", sub: "Task management" },
 notes: { title: "AI Notes", sub: "AI-powered note maker" },
 notebook: { title: "Notebook", sub: "Rich note pages" },
 flashcards: { title: "Flashcards", sub: "Spaced repetition" },
 calendar: { title: "Calendar", sub: "Unified agenda" },
 progress: { title: "Progress", sub: "Habits + exams + stats" },
 settings: { title: "Settings", sub: "Configuration" },
};

export function ComingSoon({ view }: { view: ViewKey }) {
 const l = LABELS[view];
 return (
 <main className="min-h-0 overflow-auto grid place-items-center">
 <div className="card p-8 flex flex-col items-center gap-3 text-center">
 <div className="text-xl font-semibold text-primary">{l.title}</div>
 <div className="text-sm text-muted max-w-xs">{l.sub}</div>
 <div className="text-sm text-muted mt-1">Coming soon</div>
 </div>
 </main>
 );
}