import { lockLlmMode } from "../lib/ollamaAutoRun";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Panel, PixelButton, Ptag, PixelDivider } from "../components/ui";
import {
 PROVIDERS,
 readAiConfig,
 saveAiConfig,
 saveKey as persistKey,
 clearKey as wipeKey,
 testKey,
 type AiConfig,
 type Provider,
} from "../aiClient";

const CANVAS_BASE_STORAGE = "studyboy.canvas.baseUrl";
const CANVAS_TOKEN_STORAGE = "studyboy.canvas.token";

const DEFAULT_LOCAL_BASEURL = "http://localhost:11434/v1";
const DEFAULT_LOCAL_MODEL = "llama3.2";

type CanvasConn = { name: string; login_id: string };

function Toggle({
 on,
 onChange,
 label,
 description,
}: {
 on: boolean;
 onChange: (next: boolean) => void;
 label: string;
 description?: string;
}) {
 return (
 <label className="flex items-center gap-3 cursor-pointer select-none">
 <span
 role="switch"
 aria-checked={on}
 tabIndex={0}
 onKeyDown={(e) => {
 if (e.key === " " || e.key === "Enter") {
 e.preventDefault();
 onChange(!on);
 }
 }}
 onClick={() => onChange(!on)}
 className={`toggle ${on ? "on" : ""}`}
 title={label}
 >
 <span className="toggle-knob" />
 </span>
 <span className="flex flex-col">
 <span className="text-sm font-medium text-primary">{label}</span>
 {description && <span className="text-xs text-muted leading-tight">{description}</span>}
 </span>
 </label>
 );
}

