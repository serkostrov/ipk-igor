import { getEntityRelationTargetId } from "./field";
import {
  resolveEntityFieldSource,
  type EntityValueContext,
} from "./field-value";
import {
  getEntityListOption,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "./types";

export type TimelineItem = {
  record: EntityRecord;
  /** Day numbers (see `toDayNumber`); `null` — no dates. */
  start: number | null;
  end: number | null;
};

export type TimelineGroupKind = "cluster" | "split" | "row";

export type TimelineGroup = {
  key: string;
  label: string;
  color: string | null;
  kind: TimelineGroupKind;
  /** Option / related record id for this node (`__none__` when empty). */
  optionId: string;
  /** All leaf items under this node (for period sums). */
  items: TimelineItem[];
  /** Nested groups; empty for leaf «Строки» groups. */
  children: TimelineGroup[];
  depth: number;
};

function describeOption(
  ctx: EntityValueContext,
  owner: Pick<Entity, "id" | "fields">,
  field: EntityField,
  id: string,
) {
  if (!id) return { label: "Без значения", color: null as string | null };
  const source = resolveEntityFieldSource(owner, field, ctx.entities);
  const resolved = source?.field ?? field;
  if (resolved.type === "list") {
    const option = getEntityListOption(
      resolveEntityListFieldOptions(resolved, ctx.entities),
      id,
    );
    return {
      label: option?.name ?? "Без названия",
      color: option?.color ?? null,
    };
  }
  if (resolved.type === "relation" || resolved.type === "belonging") {
    const target = ctx.entityById.get(
      getEntityRelationTargetId(resolved) ?? "",
    );
    return {
      label:
        resolveRelationRecordLabel(target, id, ctx.entities, ctx) ??
        "Без названия",
      color: null as string | null,
    };
  }
  return { label: id, color: null as string | null };
}

export function createTimelineOptionGroup(
  ctx: EntityValueContext,
  owner: Entity,
  field: EntityField,
  kind: TimelineGroupKind,
  optionId: string,
  path: string,
  depth: number,
): TimelineGroup {
  const meta = describeOption(
    ctx,
    owner,
    field,
    optionId === "__none__" ? "" : optionId,
  );
  return {
    key: `${path}${kind}:${optionId}`,
    label: meta.label,
    color: meta.color,
    kind,
    optionId,
    items: [],
    children: [],
    depth,
  };
}
