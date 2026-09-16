export default function Logo({ size = 36 }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#2a1858" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="#ff7a59" strokeWidth="4" />
        <path
          d="M24 33.5l5 5 11-13"
          fill="none"
          stroke="#c4bbff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-xl font-extrabold tracking-tight">Quiz97</span>
    </div>
  );
}
