export function GameBoyMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="StudyBoy">
      <rect width="24" height="24" rx="6" fill="#f59e0b" />
      <path d="M7 8h10M7 12h7M7 16h5" stroke="#100d0a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17.5" cy="15.5" r="2.5" fill="#100d0a" opacity="0.8" />
    </svg>
  );
}
export function GameBoyBig({ size = 48 }: { size?: number }) { return <GameBoyMark size={size} />; }