import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Flashcard } from "../db";
import { Panel, PixelButton, Ptag } from "../components/ui";

const min = 60_000;
const day = 86_400_000;

function schedule(rating: "again" | "hard" | "good" | "easy"): Partial<Flashcard["fsrs"]> {
 const now = Date.now();
 const delay =
 rating === "again" ? 10 * min : rating === "hard" ? 1 * day : rating === "good" ? 3 * day : 7 * day;
 return {
 lastReview: new Date(now).toISOString(),
 due: new Date(now + delay).toISOString(),
 retrievability: rating === "again" ? 0.2 : rating === "hard" ? 0.5 : rating === "good" ? 0.8 : 0.95,
 };
}

export function Flashcards() {
 const cards = useLiveQuery(() => db.flashcards.toArray(), []) ?? [];
 const [reviewing, setReviewing] = useState(false);
 const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
 const [idx, setIdx] = useState(0);
 const [flipped, setFlipped] = useState(false);
 const reviewRef = useRef<HTMLDivElement>(null);

 const dueCards = useMemo(() => {
 const now = Date.now();
 return cards
 .filter((c) => new Date(c.fsrs.due).getTime() <= now)
 .sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
 }, [cards]);

 function startReview() {
 if (dueCards.length === 0) return;
 setReviewQueue(dueCards);
 setIdx(0);
 setFlipped(false);
 setReviewing(true);
 }

 useEffect(() => {
 if (reviewing) reviewRef.current?.focus();
 }, [reviewing]);

 const byDeck = useMemo(() => {
 const m = new Map<string, { total: number; due: number }>();
 for (const c of cards) {
 const key = c.sourceRef || "unsorted";
 const e = m.get(key) ?? { total: 0, due: 0 };
 e.total += 1;
 if (new Date(c.fsrs.due).getTime() <= Date.now()) e.due += 1;
 m.set(key, e);
 }
 return [...m.entries()];
 }, [cards]);

 if (reviewing && reviewQueue.length) {
 const card = reviewQueue[idx % reviewQueue.length];
 const advance = () => {
 if (idx + 1 >= reviewQueue.length) {
 setReviewing(false);
 setIdx(0);
 setReviewQueue([]);
 } else {
 setIdx((i) => i + 1);
 }
 };
 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid place-items-center p-4">
 <Panel title="Review" sub={`${idx + 1} / ${reviewQueue.length}`} span={6} ariaLabel="Flashcard review">
 <div ref={reviewRef} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") { setReviewing(false); setIdx(0); setReviewQueue([]); } }} className="flex flex-col items-center gap-4 outline-none">
 <div
 onClick={() => setFlipped((f) => !f)}
 role="button"
 tabIndex={0}
 aria-pressed={flipped}
 aria-label={`${flipped ? "Answer" : "Question"}: ${flipped ? card.back || "(no answer recorded)" : card.front} — activate to flip`}
 onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlipped((f) => !f); } }}
 className={`w-full min-h-[180px] grid place-items-center cursor-pointer rounded-lg p-6 border-2 transition-colors ${
 flipped ? "border-success bg-successLight text-primary" : "border-border bg-surface1 text-primary"
 }`}
 >
 <div className="text-center">
 <div className={`text-xs font-semibold mb-3 ${flipped ? "text-success" : "text-muted"}`}>
 {flipped ? "A" : "Q"} · {card.kind === "cloze" ? "Cloze" : "Q&A"}
 </div>
 <div className="text-lg leading-snug">
 {flipped ? (card.back || "(no answer recorded)") : card.front}
 </div>
 {!flipped && <div className="text-xs text-muted mt-4">Click or press space to flip</div>}
 </div>
 </div>
 {flipped ? (
 <div className="grid grid-cols-4 gap-2 w-full">
 <RateBtn tone="ember" label="Again" onClick={() => rate("again")} />
 <RateBtn tone="ink" label="Hard" onClick={() => rate("hard")} />
 <RateBtn tone="blue" label="Good" onClick={() => rate("good")} />
 <RateBtn tone="cyan" label="Easy" onClick={() => rate("easy")} />
 </div>
 ) : (
 <PixelButton variant="blue" onClick={() => setFlipped(true)}>
 Reveal Answer
 </PixelButton>
 )}
 <button onClick={() => { setReviewing(false); setIdx(0); setReviewQueue([]); }} className="text-xs text-muted hover:underline">
 ← Exit review (esc)
 </button>
 </div>
 </Panel>
 </main>
 );

 async function rate(rating: "again" | "hard" | "good" | "easy") {
 await db.flashcards.update(card.id, { fsrs: { ...card.fsrs, ...schedule(rating) } });
 setFlipped(false);
 advance();
 }
 }

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 <Panel title="Flashcard Decks" sub="Spaced repetition (FSRS)" span={8} ariaLabel="Flashcard decks">
 <div className="flex flex-col gap-1.5">
 {byDeck.map(([ref, e]) => (
 <div
 key={ref}
 className="grid items-center gap-2 px-2.5 py-2 border border-border rounded bg-surface1"
 style={{ gridTemplateColumns: "1fr auto auto auto" }}
 >
 <span className="text-sm text-primary">{ref}</span>
 <span className="text-xs text-muted">{e.total} cards</span>
 <Ptag tone={e.due > 0 ? "ember" : "cyan"}>{e.due} due</Ptag>
 <PixelButton variant={e.due > 0 ? "blue" : "default"} armed={e.due > 0} onClick={startReview}>
 Review
 </PixelButton>
 </div>
 ))}
 </div>
 </Panel>
 <Panel title="Stats" sub="card memory" span={4} ariaLabel="Card stats">
 <div className="flex flex-col gap-2">
 <Stat label="Total Cards" value={cards.length} />
 <Stat label="Due Now" value={dueCards.length} tone="ember" />
 <Stat label="Learned" value={cards.filter((c) => c.fsrs.state >= 2).length} tone="cyan" />
 <Stat label="Young (stable)" value={cards.filter((c) => c.fsrs.stability > 1).length} />
 <div className="mt-2">
 <PixelButton variant="blue" armed={dueCards.length > 0} onClick={startReview}>
 Start Review ({dueCards.length})
 </PixelButton>
 </div>
 <div className="border-t border-border pt-2 flex flex-col gap-1.5">
 <div className="text-xs font-semibold text-muted">Export Deck</div>
 <div className="flex gap-2">
 <PixelButton onClick={() => exportDeck(cards, "csv")}>CSV</PixelButton>
 <PixelButton onClick={() => exportDeck(cards, "anki")}>Anki TXT</PixelButton>
 </div>
 <p className="text-xs text-muted leading-relaxed">
 Tab-separated front → back. Anki: File → Import, Basic (or Cloze) note type.
 </p>
 </div>
 </div>
 </Panel>
 </main>
 );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "ember" | "cyan" }) {
 const color = tone === "ember" ? "text-danger" : tone === "cyan" ? "text-info" : "text-primary";
 return (
 <div className="bg-surface1 border border-border rounded p-2 flex items-baseline justify-between">
 <span className="text-[10px] text-muted uppercase tracking-wide">{label}</span>
 <span className={`font-mono text-2xl tabular-nums ${color}`}>{value}</span>
 </div>
 );
}

