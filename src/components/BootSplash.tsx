import { useEffect, useState } from "react";
import { GameBoyBig } from "./GameBoyMark";

export function BootSplash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const dismiss = () => setGone(true);
    const t = setTimeout(dismiss, 1500);
    window.addEventListener("keydown", dismiss);
    window.addEventListener("click", dismiss);
    return () => { clearTimeout(t); window.removeEventListener("keydown", dismiss); window.removeEventListener("click", dismiss); };
  }, []);
  if (gone) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6"
      style={{ background: "#0a0a0f", transition: "opacity .4s ease", opacity: gone ? 0 : 1, pointerEvents: gone ? "none" : "auto" }}>
      <div style={{ animation: "pop-in 0.5s ease-out both" }}><GameBoyBig size={56} /></div>
      <div className="text-sm text-zinc-400 font-medium tracking-wide">StudyBoy</div>
      <div className="w-10 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6)", animation: "fade-in 0.8s ease-in-out infinite alternate" }} />
      </div>
    </div>
  );
}