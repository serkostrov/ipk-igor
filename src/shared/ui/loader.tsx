import { Loader2 } from "lucide-react";
import { cn } from "cn";

type Props = {
  /** Optional caption shown next to the spinner (e.g. «Загрузка…»). */
  label?: string;
  /** Centers the spinner in a padded block — for read/loading placeholders. */
  block?: boolean;
  className?: string;
};

/** Spinning indicator for async reads and in-flight mutations. */
export function Loader({ label, block, className }: Props) {
  const spinner = (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ? (
        <span>{label}</span>
      ) : (
        <span className="sr-only">Загрузка…</span>
      )}
    </span>
  );

  if (!block) return spinner;
  return <div className="flex items-center justify-center p-4">{spinner}</div>;
}
