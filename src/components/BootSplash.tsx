import { useEffect, useState } from "react";
import { GameBoyBig } from "./GameBoyMark";

export function BootSplash() {
 const [gone, setGone] = useState(false);
 useEffect(() => {
 const dismiss = () => setGone(true);
 const t = setTimeout(dismiss, 1200);
 window.addEventListener("keydown", dismiss);
 window.addEventListener("click", dismiss);
 return () => {
 clearTimeout(t);
 window.removeEventListener("keydown", dismiss);
 window.removeEventListener("click", dismiss);
 };
 }, []);
 if (gone) return null;
 return (
 <div
 className="fixed inset-0 z-[1000] bg-surface1 flex flex-col items-center justify-center gap-4"
 style={{ transition: "opacity .3s ease", opacity: gone ? 0 : 1, pointerEvents: gone ? "none" : "auto" }}
 >
 <GameBoyBig size={56} />
 <div className="text-sm text-muted font-medium">StudyBoy</div>
 <div className="w-8 h-1 rounded-full bg-border overflow-hidden">
 <div className="h-full w-1/2 rounded-full bg-accent" style={{ animation: "fade-in 0.6s ease-in-out infinite alternate" }} />
 </div>
 </div>
 );
}