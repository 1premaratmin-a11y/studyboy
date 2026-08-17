import { GameBoyMark } from "./GameBoyMark";
import type { AutoRunStatus } from "../lib/ollamaAutoRun";
function OllamaBadge({ status }: { status: AutoRunStatus }) {
  if (status.kind === "idle") return null;
  const cls = status.kind === "online" ? "online" : status.kind === "warming" ? "warming" : status.kind === "checking" ? "checking" : status.kind === "offline" ? "offline" : "unavailable";
  const label = status.kind === "online" ? status.model : status.kind === "warming" ? `loading ${status.model}` : status.kind === "checking" ? "checking" : status.kind === "offline" ? "offline" : "desktop-only";
  return <div className={`ollama-badge ${cls}`} title={status.kind === "online" || status.kind === "offline" ? status.message : label}><span className="dot" /><span>{label}</span></div>;
}
export function TopBar({ onPalette, ollamaStatus, onToggleSidebar }: { onPalette: () => void; ollamaStatus?: AutoRunStatus; onToggleSidebar: () => void; }) {
  return (
    <div className="chat-topbar">
      <div className="chat-topbar-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>
        <GameBoyMark size={18} />
        <span className="chat-topbar-title">StudyBoy</span>
      </div>
      <div className="chat-topbar-right">
        {ollamaStatus && <OllamaBadge status={ollamaStatus} />}
        <button onClick={onPalette} className="btn btn-ghost btn-sm" title="Search (Ctrl+K)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        </button>
      </div>
    </div>
  );
}