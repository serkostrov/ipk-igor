import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { EntitySchemaChangeItem } from "../model/schema-changes";

function ChangeText({
  value,
  previous = false,
}: {
  value: string | null;
  previous?: boolean;
}) {
  if (value == null || value === "") {
    return <span className="text-muted-foreground/70">—</span>;
  }
  return (
    <span
      className={cn(
        "max-w-[18rem] truncate",
        previous ? "text-muted-foreground" : "font-medium text-foreground",
      )}
      title={value}
    >
      {value}
    </span>
  );
}

/** «Метка: было → стало» for schema version diffs. */
export function SchemaChangeList({
  items,
  className,
}: {
  items: EntitySchemaChangeItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Нет изменений
      </p>
    );
  }

  return (
    <ul className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
        >
          <span className="text-muted-foreground">{item.label}:</span>
          {item.before == null && item.after != null ? (
            <ChangeText value={item.after} />
          ) : item.after == null && item.before != null ? (
            <>
              <ChangeText value={item.before} previous />
              <span className="text-muted-foreground">удалено</span>
            </>
          ) : (
            <>
              <ChangeText value={item.before} previous />
              <ArrowRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="на"
              />
              <ChangeText value={item.after} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