export function Settings({
 scan,
 setScan,
 llmMode,
 setLlmMode,
 onResetData,
}: {
 scan: boolean;
 setScan: (b: boolean) => void;
 llmMode: "cloud" | "local";
 setLlmMode: (m: "cloud" | "local") => void;
 onResetData: () => void;
}) {
 const [provider, setProvider] = useState<Provider>("groq");
 const [baseUrl, setBaseUrl] = useState("");
 const [model, setModel] = useState(PROVIDERS.groq.defaultModel);
 const [keyDraft, setKeyDraft] = useState("");
 const [keySaved, setKeySaved] = useState(false);
 const [keyMasked, setKeyMasked] = useState(true);
 const [keyTest, setKeyTest] = useState<{ kind: "idle" } | { kind: "checking" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string }>({ kind: "idle" });
 const [localBaseUrl, setLocalBaseUrl] = useState(DEFAULT_LOCAL_BASEURL);
 const [localModel, setLocalModel] = useState(DEFAULT_LOCAL_MODEL);
 const [ollamaStatus, setOllamaStatus] = useState<
 { kind: "idle" } | { kind: "checking" } | { kind: "ok" } | { kind: "err"; msg: string }
 >({ kind: "idle" });

 const [canvasBase, setCanvasBase] = useState("");
 const [canvasToken, setCanvasToken] = useState("");
 const [canvasStatus, setCanvasStatus] = useState<
 | { kind: "idle" }
 | { kind: "connecting" }
 | { kind: "ok"; name: string; loginId: string }
 | { kind: "err"; msg: string }
 >({ kind: "idle" });

 useEffect(() => {
 const cfg = readAiConfig();
 setProvider(cfg.provider);
 setBaseUrl(cfg.baseUrl);
 setModel(cfg.model);
 setKeyDraft(cfg.key);
 setLocalBaseUrl(cfg.localBaseUrl);
 setLocalModel(cfg.localModel);

 const storedBase = localStorage.getItem(CANVAS_BASE_STORAGE) ?? "";
 const storedToken = localStorage.getItem(CANVAS_TOKEN_STORAGE) ?? "";
 setCanvasBase(storedBase);
 setCanvasToken(storedToken);
 if (storedBase && storedToken) {
 setCanvasStatus({ kind: "idle" });
 }
 }, []);

 async function connectCanvas() {
 const inTauri = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
 if (!inTauri) {
 window.alert("Run inside the StudyBoy desktop app.");
 return;
 }
 const base = canvasBase.trim();
 const token = canvasToken.trim();
 if (!base || !token) {
 setCanvasStatus({ kind: "err", msg: "Base URL + token required." });
 return;
 }
 setCanvasStatus({ kind: "connecting" });
 try {
 const conn = await invoke<CanvasConn>("canvas_connect", {
 baseUrl: base,
 token,
 });
 localStorage.setItem(CANVAS_BASE_STORAGE, base);
 localStorage.setItem(CANVAS_TOKEN_STORAGE, token);
 setCanvasStatus({ kind: "ok", name: conn.name, loginId: conn.login_id });
 } catch (e) {
 setCanvasStatus({ kind: "err", msg: String(e) });
 }
 }

 function disconnectCanvas() {
 localStorage.removeItem(CANVAS_BASE_STORAGE);
 localStorage.removeItem(CANVAS_TOKEN_STORAGE);
 setCanvasBase("");
 setCanvasToken("");
 setCanvasStatus({ kind: "idle" });
 }

 function commit(next: Partial<AiConfig>) {
 saveAiConfig(next);
 }

 function persistProvider(next: Provider) {
 setProvider(next);
 const meta = PROVIDERS[next];
 const newModel = meta.defaultModel || model;
 setModel(newModel);
 const newBase = next === "custom" ? baseUrl : "";
 if (next !== "custom") setBaseUrl("");
 commit({ provider: next, model: newModel, baseUrl: newBase });
 setKeyTest({ kind: "idle" });
 }

 function persistModel(value: string) {
 setModel(value);
 commit({ model: value });
 }

 function persistBaseUrl(value: string) {
 setBaseUrl(value);
 commit({ baseUrl: value });
 }

 function persistLocalBaseUrl(value: string) {
 setLocalBaseUrl(value);
 commit({ localBaseUrl: value });
 }

 function persistLocalModel(value: string) {
 setLocalModel(value);
 commit({ localModel: value });
 }

 async function runTestKey() {
 const cfg = readAiConfig();
 if (cfg.llmMode === "cloud" && !cfg.key.trim()) {
 setKeyTest({ kind: "err", msg: "No key entered." });
 return;
 }
 setKeyTest({ kind: "checking" });
 const r = await testKey(cfg);
 setKeyTest(r.ok ? { kind: "ok", msg: r.msg } : { kind: "err", msg: r.msg });
 }

 async function checkOllama() {
 const inTauri = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
 if (!inTauri) {
 setOllamaStatus({ kind: "err", msg: "Run inside the StudyBoy desktop app." });
 return;
 }
 const base = localBaseUrl.trim().replace(/\/v1\/?$/, "");
 if (!base) {
 setOllamaStatus({ kind: "err", msg: "Local base URL required." });
 return;
 }
 setOllamaStatus({ kind: "checking" });
 try {
 await invoke<unknown>("ollama_ping", { baseUrl: base });
 setOllamaStatus({ kind: "ok" });
 } catch (e) {
 setOllamaStatus({ kind: "err", msg: String(e) });
 }
 }

 function saveKey() {
 persistKey(keyDraft);
 setKeySaved(true);
 window.setTimeout(() => setKeySaved(false), 1800);
 }

 function clearKey() {
 wipeKey();
 setKeyDraft("");
 setKeySaved(false);
 setKeyTest({ kind: "idle" });
 }

 function handleReset() {
 const ok = window.confirm(
 "Reset all data?\n\nThis wipes all StudyBoy data and reseeds the demo. This cannot be undone. Continue?",
 );
 if (ok) onResetData();
 }

 return (
 <main className="min-h-0 overflow-auto scroll-pretty grid grid-cols-12 gap-2.5 pr-0.5">
 {/* DISPLAY */}
 <Panel title="Display" sub="appearance" span={6} ariaLabel="Display settings">
 <div className="flex flex-col gap-3">
 <Toggle
 on={scan}
 onChange={setScan}
 label="Scanlines"
 description="CRT scanline overlay effect."
 />
 <div className="border-t border-border pt-2.5">
 <div className="flex items-center gap-2 mb-1">
 <span className="w-3.5 h-3.5 rounded border border-border bg-surface2 grid place-items-center text-[10px] text-muted">i</span>
 <span className="text-sm font-medium text-primary">Reduced Motion</span>
 <Ptag tone="default">auto</Ptag>
 </div>
 <p className="text-xs text-muted leading-relaxed pl-5">
 StudyBoy respects <span className="font-mono text-[11px] text-secondary">prefers-reduced-motion</span>. When your OS asks for less motion, non-essential animations are suppressed automatically.
 </p>
 </div>
 </div>
 </Panel>

 {/* AI ENGINE */}
 <Panel title="AI Engine" sub="LLM configuration" span={6} ariaLabel="AI engine settings">
 <div className="flex flex-col gap-3">
 <div>
 <div className="text-xs font-semibold text-primary mb-1.5">Mode</div>
 <div className="flex border border-border rounded overflow-hidden w-fit" role="radiogroup" aria-label="AI mode">
 <PixelButton variant={llmMode === "cloud" ? "blue" : "default"} armed={llmMode === "cloud"} onClick={() => { setLlmMode("cloud"); lockLlmMode(); }} role="radio" ariaSelected={llmMode === "cloud"}>
 Cloud
 </PixelButton>
 <PixelButton variant={llmMode === "local" ? "blue" : "default"} armed={llmMode === "local"} onClick={() => { setLlmMode("local"); lockLlmMode(); }} role="radio" ariaSelected={llmMode === "local"}>
 Local
 </PixelButton>
 </div>
 </div>

 <div className={llmMode === "local" ? "opacity-50 pointer-events-none" : ""}>
 <div className="text-xs font-semibold text-primary mb-1.5">Provider</div>
 <div className="flex flex-wrap border border-border rounded overflow-hidden w-fit" role="radiogroup" aria-label="AI provider">
 {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
 <PixelButton key={p} variant={provider === p ? "blue" : "default"} armed={provider === p} onClick={() => persistProvider(p)} role="radio" ariaSelected={provider === p}>
 {PROVIDERS[p].label}
 </PixelButton>
 ))}
 </div>
 <p className="text-xs text-muted leading-relaxed mt-1.5">
 {PROVIDERS[provider].hint}
 {!PROVIDERS[provider].browserOk && <span className="text-danger"> · desktop app only (no browser CORS)</span>}
 </p>
 </div>

 <div className={llmMode === "local" ? "opacity-50 pointer-events-none" : ""}>
 <label className="text-xs font-semibold text-primary mb-1.5 block">API Key</label>
 <div className="flex gap-1.5 flex-wrap">
 <input
 type={keyMasked ? "password" : "text"}
 value={keyDraft}
 onChange={(e) => setKeyDraft(e.target.value)}
 placeholder="paste API key"
 spellCheck={false}
 autoComplete="off"
 aria-label={`${PROVIDERS[provider].label} API key`}
 className="flex-1 min-w-[200px]"
 />
 <PixelButton onClick={() => setKeyMasked((m) => !m)} title="show / hide">
 {keyMasked ? "Show" : "Hide"}
 </PixelButton>
 <PixelButton variant="blue" armed={keySaved} onClick={saveKey} title="persist to localStorage">
 {keySaved ? "Saved" : "Save"}
 </PixelButton>
 <PixelButton variant="orange" onClick={clearKey} title="remove stored key">
 Clear
 </PixelButton>
 <PixelButton armed={keyTest.kind === "ok"} onClick={runTestKey} title="probe the endpoint with your key">
 {keyTest.kind === "checking" ? "…" : "Test"}
 </PixelButton>
 </div>
 {keyTest.kind === "ok" && <div className="text-xs text-success mt-1">✓ {keyTest.msg}</div>}
 {keyTest.kind === "err" && <div className="text-xs text-danger mt-1 break-words">⚠ {keyTest.msg}</div>}
 </div>

 <div className={llmMode === "local" ? "opacity-50 pointer-events-none" : ""}>
 <label className="text-xs font-semibold text-primary mb-1.5 block">Model</label>
 <input
 type="text"
 value={model}
 onChange={(e) => persistModel(e.target.value)}
 placeholder="model id"
 spellCheck={false}
 autoComplete="off"
 aria-label="AI model id"
 className="w-full"
 />
 {PROVIDERS[provider].models.length > 0 && (
 <div className="flex flex-wrap gap-1.5 mt-1.5">
 {PROVIDERS[provider].models.map((m) => (
 <button
 key={m}
 onClick={() => persistModel(m)}
 className={`text-xs px-2 py-1 rounded border transition-colors ${model === m ? "border-accent text-accentHover bg-accentLight" : "border-border text-muted hover:bg-surface2"}`}
 >
 {m}
 </button>
 ))}
 </div>
 )}
 </div>

 {provider === "custom" && llmMode !== "local" && (
 <div>
 <label className="text-xs font-semibold text-primary mb-1.5 block">Base URL</label>
 <input
 type="text"
 value={baseUrl}
 onChange={(e) => persistBaseUrl(e.target.value)}
 placeholder="https://api.openai.com/v1"
 spellCheck={false}
 autoComplete="off"
 aria-label="Custom OpenAI-compatible base URL"
 className="w-full"
 />
 </div>
 )}

 {llmMode === "local" && (
 <div className="border-t border-border pt-3 flex flex-col gap-2.5">
 <div className="text-xs font-semibold text-info">Ollama · Local</div>
 <div>
 <label className="text-xs font-semibold text-primary mb-1.5 block">Base URL</label>
 <input
 type="text"
 value={localBaseUrl}
 onChange={(e) => persistLocalBaseUrl(e.target.value)}
 placeholder={DEFAULT_LOCAL_BASEURL}
 spellCheck={false}
 autoComplete="off"
 aria-label="Ollama base URL"
 className="w-full"
 />
 </div>
 <div>
 <label className="text-xs font-semibold text-primary mb-1.5 block">Model</label>
 <input
 type="text"
 value={localModel}
 onChange={(e) => persistLocalModel(e.target.value)}
 placeholder={DEFAULT_LOCAL_MODEL}
 spellCheck={false}
 autoComplete="off"
 aria-label="Ollama model"
 className="w-full"
 />
 </div>
 <div className="flex items-center gap-2">
 <PixelButton variant="blue" armed={ollamaStatus.kind === "ok"} onClick={checkOllama} title="ping Ollama server">
 {ollamaStatus.kind === "checking" ? "…" : "Test Connection"}
 </PixelButton>
 {ollamaStatus.kind === "ok" && <span className="text-xs text-success">✓ Connected</span>}
 {ollamaStatus.kind === "err" && <span className="text-xs text-danger break-words">⚠ {ollamaStatus.msg}</span>}
 </div>
 </div>
 )}
 </div>
 </Panel>

 {/* CANVAS LMS */}
 <Panel title="Canvas LMS" sub="course integration" span={6} ariaLabel="Canvas LMS settings">
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between">
 <div className="text-xs text-muted">
 {canvasStatus.kind === "ok"
 ? `Connected as ${canvasStatus.name}`
 : canvasStatus.kind === "err"
 ? canvasStatus.msg
 : "Not connected"}
 </div>
 {canvasStatus.kind === "ok" ? (
 <Ptag tone="cyan">Online</Ptag>
 ) : (
 <Ptag tone="ember">Offline</Ptag>
 )}
 </div>

 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-semibold text-primary">Canvas Base URL</label>
 <input
 type="text"
 value={canvasBase}
 onChange={(e) => setCanvasBase(e.target.value)}
 placeholder="https://school.instructure.com"
 spellCheck={false}
 autoComplete="off"
 aria-label="Canvas base URL"
 className="w-full"
 />
 <label className="text-xs font-semibold text-primary mt-1">Access Token</label>
 <input
 type="password"
 value={canvasToken}
 onChange={(e) => setCanvasToken(e.target.value)}
 placeholder="paste Canvas access token"
 spellCheck={false}
 autoComplete="off"
 aria-label="Canvas access token"
 className="w-full"
 />
 </div>

 <div className="flex gap-2 flex-wrap">
 <PixelButton
 variant="blue"
 armed={canvasStatus.kind === "ok"}
 onClick={connectCanvas}
 title="verify token + save"
 >
 {canvasStatus.kind === "connecting" ? "…" : canvasStatus.kind === "ok" ? "Connected" : "Connect"}
 </PixelButton>
 <PixelButton variant="orange" onClick={disconnectCanvas} title="clear stored token + reset">
 Disconnect
 </PixelButton>
 </div>

 {canvasStatus.kind === "ok" && (
 <div className="border border-info bg-infoLight px-2.5 py-1.5 rounded text-xs text-info">
 Connected · {canvasStatus.name}
 </div>
 )}
 {canvasStatus.kind === "err" && (
 <div className="border border-danger bg-dangerLight px-2.5 py-1.5 rounded text-xs text-danger break-words">
 {canvasStatus.msg}
 </div>
 )}

 <p className="text-xs text-muted leading-relaxed">
 Token-based auth (Canvas → Profile → Settings → New Access Token). Requests run through the Rust SSRF allowlist; only allow-listed LMS hosts are accessible. Token stored only in this browser's localStorage.
 </p>
 </div>
 </Panel>

 {/* ABOUT */}
 <Panel title="About" sub="StudyBoy" span={6} ariaLabel="About StudyBoy">
 <div className="flex flex-col gap-2">
 <div className="flex items-center gap-2.5">
 <div className="w-9 h-9 rounded-lg bg-accent text-white grid place-items-center text-xs font-bold shadow-sm">
 SB
 </div>
 <div>
 <div className="text-sm font-semibold text-primary">StudyBoy v0.1</div>
 <div className="text-xs text-muted">Your study companion</div>
 </div>
 </div>
 <PixelDivider />
 <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
 <span className="text-muted">Stack</span>
 <span className="text-secondary">Tauri 2 · React 19 · Dexie</span>
 <span className="text-muted">UI</span>
 <span className="text-secondary">Clean functional design</span>
 <span className="text-muted">Build</span>
 <span className="text-success font-medium">{__APP_BUILD__}</span>
 </div>
 <p className="text-xs text-muted leading-relaxed mt-1">
 Made for focused studying.
 </p>
 </div>
 </Panel>

 {/* DANGER ZONE */}
 <Panel title="Danger Zone" sub="reset · irreversible" span={12} className="border-danger" ariaLabel="Danger zone">
 <div className="flex items-center gap-3 flex-wrap">
 <span className="text-sm text-muted flex-1 min-w-[200px]">
 Wipe all local data and reseed the demo dataset. Courses, tasks, focus sessions, flashcards — gone. There is no undo.
 </span>
 <PixelButton variant="orange" onClick={handleReset} title="wipe + reseed">
 Reset All Data
 </PixelButton>
 </div>
 </Panel>
 </main>
 );
}