export function GameBoyMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="StudyBoy">
      <defs><linearGradient id="sbg" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#f59e0b" /><stop offset="1" stopColor="#fbbf24" /></linearGradient></defs>
      <rect width="24" height="24" rx="6" fill="url(#sbg)" />
      <path d="M7 8h10M7 12h7M7 16h5" stroke="#0d0b08" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17.5" cy="15.5" r="2.5" fill="#0d0b08" opacity="0.8" />
    </svg>
  );
}
export function GameBoyBig({ size = 56 }: { size?: number }) { return <GameBoyMark size={size} />; }