type OpenAccessIndicatorProps = {
  compact?: boolean;
};

export function OpenAccessIndicator({
  compact = false,
}: OpenAccessIndicatorProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"
      aria-label="Open access available"
      title="Open access available"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.25 6V4.75a2.75 2.75 0 0 1 5.5 0" />
        <path d="M4.75 7.25h6.5a1 1 0 0 1 1 1v3a2 2 0 0 1-2 2h-4.5a2 2 0 0 1-2-2v-3a1 1 0 0 1 1-1Z" />
        <path d="M9.5 10.25a1.5 1.5 0 1 1-3 0" />
      </svg>
      <span>{compact ? "OA" : "Open access"}</span>
    </span>
  );
}