function RateBtn({ tone, label, onClick }: { tone: "ember" | "ink" | "blue" | "cyan"; label: string; onClick: () => void }) {
 const cls =
 tone === "ember" ? "btn btn-danger"
 : tone === "blue" ? "btn btn-primary"
 : tone === "cyan" ? "btn btn-primary"
 : "btn";
 return (
 <button onClick={onClick} className={`btn-sm ${cls}`}>
 {label}
 </button>
 );
}

function exportDeck(cards: Flashcard[], kind: "csv" | "anki") {
 if (cards.length === 0) return;
 const esc = (s: string) => s.replace(/[\t\n\r]/g, " ");
 let body: string;
 let mime: string;
 let ext: string;
 if (kind === "csv") {
 const q = (s: string) => `"${esc(s).replace(/"/g, '""')}"`;
 body = ["front,back", ...cards.map((c) => `${q(c.front)},${q(c.back)}`)].join("\n");
 mime = "text/csv";
 ext = "csv";
 } else {
 body = cards.map((c) => `${esc(c.front)}\t${esc(c.back)}\t${c.kind}`).join("\n");
 mime = "text/plain";
 ext = "txt";
 }
 const blob = new Blob([body], { type: mime });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = `studyboy-deck.${ext}`;
 a.click();
 URL.revokeObjectURL(url);
}