import { useEffect, useState } from "react";
import { db, seedIfEmpty, seedDemoNotes } from "./db";
import { BootSplash } from "./components/BootSplash";
import { TopBar } from "./components/TopBar";
import { Sidebar, type ViewKey } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ComingSoon } from "./components/ComingSoon";
import { Dashboard } from "./pages/Dashboard";
import { Todos } from "./pages/Todos";
import { AINotes } from "./pages/AINotes";
import { Notebook } from "./pages/Notebook";
import { Flashcards } from "./pages/Flashcards";
import { Courses } from "./pages/Courses";
import { Focus } from "./pages/Focus";
import { Settings } from "./pages/Settings";
import { Calendar } from "./pages/Calendar";
import { Progress } from "./pages/Progress";
import { Toast } from "./components/ui";
import { autorunOllama, readLastStatus, type AutoRunStatus } from "./lib/ollamaAutoRun";

type LlmMode = "cloud" | "local";

export default function App() {
  const [view, setView] = useState<ViewKey>("notes");
  const [palette, setPalette] = useState(false);
  const [scan, setScan] = useState(true);
  const [toast, setToast] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<AutoRunStatus>(() => readLastStatus());
  const [llmMode, setLlmMode] = useState<LlmMode>(() => (localStorage.getItem("studyboy.llmMode") as LlmMode) || "cloud");

  useEffect(() => { seedIfEmpty(); seedDemoNotes(); }, []);
  useEffect(() => { let c = false; autorunOllama().then((s) => { if (!c) setOllamaStatus(s); }); return () => { c = true; }; }, []);
  useEffect(() => { localStorage.setItem("studyboy.llmMode", llmMode); }, [llmMode]);
  async function resetData() { if (!window.confirm("Reset all data? This wipes all local StudyBoy data and reseeds. Cannot undo.")) return; await db.delete(); window.location.reload(); }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { document.body.classList.toggle("no-scan", !scan); }, [scan]);

  return (
    <>
      <BootSplash />
      {toast && <Toast title="Sync Lost" body="Signal lost to Canvas. Offline mode active." onClose={() => setToast(false)} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} setView={setView} />
      <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
        <Sidebar view={view} setView={setView} onNewChat={() => setView("notes")} />
        <div className="chat-main">
          <TopBar onPalette={() => setPalette(true)} ollamaStatus={ollamaStatus} onToggleSidebar={() => setCollapsed((c) => !c)} />
          <div className="chat-scroll scroll-pretty">
            <div className="chat-column">
              {view === "dashboard" ? <Dashboard />
              : view === "todos" ? <Todos />
              : view === "notes" ? <AINotes />
              : view === "notebook" ? <Notebook />
              : view === "flashcards" ? <Flashcards />
              : view === "courses" ? <Courses />
              : view === "focus" ? <Focus />
              : view === "calendar" ? <Calendar />
              : view === "progress" ? <Progress />
              : view === "settings" ? <Settings scan={scan} setScan={setScan} llmMode={llmMode} setLlmMode={setLlmMode} onResetData={resetData} />
              : <ComingSoon view={view} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}