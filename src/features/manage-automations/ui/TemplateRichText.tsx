import { X } from "lucide-react";
import type { EntityField } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import {
  getTemplateFieldLabel,
  parseTemplateParts,
} from "../lib/template-text";

/** Compact inline field token — editor and read-only displays. */
export function TemplateFieldToken({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[10rem] items-baseline gap-0.5 rounded-[0.25rem] bg-primary/10 px-1 align-baseline text-[0.6875rem] font-medium leading-[1.15] text-primary",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="-mr-0.5 inline-flex size-3 shrink-0 translate-y-px items-center justify-center rounded-[2px] text-primary/50 transition-colors hover:bg-primary/15 hover:text-primary"
          aria-label={`Убрать ${label}`}
          onClick={onRemove}
        >
          <X className="size-2.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );
}

/** Read-only template string with compact field tokens. */
export function TemplateRichText({
  value,
  fields,
  className,
  empty = "—",
}: {
  value: string;
  fields: readonly EntityField[];
  className?: string;
  empty?: string;
}) {
  const trimmed = value.trim();
  if (!trimmed) {
    return (
      <span className={cn("text-muted-foreground", className)}>{empty}</span>
    );
  }

  const parts = parseTemplateParts(value);
  if (parts.length === 0) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={cn("min-w-0", className)}>
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return <span key={`t-${index}`}>{part.text}</span>;
        }
        return (
          <TemplateFieldToken
            key={`f-${index}-${part.id}`}
            label={getTemplateFieldLabel(fields, part.id)}
            className="mx-0.5"
          />
        );
      })}
    </span>
  );
}
