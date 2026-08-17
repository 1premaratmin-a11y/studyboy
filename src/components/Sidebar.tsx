import { type ReactNode } from "react";

export type ViewKey =
 | "dashboard" | "courses" | "focus" | "todos" | "notes"
 | "notebook" | "flashcards" | "calendar" | "progress" | "settings";

const NAV: { key: ViewKey; label: string; icon: ReactNode; badge?: string }[] = [
 { key: "notes", label: "Study Chat", icon: <IconChat /> },
 { key: "notebook", label: "Notebook", icon: <IconNotebook /> },
 { key: "flashcards", label: "Flashcards", icon: <IconCards />, badge: "12" },
 { key: "todos", label: "Todos", icon: <IconTodos />, badge: "5" },
 { key: "focus", label: "Focus", icon: <IconFocus /> },
 { key: "calendar", label: "Calendar", icon: <IconCalendar /> },
 { key: "courses", label: "Courses", icon: <IconCourses /> },
 { key: "progress", label: "Progress", icon: <IconProgress /> },
 { key: "dashboard", label: "Dashboard", icon: <IconDashboard /> },
];

export function Sidebar({
 view, setView, onNewChat,
}: {
 view: ViewKey; setView: (v: ViewKey) => void; onNewChat: () => void;
}) {
 return (
 <nav className="studyboy-sidebar scroll-pretty">
 <button className="sidebar-new-chat" onClick={onNewChat} title="New study chat">
 <IconPlus />
 <span>New Chat</span>
 </button>
 <div className="sidebar-heading">Study</div>
 {NAV.map((n) => {
 const active = view === n.key;
 return (
 <button key={n.key} onClick={() => setView(n.key)} aria-current={active ? "page" : undefined}
 className={`sidebar-item ${active ? "active" : ""}`} title={n.label}>
 {n.icon}
 <span>{n.label}</span>
 {n.badge && <span className="sidebar-badge">{n.badge}</span>}
 </button>
 );
 })}
 <div className="sidebar-spacer" />
 <button onClick={() => setView("settings")} aria-current={view === "settings" ? "page" : undefined}
 className={`sidebar-item ${view === "settings" ? "active" : ""}`} title="Settings">
 <IconSettings />
 <span>Settings</span>
 </button>
 </nav>
 );
}

function Svg({ children }: { children: ReactNode }) {
 return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
function IconPlus() { return <Svg><path d="M12 5v14M5 12h14" /></Svg>; }
function IconChat() { return <Svg><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Svg>; }
function IconDashboard() { return <Svg><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>; }
function IconCourses() { return <Svg><path d="M4 6h16M4 12h16M4 18h10" /></Svg>; }
function IconFocus() { return <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Svg>; }
function IconTodos() { return <Svg><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></Svg>; }
function IconNotebook() { return <Svg><path d="M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M9 3v18" /></Svg>; }
function IconCards() { return <Svg><rect x="3" y="6" width="14" height="14" rx="2" /><rect x="7" y="2" width="14" height="14" rx="2" /></Svg>; }
function IconCalendar() { return <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></Svg>; }
function IconProgress() { return <Svg><path d="M4 20V10M10 20V4M16 20v-6M22 20H2" /></Svg>; }
function IconSettings() { return <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></Svg>; }