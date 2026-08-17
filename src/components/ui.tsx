// StudyBoy — clean functional UI primitives
import { type CSSProperties, type ReactNode } from "react";

export function Panel({
 title,
 sub,
 span,
 children,
 className = "",
 ariaLabel,
}: {
 title?: string;
 sub?: string;
 span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
 children: ReactNode;
 className?: string;
 ariaLabel?: string;
}) {
 const col = span ?? 12;
 return (
 <section
 className={`card scroll-pretty ${className}`}
 aria-label={ariaLabel}
 style={{ gridColumn: `span ${col} / span ${col}` }}
 >
 {(title || sub) && (
 <div className="card-header">
 {title && <div className="card-title">{title}</div>}
 {sub && <div className="card-sub">{sub}</div>}
 </div>
 )}
 <div className="card-body">{children}</div>
 </section>
 );
}

export function PixelButton({
 children,
 onClick,
 variant = "default",
 armed,
 className = "",
 title,
 role,
 ariaSelected,
 id,
 ariaControls,
 onKeyDown,
 tabIndex,
}: {
 children: ReactNode;
 onClick?: () => void;
 variant?: "default" | "blue" | "orange";
 armed?: boolean;
 className?: string;
 title?: string;
 role?: string;
 ariaSelected?: boolean;
 id?: string;
 ariaControls?: string;
 onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
 tabIndex?: number;
}) {
 const cls = armed || variant === "blue"
 ? "btn btn-primary"
 : variant === "orange"
 ? "btn btn-danger"
 : "btn";
 return (
 <button
 onClick={onClick}
 title={title}
 role={role}
 id={id}
 aria-selected={ariaSelected}
 aria-controls={ariaControls}
 onKeyDown={onKeyDown}
 tabIndex={tabIndex}
 className={`btn-sm ${cls} ${className}`}
 >
 {children}
 </button>
 );
}

export function Ptag({
 children,
 tone = "default",
}: {
 children: ReactNode;
 tone?: "default" | "ink" | "blue" | "cyan" | "ember";
}) {
 const cls =
 tone === "blue" || tone === "cyan" ? "tag tag-accent"
 : tone === "ember" ? "tag tag-danger"
 : tone === "ink" ? "tag"
 : "tag";
 return <span className={cls}>{children}</span>;
}

export function PixelDivider() {
 return <hr className="border-0 border-t border-border my-2" />;
}

export function HudCell({
 icon,
 value,
 title,
}: {
 icon: ReactNode;
 value: ReactNode;
 title: string;
}) {
 return (
 <div
 title={title}
 className="flex items-center gap-1.5 bg-surface1 border border-border px-2.5 py-1 rounded text-xs text-primary"
 >
 <span className="text-warning">{icon}</span>
 <span className="font-medium">{value}</span>
 </div>
 );
}

// Progress ring
export function Donut({
 pct,
 size = 64,
 color = "var(--accent)",
 track = "var(--surface-3)",
}: {
 pct: number;
 size?: number;
 color?: string;
 track?: string;
}) {
 const r = 28;
 const c = 2 * Math.PI * r;
 const dash = (pct / 100) * c;
 return (
 <svg width={size} height={size} viewBox="0 0 64 64" aria-label={`${pct}% complete`}>
 <circle cx="32" cy="32" r={r} fill="none" stroke={track} strokeWidth="6" />
 <circle
 cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
 strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
 transform="rotate(-90 32 32)"
 />
 </svg>
 );
}

export function MasteryRamp({ level }: { level: 0 | 1 | 2 | 3 }) {
 return (
 <div className="flex gap-1 col-span-full">
 {[0, 1, 2, 3].map((i) => (
 <div
 key={i}
 className={`flex-1 h-1.5 rounded-full ${i <= level ? "bg-accent" : "bg-surface3"}`}
 />
 ))}
 </div>
 );
}

// Heatmap grid
export function Heatmap({
 cells,
 cols = 26,
 rows = 7,
}: {
 cells: { date: number; minutes: number }[];
 cols?: number;
 rows?: number;
}) {
 const cls = (m: number) =>
 m === 0 ? "bg-surface3"
 : m < 45 ? "bg-accent-light"
 : m < 90 ? "bg-accent"
 : m < 150 ? "bg-accentHover"
 : "bg-warning";
 const total = cells.reduce((s, c) => s + c.minutes, 0);
 return (
 <div className="flex gap-2.5 items-start">
 <div
 role="img"
 aria-label={`${cols}-week study heatmap, ${Math.round(total / 60)} total hours`}
 className="grid gap-[3px]"
 style={{ gridTemplateRows: `repeat(${rows}, 13px)`, gridAutoColumns: "13px", gridAutoFlow: "column" }}
 >
 {cells.slice(-cols * rows).map((c, i) => (
 <div
 key={i}
 aria-hidden="true"
 title={`${new Date(c.date).toLocaleDateString()} · ${c.minutes}m`}
 className={`w-[13px] h-[13px] rounded-sm ${cls(c.minutes)}`}
 />
 ))}
 </div>
 </div>
 );
}

export function FocusScreen({
 time,
 session,
 pipsOn,
 pipsCur,
 label,
 armed,
 onStart,
 onPause,
 mini,
}: {
 time: string;
 session: string;
 pipsOn: number;
 pipsCur: number;
 label: string;
 armed: boolean;
 onStart: () => void;
 onPause: () => void;
 mini: string;
}) {
 return (
 <div className="bg-surface1 border border-border rounded-lg p-4 h-full flex flex-col">
 <div className="flex items-center justify-between text-xs text-muted mb-2">
 <span>{session}</span>
 <span>Pomodorodoro</span>
 </div>
 <div className="font-mono text-5xl text-primary text-center my-2 tracking-wide">
 {time}
 </div>
 <div className="flex gap-1.5 justify-center my-2">
 {[0, 1, 2, 3].map((i) => (
 <span
 key={i}
 className={`w-2 h-2 rounded-full ${i < pipsOn ? "bg-accent" : i === pipsCur ? "bg-warning" : "bg-surface3"}`}
 />
 ))}
 </div>
 <div className="flex gap-2 justify-center mt-3">
 <PixelButton armed={armed} onClick={onStart}>Start</PixelButton>
 <PixelButton onClick={onPause}>Pause</PixelButton>
 </div>
 <div className="text-center text-sm text-muted mt-2">{label}</div>
 <div className="flex justify-between text-xs text-muted mt-2">
 <span>{mini}</span>
 <span>Distractions blocked</span>
 </div>
 </div>
 );
}

export function Toast({
 title,
 body,
 onClose,
 style,
}: {
 title: string;
 body: string;
 onClose: () => void;
 style?: CSSProperties;
}) {
 return (
 <div
 role="status"
 aria-live="polite"
 className="fixed top-20 right-4 z-[500] bg-surface0 border border-warning p-3 max-w-xs rounded-lg shadow-md flex gap-2 items-start"
 style={style}
 >
 <div className="w-5 h-5 rounded-full bg-warning flex items-center justify-center text-white text-xs font-bold flex-shrink-0">!</div>
 <div className="text-sm leading-snug">
 <b className="text-warning block text-xs font-semibold mb-1">{title}</b>
 {body}
 </div>
 <button
 onClick={onClose}
 aria-label="Dismiss notification"
 className="text-muted hover:text-primary text-sm bg-transparent border-0 p-0 leading-none ml-1"
 >×</button>
 </div>
 );
}