import { useEffect, useState } from "react";
import { GameBoyBig } from "./GameBoyMark";
export function BootSplash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const dismiss = () => setGone(true);
    const t = setTimeout(dismiss, 1000);
    window.addEventListener("keydown", dismiss); window.addEventListener("click", dismiss);
    return () => { clearTimeout(t); window.removeEventListener("keydown", dismiss); window.removeEventListener("click", dismiss); };
  }, []);
  if (gone) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-4"
      style={{ background: "#100d0a", transition: "opacity .25s ease", opacity: gone ? 0 : 1, pointerEvents: gone ? "none" : "auto" }}>
      <div style={{ animation: "pop-in 0.3s ease-out both" }}><GameBoyBig size={44} /></div>
    </div>
  );
}