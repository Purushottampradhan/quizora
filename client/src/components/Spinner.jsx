export default function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-[var(--muted)]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-[var(--coral)]" />
      <p>{label}…</p>
    </div>
  );
}
