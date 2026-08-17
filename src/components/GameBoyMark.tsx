// StudyBoy logo — clean geometric mark (inline SVG)
export function GameBoyMark({ size = 22 }: { size?: number }) {
 return (
 <svg
 width={size}
 height={size}
 viewBox="0 0 24 24"
 fill="none"
 aria-label="StudyBoy"
 >
 <rect width="24" height="24" rx="6" fill="#3b82f6" />
 <path
 d="M7 8h10M7 12h7M7 16h5"
 stroke="#fff"
 strokeWidth="2"
 strokeLinecap="round"
 />
 <circle cx="17.5" cy="15.5" r="2.5" fill="#fff" opacity="0.9" />
 </svg>
 );
}

// Larger version — same mark, bigger
export function GameBoyBig({ size = 64 }: { size?: number }) {
 return <GameBoyMark size={size} />;
}