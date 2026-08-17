// StudyBoy — mind-map / key-term graph (NotebookLM-style).
// Renders a note document as a radial SVG: center = title, ring 1 = section
// topics, ring 2 = a cue/q-card per section. Pure computed layout, no deps.
import { useMemo } from"react";
import type { NoteDocument } from"../db";

const ACCENTS = ["#268bd2","#2aa198","#859900","#6c71c4","#d33682","#b58900","#cb4b16"];

export function MindMap({ doc }: { doc: NoteDocument }) {
 const nodes = useMemo(() => {
 const cx = 300;
 const cy = 300;
 const secs = doc.sections;
 const out: {
 x: number;
 y: number;
 label: string;
 kind:"center"|"topic"|"leaf";
 color: string;
 link?: { x: number; y: number };
 r: number;
 }[] = [];
 out.push({ x: cx, y: cy, label: doc.title.slice(0, 18), kind:"center", color:"#002b36", r: 34 });
 secs.forEach((sec, i) => {
 const ang = (i / Math.max(1, secs.length)) * Math.PI * 2 - Math.PI / 2;
 const tx = cx + Math.cos(ang) * 110;
 const ty = cy + Math.sin(ang) * 110;
 const color = ACCENTS[i % ACCENTS.length];
 out.push({ x: tx, y: ty, label: sec.topic.slice(0, 16), kind:"topic", color, link: { x: cx, y: cy }, r: 20 });
 // one leaf = first cue or first qcard q
 const leafText = sec.cues[0] ?? sec.qcards[0]?.q ?? sec.notes[0] ??"";
 if (leafText) {
 const lx = cx + Math.cos(ang) * 200;
 const ly = cy + Math.sin(ang) * 200;
 out.push({
 x: lx,
 y: ly,
 label: leafText.replace(/{{c1::|}}/g,"").slice(0, 18),
 kind:"leaf",
 color,
 link: { x: tx, y: ty },
 r: 14,
 });
 }
 });
 return out;
 }, [doc]);

 if (doc.sections.length === 0) {
 return <div className="font-mono text-[12px] text-muted1 italic">no sections to map yet.</div>;
 }

 return (
 <div className="pop-in grid place-items-center overflow-auto scroll-pretty">
 <svg
 viewBox="0 0 600 600"
 className="max-w-full max-h-[520px]"
 style={{ }}
 role="img"
 aria-label={`Mind map for ${doc.title}: ${doc.sections.map((s) => s.topic).join(",") ||"no topics"}`}
 >
 <title>{`Mind map — ${doc.title}`}</title>
 {/* links */}
 {nodes.map((n, i) =>
 n.link ? (
 <line
 key={`l${i}`}
 x1={n.link.x}
 y1={n.link.y}
 x2={n.x}
 y2={n.y}
 stroke={n.color}
 strokeWidth={n.kind ==="leaf"? 2 : 3}
 strokeDasharray={n.kind ==="leaf"?"4 3":"none"}
 />
 ) : null,
 )}
 {/* nodes */}
 {nodes.map((n, i) => (
 <g key={`n${i}`} className="mm-node"style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
 <circle
 cx={n.x}
 cy={n.y}
 r={n.r}
 fill={n.kind ==="center"?"#002b36": n.kind ==="topic"? n.color :"#fdf6e3"}
 stroke={n.color}
 strokeWidth={n.kind ==="center"? 0 : 2}
 />
 <text
 x={n.x}
 y={n.y + (n.kind ==="leaf"? n.r + 12 : n.r + 11)}
 textAnchor="middle"
 fontFamily="DM Mono, monospace"
 fontSize={n.kind ==="center"? 10 : n.kind ==="topic"? 9 : 8}
 fill={n.kind ==="center"?"#fdf6e3": n.kind ==="topic"? n.color :"#586e75"}
 >
 {n.label}
 </text>
 {n.kind ==="center"&& (
 <text x={n.x} y={n.y + 3} textAnchor="middle"fontFamily=" 2P, monospace"fontSize={7} fill="#2aa198">
 ★
 </text>
 )}
 </g>
 ))}
 </svg>
 </div>
 );
}