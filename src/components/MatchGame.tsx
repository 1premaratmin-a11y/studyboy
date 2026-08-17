// StudyBoy — interactive term↔definition matching game.
// Turbo-style"interactive activities": click a term, then its definition
// (or vice versa). Correct pairs lock; wrong picks flash. Timed + scored.
import { useEffect, useMemo, useState } from"react";

export interface MatchPair {
 term: string;
 def: string;
}

function shuffle<T>(xs: T[]): T[] {
 const a = [...xs];
 for (let i = a.length - 1; i > 0; i--) {
 const j = Math.floor(Math.random() * (i + 1));
 [a[i], a[j]] = [a[j], a[i]];
 }
 return a;
}

export function MatchGame({ pairs }: { pairs: MatchPair[] }) {
 const [left, setLeft] = useState<MatchPair[]>([]);
 const [right, setRight] = useState<MatchPair[]>([]);
 const [matched, setMatched] = useState<Set<string>>(new Set());
 const [pickL, setPickL] = useState<string | null>(null);
 const [pickR, setPickR] = useState<string | null>(null);
 const [wrong, setWrong] = useState<[string, string] | null>(null);
 const [secs, setSecs] = useState(0);
 const [done, setDone] = useState(false);
 const [announce, setAnnounce] = useState("");

 const start = useMemo(() => Date.now(), []);

 useEffect(() => {
 if (done) return;
 const t = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 250);
 return () => clearInterval(t);
 }, [start, done]);

 // (re)build the board from the supplied pairs
 useEffect(() => {
 setLeft(shuffle(pairs));
 setRight(shuffle(pairs.map((p) => ({ ...p, def: p.def }))));
 setMatched(new Set());
 setPickL(null);
 setPickR(null);
 setWrong(null);
 setDone(false);
 }, [pairs]);

 // completion: derived from matched size (kept out of the pick-resolve effect)
 useEffect(() => {
 if (pairs.length > 0 && matched.size >= pairs.length) setDone(true);
 }, [matched, pairs.length]);

 // resolve a pair attempt when both sides have a pick
 useEffect(() => {
 if (!pickL || !pickR) return;
 if (pickL === pickR) {
 setMatched((m) => {
 const n = new Set(m);
 n.add(pickL);
 return n;
 });
 setWrong(null); // clear any lingering wrong flash from a prior failed attempt
 setPickL(null);
 setPickR(null);
 } else {
 setWrong([pickL, pickR]);
 setAnnounce("incorrect — those don't match");
 const t = setTimeout(() => {
 setWrong(null);
 setPickL(null);
 setPickR(null);
 setAnnounce("");
 }, 600);
 return () => clearTimeout(t);
 }
 }, [pickL, pickR]);

 const scorePct = pairs.length ? Math.round((matched.size / pairs.length) * 100) : 0;

 return (
 <div className="flex flex-col gap-3 pop-in">
 <div className="flex items-center gap-3 flex-wrap font-mono text-[12px]"role="status"aria-live="polite">
 <span className="text-info">▣ MATCHED {matched.size}/{pairs.length}</span>
 <span className="text-muted1">⏱ {secs}s</span>
 <span className="text-accent">{scorePct}%</span>
 {done && <span className="text-success text-success">✓ COMPLETE</span>}
 {announce && <span className="text-warning">{announce}</span>}
 </div>
 <div className="grid grid-cols-2 gap-2.5">
 <div className="flex flex-col gap-1.5">
 <div className="text-[10px] font-semibold uppercase text-muted1">TERMS</div>
 {left.map((p) => {
 const isMatched = matched.has(p.term);
 const isPicked = pickL === p.term;
 const isWrong = wrong?.[0] === p.term;
 return (
 <button
 key={p.term}
 disabled={isMatched}
 onClick={() => setPickL(p.term)}
 aria-pressed={isPicked || isMatched}
 aria-label={`term: ${p.term}${isMatched ?", matched": isPicked ?", selected":""}`}
 className={`text-left px-2 py-1.5 border-2 font-mono text-[13px] transition-all match-cell ${isMatched ?"matched": isWrong ?"wrong": isPicked ?"picked-l":"idle"}`}
 >
 {p.term}
 </button>
 );
 })}
 </div>
 <div className="flex flex-col gap-1.5">
 <div className="text-[10px] font-semibold uppercase text-muted1">DEFINITIONS</div>
 {right.map((p) => {
 const isMatched = matched.has(p.term);
 const isPicked = pickR === p.term;
 const isWrong = wrong?.[1] === p.term;
 return (
 <button
 key={p.term}
 disabled={isMatched}
 onClick={() => setPickR(p.term)}
 aria-pressed={isPicked || isMatched}
 aria-label={`definition: ${p.def.slice(0, 60)}${isMatched ?", matched": isPicked ?", selected":""}`}
 className={`text-left px-2 py-1.5 border-2 font-mono text-[13px] leading-tight transition-all match-cell ${isMatched ?"matched": isWrong ?"wrong": isPicked ?"picked-r":"idle"}`}
 >
 {p.def}
 </button>
 );
 })}
 </div>
 </div>
 {pairs.length < 4 && (
 <div className="font-mono text-[11px] text-muted1">need at least 4 Q-cards/keys to play matching.</div>
 )}
 </div>
 );
}