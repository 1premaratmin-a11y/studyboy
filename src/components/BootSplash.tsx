import { useEffect, useState } from "react";
import { GameBoyBig } from "./GameBoyMark";
export function BootSplash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const dismiss = () => setGone(true);
    const t = setTimeout(dismiss, 1200);
    window.addEventListener("keydown", dismiss); window.addEventListener("click", dismiss);
    return () => { clearTimeout(t); window.removeEventListener("keydown", dismiss); window.removeEventListener("click", dismiss); };
  }, []);
  if (gone) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5"
      style={{ background: "#0d0b08", transition: "opacity .3s ease", opacity: gone ? 0 : 1, pointerEvents: gone ? "none" : "auto" }}>
      <div style={{ animation: "pop-in 0.4s ease-out both" }}><GameBoyBig size={48} /></div>
      <div className="text-xs text-zinc-500 font-medium tracking-widest uppercase">StudyBoy</div>
    </div>
  );
}