// StudyBoy — study podcast player (Turbo-style"notes → audio").
// Speaks an LLM-generated two-host script via the Web Speech API (speechSynthesis).
// Pure browser, no audio upload; supports play/pause, rate, voice, progress.
import { useEffect, useRef, useState, type CSSProperties } from"react";
import type { PodcastScript } from"../aiClient";
import { PixelButton } from"./ui";

const synth: SpeechSynthesis | null = typeof window !=="undefined"? window.speechSynthesis : null;

export function PodcastPlayer({ script }: { script: PodcastScript }) {
 const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (synth ? synth.getVoices() : []));
 const [voiceA, setVoiceA] = useState<string>("");
 const [voiceB, setVoiceB] = useState<string>("");
 const [rate, setRate] = useState(1);
 const [playing, setPlaying] = useState(false);
 const [cur, setCur] = useState(0);
 const queueRef = useRef<number>(0);
 const cancelledRef = useRef(false);
 // Monotonic run id. Each speakFrom/start of a run bumps it; utterance
 // callbacks (onend/onerror) capture their run's id and bail unless it still
 // matches the current one. This stops a just-cancelled utterance's deferred
 // onend/onerror (which fires AFTER synth.cancel + cancelledRef reset) from
 // spuriously advancing the queue.
 const runIdRef = useRef(0);
 // live refs so onend (which closes over the run() instance at speak time)
 // always reads the CURRENT rate/voice — mid-playback changes take effect
 // on the next segment instead of staying stale until stop+replay.
 const rateRef = useRef(rate);
 const voiceARef = useRef(voiceA);
 const voiceBRef = useRef(voiceB);
 const voicesRef = useRef(voices);
 useEffect(() => { rateRef.current = rate; }, [rate]);
 useEffect(() => { voiceARef.current = voiceA; }, [voiceA]);
 useEffect(() => { voiceBRef.current = voiceB; }, [voiceB]);
 useEffect(() => { voicesRef.current = voices; }, [voices]);

 // voices arrive asynchronously via onvoiceschanged (Chrome/Edge); without this
 // the Voice A/B selects stay stuck on"default"for the whole session.
 useEffect(() => {
 if (!synth) return;
 const load = () => setVoices(synth.getVoices());
 load();
 synth.onvoiceschanged = load;
 const t = window.setTimeout(load, 500); // fallback for browsers that never fire it
 return () => {
 synth.onvoiceschanged = null;
 window.clearTimeout(t);
 };
 }, []);

 // default voices: pick two distinct ones if available
 useEffect(() => {
 if (!synth || voices.length === 0) return;
 const en = voices.filter((v) => /en/i.test(v.lang));
 const pool = en.length ? en : voices;
 setVoiceA((v) => v || pool[0]?.name ||"");
 setVoiceB((v) => v || pool[1 % pool.length]?.name || pool[0]?.name ||"");
 }, [voices]);

 useEffect(() => {
 return () => {
 cancelledRef.current = true;
 runIdRef.current += 1;
 synth?.cancel();
 };
 }, []);

 function speakFrom(idx: number) {
 if (!synth) return;
 synth.cancel();
 const myRun = ++runIdRef.current;
 cancelledRef.current = false;
 queueRef.current = idx;
 setCur(idx);
 run(idx, myRun);
 }

 function run(idx: number, myRun: number) {
 if (!synth) return;
 if (idx >= script.segments.length) {
 setPlaying(false);
 setCur(0);
 return;
 }
 // Stopped, or a newer run started — drop this callback chain.
 if (cancelledRef.current || runIdRef.current !== myRun) return;
 const seg = script.segments[idx];
 const u = new SpeechSynthesisUtterance(seg.text);
 u.rate = rateRef.current;
 const name = seg.speaker ==="A"? voiceARef.current : voiceBRef.current;
 const v = voicesRef.current.find((x) => x.name === name);
 if (v) u.voice = v;
 u.onend = () => {
 // Ignore callbacks from a cancelled / superseded run (e.g. a
 // cancel-interrupted utterance firing onend after we reset cancelledRef).
 if (cancelledRef.current || runIdRef.current !== myRun) return;
 const next = queueRef.current + 1;
 queueRef.current = next;
 setCur(next);
 run(next, myRun);
 };
 u.onerror = () => {
 if (cancelledRef.current || runIdRef.current !== myRun) return;
 const next = queueRef.current + 1;
 queueRef.current = next;
 setCur(next);
 run(next, myRun);
 };
 synth.speak(u);
 }

 function togglePlay() {
 if (!synth) return;
 if (playing) {
 synth.pause();
 setPlaying(false);
 } else {
 if (synth.paused && synth.speaking) {
 synth.resume();
 setPlaying(true);
 } else {
 setPlaying(true);
 speakFrom(cur >= script.segments.length ? 0 : cur);
 }
 }
 }

 function stop() {
 if (!synth) return;
 cancelledRef.current = true;
 runIdRef.current += 1; // invalidate any in-flight utterance callbacks
 synth.cancel();
 setPlaying(false);
 setCur(0);
 }

 function jump(i: number) {
 setPlaying(true);
 speakFrom(i);
 }

 if (!synth) {
 return <div className="font-mono text-[12px] text-warning">speechSynthesis unavailable in this browser.</div>;
 }

 return (
 <div className="flex flex-col gap-2.5 pop-in"style={{"--i":"0"} as CSSProperties}>
 {/* Cover */}
 <div className="relative bg-surface23 text-muted border-[3px] border-borderStrong2 shadow-sm p-3 overflow-hidden">
 <div className="absolute inset-0 pointer-events-none opacity-40"style={{ background:"none"}} />
 <div className="relative z-10 flex items-center gap-3">
 {/* spinning cassette */}
 <div className={`reel ${playing ?"spin":""}`} />
 <div className="flex-1 min-w-0">
 <div className="text-xs font-semibold text-info">STUDY PODCAST</div>
 <div className="text-lg text-muted leading-tight truncate">{script.title}</div>
 <div className="font-mono text-[11px] text-muted1">{script.segments.length} turns · ⚡ {script.segments.filter((s) => s.speaker ==="A").length}A / {script.segments.filter((s) => s.speaker ==="B").length}B</div>
 </div>
 </div>
 {/* waveform */}
 <div className="relative z-10 flex items-end gap-[2px] h-8 mt-2.5">
 {script.segments.map((s, i) => (
 <button
 key={i}
 onClick={() => jump(i)}
 title={`${s.speaker}: ${s.text.slice(0, 40)}…`}
 aria-label={`Jump to segment ${i + 1}, ${s.speaker}`}
 className={`flex-1 min-w-[3px] border-x border-borderStrong2 transition-all ${i === cur ?"bar-on":"bar-off"} ${s.speaker ==="A"?"bar-a":"bar-b"}`}
 style={{ height: `${20 + ((i * 37) % 60)}%` }}
 />
 ))}
 </div>
 </div>

 {/* Controls */}
 <div className="flex items-center gap-2 flex-wrap">
 <PixelButton variant="blue"armed={playing} onClick={togglePlay}>
 {playing ?"❚❚ PAUSE":"▶ PLAY"}
 </PixelButton>
 <PixelButton onClick={stop}>■ STOP</PixelButton>
 <span className="text-[10px] font-semibold uppercase text-muted1">SPEED</span>
 <div className="flex gap-1">
 {[0.75, 1, 1.25, 1.5].map((r) => (
 <button
 key={r}
 onClick={() => setRate(r)}
 aria-pressed={rate === r}
 className={`text-[10px] font-semibold px-1.5 py-1 btn btn-sm ${rate === r ?"bg-accent text-surface0 border-accent":"bg-surface1 text-muted border-borderStrong3 hover:bg-surface21 hover:text-surface0"}`}
 >
 {r}×
 </button>
 ))}
 </div>
 <span className="text-[10px] font-semibold uppercase text-muted1">VOICE A</span>
 <select value={voiceA} onChange={(e) => setVoiceA(e.target.value)} aria-label="Voice A"className="bg-surface0 border-2 border-borderStrong3 px-1.5 py-1 font-mono text-[11px] outline-none max-w-[140px]">
 {voices.length === 0 && <option>default</option>}
 {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
 </select>
 <span className="text-[10px] font-semibold uppercase text-muted1">B</span>
 <select value={voiceB} onChange={(e) => setVoiceB(e.target.value)} aria-label="Voice B"className="bg-surface0 border-2 border-borderStrong3 px-1.5 py-1 font-mono text-[11px] outline-none max-w-[140px]">
 {voices.length === 0 && <option>default</option>}
 {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
 </select>
 </div>

 {/* Transcript */}
 <div className="bg-surface1 border-2 border-borderStrong3 p-2 max-h-[200px] overflow-auto scroll-pretty flex flex-col gap-1.5">
 {script.segments.map((s, i) => (
 <button
 key={i}
 onClick={() => jump(i)}
 aria-current={i === cur ?"true": undefined}
 aria-label={`${s.speaker ==="A"?"Host A":"Host B"}, segment ${i + 1} of ${script.segments.length}`}
 className={`text-left p-1.5 border-2 ${i === cur ?"bg-surface0 border-accent":"bg-surface0 border-borderStrong3 hover:border-borderStrong1"}`}
 >
 <span className={`font-semibold text-[7px] ${s.speaker ==="A"?"text-info":"text-accent"}`}>{s.speaker ==="A"?"HOST A":"HOST B"}</span>
 <span className="font-mono text-[12px] leading-tight block mt-0.5">{s.text}</span>
 </button>
 ))}
 </div>
 </div>
 );
}