import { cn } from "@/lib/utils";

// The mark is the product in miniature: two ends joined by a direct wire.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 10" className="h-2.5 w-7" aria-hidden="true">
        <defs>
          <linearGradient id="wordmark-wire" x1="4" x2="24" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--you)" />
            <stop offset="1" stopColor="var(--them)" />
          </linearGradient>
        </defs>
        <line x1="4" y1="5" x2="24" y2="5" stroke="url(#wordmark-wire)" strokeWidth="1.5" />
        <circle cx="4" cy="5" r="3" fill="var(--you)" />
        <circle cx="24" cy="5" r="3" fill="var(--them)" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight font-stretch-expanded text-foreground">
        Kasi
        <span className="ml-0.5 font-mono text-xs font-medium tracking-normal text-muted-foreground">
          p2p
        </span>
      </span>
    </span>
  );
}
