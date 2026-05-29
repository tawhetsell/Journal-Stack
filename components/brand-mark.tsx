type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <div
      className={`pointer-events-none flex items-center justify-center ${className}`.trim()}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 116"
        className="h-[88px] w-[92px] text-foreground/24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M60 12 102 35 60 58 18 35Z" />
        <path d="M60 39 102 62 60 85 18 62Z" />
        <path d="M60 66 102 89 60 112 18 89Z" />
      </svg>
    </div>
  );
}
