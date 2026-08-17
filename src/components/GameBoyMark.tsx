export function GameBoyMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="StudyBoy">
      <defs>
        <linearGradient id="sb-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#sb-grad)" />
      <path d="M7 8h10M7 12h7M7 16h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17.5" cy="15.5" r="2.5" fill="#fff" opacity="0.9" />
    </svg>
  );
}
export function GameBoyBig({ size = 64 }: { size?: number }) {
  return <GameBoyMark size={size} />;
}