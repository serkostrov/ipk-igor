import { cn } from "@/shared/lib/cn";

/** Rounded toggle with a counter: «Все 42», «Мои 7». */
export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/25"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {count != null ? (
        <span
          className={cn(
            "tabular-nums",
            active ? "text-primary/70" : "text-muted-foreground/70",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
