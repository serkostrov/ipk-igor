import { cn } from "@/shared/lib/cn";
import { getEntityDeadlineState } from "../model/deadline";
import {
  formatRecordFieldValue,
  getRecordFieldNumber,
  type EntityValueContext,
} from "../model/field-value";
import { isEntityNumericFieldType } from "../model/field";
import type {
  Entity,
  EntityField,
  EntityNumberSignColor,
  EntityRecord,
} from "../model/types";
import { DeadlineChip } from "./DeadlineChip";
import { ProgressValue } from "./ProgressValue";
import { RelationGroupsRecordValue } from "./RelationGroupsRecordValue";

/**
 * Read-only display of a field value: progress bars, deadline chips and
 * computed values (formula / rollup / lookup / dependencies).
 */
export function RecordValue({
  ctx,
  entity,
  record,
  field,
  className,
}: {
  ctx: EntityValueContext;
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  className?: string;
}) {
  if (field.numberDisplay === "progress") {
    return (
      <ProgressValue
        value={getRecordFieldNumber(ctx, entity, record, field)}
        className={className}
      />
    );
  }

  if (field.type === "relationGroups") {
    return (
      <RelationGroupsRecordValue
        ctx={ctx}
        entity={entity}
        record={record}
        field={field}
        className={className}
      />
    );
  }

  const text = formatRecordFieldValue(ctx, entity, record, field);
  const empty = text === "—";

  if (field.type === "datetime" && field.deadline) {
    const state = getEntityDeadlineState(
      entity,
      record,
      field,
      ctx.entities,
      ctx.today,
    );
    return (
      <span
        className={cn("flex min-w-0 items-center gap-1.5", className)}
        title={empty ? undefined : text}
      >
        <span
          className={cn(
            "truncate text-sm",
            empty ? "text-muted-foreground/70" : "text-foreground",
          )}
        >
          {text}
        </span>
        <DeadlineChip state={state} />
      </span>
    );
  }

  // Formula keeps proportional digits (same look as lookups / plain text).
  const numeric =
    isEntityNumericFieldType(field.type) && field.type !== "formula";
  const signClass = field.numberSignColor
    ? getSignClass(
        field.numberSignColor,
        getRecordFieldNumber(ctx, entity, record, field),
      )
    : null;
  return (
    <span
      className={cn(
        "block truncate text-sm",
        empty ? "text-muted-foreground/70" : (signClass ?? "text-foreground"),
        numeric && "tabular-nums",
        className,
      )}
      title={empty ? undefined : text}
    >
      {text}
    </span>
  );
}

function getSignClass(color: EntityNumberSignColor, value: number | null) {
  if (value == null || value === 0) return null;
  const positiveRed = color === "positiveRed";
  return value > 0 === positiveRed ? "text-[#dc2626]" : "text-[#16a34a]";
}
