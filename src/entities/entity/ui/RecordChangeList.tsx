import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import { getEntityFieldDisplayName } from "../model/field";
import {
  createEntityDraftRecord,
  formatRecordFieldValue,
  type EntityValueContext,
} from "../model/field-value";
import {
  describeEntityRecordChanges,
  type EntityRecordChangeItem,
  type EntityRecordValueChange,
} from "../model/record-changes";
import {
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  type Entity,
  type EntityField,
} from "../model/types";
import { ListValueDisplay } from "./ListSelect";

function ChangeValue({
  ctx,
  entity,
  field,
  value,
  previous = false,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  field: EntityField;
  value: string;
  previous?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground/70">—</span>;

  if (field.type === "list") {
    const presentation = resolveEntityListFieldPresentation(
      field,
      ctx.entities,
    );
    if (presentation.listUseColors && !presentation.listMultiple) {
      return (
        <ListValueDisplay
          options={resolveEntityListFieldOptions(field, ctx.entities)}
          value={value}
          showColors
          className={cn("max-w-[14rem]", previous && "opacity-60")}
        />
      );
    }
  }

  const text = formatRecordFieldValue(
    ctx,
    entity,
    createEntityDraftRecord({ [field.id]: value }),
    field,
  );
  return (
    <span
      className={cn(
        "max-w-[18rem] truncate",
        previous ? "text-muted-foreground" : "font-medium text-foreground",
      )}
      title={text}
    >
      {text}
    </span>
  );
}

function describeTabChange(
  item: Extract<EntityRecordChangeItem, { kind: "notes" | "files" }>,
) {
  const [one, few, many] =
    item.kind === "notes"
      ? ["запись", "записи", "записей"]
      : ["элемент", "элемента", "элементов"];
  const parts = [
    item.added > 0
      ? `добавлено ${item.added} ${pluralRu(item.added, one, few, many)}`
      : null,
    item.removed > 0
      ? `удалено ${item.removed} ${pluralRu(item.removed, one, few, many)}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "изменено";
}

/** «Поле: было → стало» lines for a stored change set. */
export function RecordChangeList({
  ctx,
  entity,
  changes,
  className,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  changes: Record<string, EntityRecordValueChange>;
  className?: string;
}) {
  const items = describeEntityRecordChanges(entity, changes);
  if (items.length === 0) return null;

  return (
    <ul className={cn("flex min-w-0 flex-col gap-1", className)}>
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
        >
          {item.kind === "field" ? (
            <>
              <span className="text-muted-foreground">
                {getEntityFieldDisplayName(item.field)}:
              </span>
              <ChangeValue
                ctx={ctx}
                entity={entity}
                field={item.field}
                value={item.before}
                previous
              />
              <ArrowRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="на"
              />
              <ChangeValue
                ctx={ctx}
                entity={entity}
                field={item.field}
                value={item.after}
              />
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{item.tabName}:</span>
              <span className="text-foreground">{describeTabChange(item)}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
