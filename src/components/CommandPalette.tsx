import { useEffect, useState } from "react";
import { type ViewKey } from "./Sidebar";

const CMDS: { id: string; group: string; label: string; view?: ViewKey }[] = [
 { id: "go-dash", group: "Navigate", label: "Go to Dashboard", view: "dashboard" },
 { id: "go-courses", group: "Navigate", label: "Go to Courses", view: "courses" },
 { id: "go-focus", group: "Navigate", label: "Start Focus 25m", view: "focus" },
 { id: "go-todos", group: "Navigate", label: "Open Todos", view: "todos" },
 { id: "go-notes", group: "Navigate", label: "New AI Note Session", view: "notes" },
 { id: "go-cards", group: "Navigate", label: "Review Flashcards", view: "flashcards" },
 { id: "add-todo", group: "Action", label: "Add task…" },
 { id: "sync", group: "Action", label: "Sync Canvas now" },
];

export function CommandPalette({
 open,
 onClose,
 setView,
}: {
 open: boolean;
 onClose: () => void;
 setView: (v: ViewKey) => void;
}) {
 const [q, setQ] = useState("");
 useEffect(() => {
 if (!open) setQ("");
 }, [open]);
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") onClose();
 };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [onClose]);
 if (!open) return null;
 const results = CMDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
 return (
 <div className="fixed inset-0 z-[800] flex justify-center pt-[100px] bg-black/20" onClick={onClose}>
 <div
 className="bg-surface0 border border-border w-[520px] max-w-[92vw] rounded-lg shadow-lg"
 onClick={(e) => e.stopPropagation()}
 >
 <input
 autoFocus
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="Search commands…"
 className="w-full bg-transparent border-b border-border px-4 py-3 text-sm outline-none placeholder:text-faint"
 />
 <div className="flex flex-col py-1">
 {results.map((c) => (
 <button
 key={c.id}
 onClick={() => {
 if (c.view) setView(c.view);
 onClose();
 }}
 className="text-left px-4 py-2.5 hover:bg-surface2 text-sm flex justify-between items-center transition-colors"
 >
 <span className="text-primary">{c.label}</span>
 <span className="text-[10px] text-muted uppercase tracking-wide">{c.group}</span>
 </button>
 ))}
 {results.length === 0 && (
 <div className="px-4 py-3 text-sm text-muted">No matching commands.</div>
 )}
 </div>
 </div>
 </div>
 );
}