import { type CSSProperties, type ReactNode } from "react";

export function Panel({ title, sub, span, children, className = "", ariaLabel }: {
  title?: string; sub?: string; span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; children: ReactNode; className?: string; ariaLabel?: string;
}) {
  const col = span ?? 12;
  return (
    <section className={`card scroll-pretty ${className}`} aria-label={ariaLabel} style={{ gridColumn: `span ${col} / span ${col}` }}>
      {(title || sub) && <div className="card-header">{title && <div className="card-title">{title}</div>}{sub && <div className="card-sub">{sub}</div>}</div>}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function PixelButton({ children, onClick, variant = "default", armed, className = "", title, role, ariaSelected, id, ariaControls, onKeyDown, tabIndex }: {
  children: ReactNode; onClick?: () => void; variant?: "default" | "blue" | "orange"; armed?: boolean; className?: string; title?: string; role?: string; ariaSelected?: boolean; id?: string; ariaControls?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void; tabIndex?: number;
}) {
  const cls = armed || variant === "blue" ? "btn btn-primary" : variant === "orange" ? "btn btn-danger" : "btn";
  return <button onClick={onClick} title={title} role={role} id={id} aria-selected={ariaSelected} aria-controls={ariaControls} onKeyDown={onKeyDown} tabIndex={tabIndex} className={`btn-sm ${cls} ${className}`}>{children}</button>;
}

export function Ptag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ink" | "blue" | "cyan" | "ember"; }) {
  const cls = tone === "blue" || tone === "cyan" ? "tag tag-accent" : tone === "ember" ? "tag tag-danger" : "tag";
  return <span className={cls}>{children}</span>;
}

export function PixelDivider() { return <hr className="pixel-divider" />; }

export function HudCell({ icon, value, title }: { icon: ReactNode; value: ReactNode; title: string; }) {
  return <div title={title} className="flex items-center gap-1.5 bg-surface2 border border-border px-2 py-0.5 rounded text-xs text-primary"><span className="text-accent">{icon}</span><span className="font-medium tnum">{value}</span></div>;
}

export function Donut({ pct, size = 56, color = "var(--accent)", track = "var(--surface-3)" }: { pct: number; size?: number; color?: string; track?: string; }) {
  const r = 28; const c = 2 * Math.PI * r; const dash = (pct / 100) * c;
  return <svg width={size} height={size} viewBox="0 0 64 64"><circle cx="32" cy="32" r={r} fill="none" stroke={track} strokeWidth="5" /><circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform="rotate(-90 32 32)" /></svg>;
}

export function MasteryRamp({ level }: { level: 0 | 1 | 2 | 3; }) {
  return <div className="flex gap-1">{[0,1,2,3].map((i) => <div key={i} className={`flex-1 h-1 rounded-full ${i <= level ? "bg-accent" : "bg-surface3"}`} />)}</div>;
}

export function Heatmap({ cells, cols = 26, rows = 7 }: { cells: { date: number; minutes: number }[]; cols?: number; rows?: number; }) {
  const cls = (m: number) => m === 0 ? "bg-surface3" : m < 45 ? "bg-accentLight" : m < 90 ? "bg-accent" : m < 150 ? "bg-accentHover" : "bg-warning";
  const total = cells.reduce((s, c) => s + c.minutes, 0);
  return <div role="img" aria-label={`${cols}-week study heatmap, ${Math.round(total/60)} total hours`} className="grid gap-[2px]" style={{ gridTemplateRows: `repeat(${rows}, 12px)`, gridAutoColumns: "12px", gridAutoFlow: "column" }}>
    {cells.slice(-cols * rows).map((c, i) => <div key={i} title={`${new Date(c.date).toLocaleDateString()} · ${c.minutes}m`} className={`w-[12px] h-[12px] rounded-sm ${cls(c.minutes)}`} />)}
  </div>;
}

export function FocusScreen({ time, session, pipsOn, pipsCur, label, armed, onStart, onPause, mini }: {
  time: string; session: string; pipsOn: number; pipsCur: number; label: string; armed: boolean; onStart: () => void; onPause: () => void; mini: string;
}) {
  return <div className="card p-4 h-full flex flex-col">
    <div className="flex items-center justify-between text-xs text-muted mb-2"><span>{session}</span><span>Pomodoro</span></div>
    <div className="font-mono text-4xl text-primary text-center my-2 tracking-wide tnum">{time}</div>
    <div className="flex gap-1.5 justify-center my-2">{[0,1,2,3].map((i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < pipsOn ? "bg-accent" : i === pipsCur ? "bg-warning" : "bg-surface3"}`} />)}</div>
    <div className="flex gap-2 justify-center mt-2"><PixelButton armed={armed} onClick={onStart}>Start</PixelButton><PixelButton onClick={onPause}>Pause</PixelButton></div>
    <div className="text-center text-sm text-muted mt-2">{label}</div>
    <div className="flex justify-between text-xs text-muted mt-2"><span>{mini}</span><span>Distractions blocked</span></div>
  </div>;
}

export function Toast({ title, body, onClose, style }: { title: string; body: string; onClose: () => void; style?: CSSProperties; }) {
  return <div role="status" aria-live="polite" className="fixed top-16 right-4 z-[500] max-w-xs rounded-lg flex gap-2 items-start p-3"
    style={{ background: "#1a1612", border: "1px solid rgba(245,158,11,0.16)", ...style }}>
    <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ color: "#100d0a" }}>!</div>
    <div className="text-sm leading-snug"><b className="text-accent block text-xs font-semibold mb-0.5">{title}</b><span style={{ color: "#c4b8a8" }}>{body}</span></div>
    <button onClick={onClose} aria-label="Dismiss" className="text-muted hover:text-primary text-sm bg-transparent border-0 p-0 ml-1">×</button>
  </div>;
}