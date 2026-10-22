import {
  fromDayNumber,
  todayIsoDate,
  toDayNumber,
} from "@/shared/lib/business-days";
import { formatDateDisplay } from "@/shared/lib/format-date";
import {
  ENTITY_KANBAN_EMPTY_COLUMN_ID,
  getEntityKanbanColumns,
  getEntityListOption,
  getEntityRelationTargetId,
  getEntityTimelineDates,
  getRecordFieldIds,
  getTimelineRowTargetEntity,
  parseEntityTableParentId,
  resolveEntityFieldSource,
  resolveEntityListFieldOptions,
  resolveEntityTableParentField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTimelineSetup,
  type EntityValueContext,
} from "@/entities/entity";

export type TimelineScale = "day" | "week" | "month";

/**
 * Fixed width of one date column (day / week / month cell).
 * Wide enough for sums like «1 225 000 ₽»; row height stays compact.
 */
export const TIMELINE_COLUMN_WIDTH = 100;

export function parseTimelineScale(value: unknown): TimelineScale | null {
  return value === "day" || value === "week" || value === "month"
    ? value
    : null;
}

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

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

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
      label: resolveRelationRecordLabel(target, id) ?? "Без названия",
      color: null as string | null,
    };
  }
  return { label: id, color: null as string | null };
}

function relatedRowRecord(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  groupField: EntityField,
  target: Entity,
): EntityRecord | null {
  const id = getRecordFieldIds(ctx, entity, record, groupField)[0];
  if (!id) return null;
  return target.records.find((item) => item.id === id) ?? null;
}

type NestLevel = {
  kind: TimelineGroupKind;
  field: EntityField;
  /** Entity that owns the field (current or related row target). */
  owner: Entity;
  /** Read value from related row record instead of the operation. */
  fromRelated: boolean;
};

type AncestorConstraint = {
  field: EntityField;
  owner: Entity;
  valueId: string;
};

/**
 * Report order matches DDS-style tables:
 * Группировать по → Разделять на → Строки.
 */
function buildLevels(
  ctx: EntityValueContext,
  entity: Entity,
  setup: EntityTimelineSetup,
): NestLevel[] {
  const groupField = setup.groupField;
  if (!groupField) return [];

  const target = getTimelineRowTargetEntity(entity, groupField, ctx.entities);
  const levels: NestLevel[] = [];

  if (target && setup.clusterFieldId) {
    const field = target.fields.find(
      (item) => item.id === setup.clusterFieldId,
    );
    if (field) {
      levels.push({
        kind: "cluster",
        field,
        owner: target,
        fromRelated: true,
      });
    }
  }
  if (target && setup.splitFieldId) {
    const field = target.fields.find((item) => item.id === setup.splitFieldId);
    if (field) {
      levels.push({
        kind: "split",
        field,
        owner: target,
        fromRelated: true,
      });
    }
  }
  levels.push({
    kind: "row",
    field: groupField,
    owner: entity,
    fromRelated: false,
  });
  return levels;
}

function relatedMatchesAncestors(
  ctx: EntityValueContext,
  related: EntityRecord,
  target: Entity,
  ancestors: AncestorConstraint[],
) {
  for (const ancestor of ancestors) {
    if (!ancestor.field) continue;
    const id = getRecordFieldIds(ctx, target, related, ancestor.field)[0] ?? "";
    if ((id || "__none__") !== (ancestor.valueId || "__none__")) return false;
  }
  return true;
}

function levelValueId(
  ctx: EntityValueContext,
  entity: Entity,
  item: TimelineItem,
  level: NestLevel,
  groupField: EntityField,
  target: Entity | null,
): string {
  if (!level.fromRelated) {
    return getRecordFieldIds(ctx, entity, item.record, level.field)[0] ?? "";
  }
  if (!target) return "";
  const related = relatedRowRecord(
    ctx,
    entity,
    item.record,
    groupField,
    target,
  );
  if (!related) return "";
  return getRecordFieldIds(ctx, target, related, level.field)[0] ?? "";
}

function nestItems(
  ctx: EntityValueContext,
  entity: Entity,
  setup: EntityTimelineSetup,
  items: TimelineItem[],
  levels: NestLevel[],
  depth: number,
  path: string,
  target: Entity | null,
  groupField: EntityField,
  ancestors: AncestorConstraint[],
): TimelineGroup[] {
  const [level, ...rest] = levels;
  if (!level) {
    return [];
  }

  const groups = new Map<string, TimelineGroup>();

  if (setup.config.showAllGroupOptions) {
    for (const column of getEntityKanbanColumns(level.field, ctx.entities)) {
      if (column.id === ENTITY_KANBAN_EMPTY_COLUMN_ID) continue;
      // Leaf «Строки»: only seed articles that match parent split/cluster.
      if (!level.fromRelated && target && ancestors.length > 0) {
        const related = target.records.find(
          (record) => record.id === column.id,
        );
        if (
          !related ||
          !relatedMatchesAncestors(ctx, related, target, ancestors)
        ) {
          continue;
        }
      }
      const optionId = column.id || "__none__";
      groups.set(optionId, {
        key: `${path}${level.kind}:${optionId}`,
        label: column.label,
        color: column.color ?? null,
        kind: level.kind,
        optionId,
        items: [],
        children: [],
        depth,
      });
    }
  }

  for (const item of items) {
    const id = levelValueId(ctx, entity, item, level, groupField, target);
    const bucket = id || "__none__";
    let group = groups.get(bucket);
    if (!group) {
      const meta = describeOption(ctx, level.owner, level.field, id);
      group = {
        key: `${path}${level.kind}:${bucket}`,
        label: meta.label,
        color: meta.color,
        kind: level.kind,
        optionId: bucket,
        items: [],
        children: [],
        depth,
      };
      groups.set(bucket, group);
    }
    group.items.push(item);
  }

  const ordered = [...groups.values()].sort((a, b) =>
    a.optionId === "__none__" ? 1 : b.optionId === "__none__" ? -1 : 0,
  );

  if (rest.length === 0) {
    return level.kind === "row"
      ? nestTimelineRowGroupsByTableParent(
          ctx,
          ordered,
          target,
          depth,
          path,
          ancestors,
        )
      : ordered;
  }

  return ordered.map((group) => {
    const nextAncestors = level.fromRelated
      ? [
          ...ancestors,
          {
            field: level.field,
            owner: level.owner,
            valueId: group.optionId === "__none__" ? "" : group.optionId,
          },
        ]
      : ancestors;
    return {
      ...group,
      children: nestItems(
        ctx,
        entity,
        setup,
        group.items,
        rest,
        depth + 1,
        `${group.key}/`,
        target,
        groupField,
        nextAncestors,
      ),
    };
  });
}

/**
 * Nest «Строки» by the related entity's table parent field (belonging /
 * self-relation), matching the entity table hierarchy with expand/collapse.
 */
function nestTimelineRowGroupsByTableParent(
  ctx: EntityValueContext,
  groups: TimelineGroup[],
  target: Entity | null,
  depth: number,
  path: string,
  ancestors: AncestorConstraint[],
): TimelineGroup[] {
  if (!target) return groups;
  const parentField = resolveEntityTableParentField(target);
  if (!parentField) return groups;

  const noneGroups = groups.filter((group) => group.optionId === "__none__");
  const withIds = groups.filter((group) => group.optionId !== "__none__");
  if (withIds.length === 0) return groups;

  const byId = new Map(
    withIds.map((group) => [
      group.optionId,
      { ...group, children: [] as TimelineGroup[] },
    ]),
  );
  const parentIdOf = new Map<string, string>();
  for (const record of target.records) {
    parentIdOf.set(
      record.id,
      parseEntityTableParentId(record.values[parentField.id]),
    );
  }

  let added = true;
  while (added) {
    added = false;
    for (const id of [...byId.keys()]) {
      const parentId = parentIdOf.get(id) ?? "";
      if (!parentId || byId.has(parentId)) continue;
      const record = target.records.find((item) => item.id === parentId);
      if (!record) continue;
      if (
        ancestors.length > 0 &&
        !relatedMatchesAncestors(ctx, record, target, ancestors)
      ) {
        continue;
      }
      byId.set(parentId, {
        key: `${path}row:${parentId}`,
        label: resolveRelationRecordLabel(target, parentId) ?? "Без названия",
        color: null,
        kind: "row",
        optionId: parentId,
        items: [],
        children: [],
        depth,
      });
      added = true;
    }
  }

  const order = [
    ...withIds.map((group) => group.optionId),
    ...[...byId.keys()].filter(
      (id) => !withIds.some((group) => group.optionId === id),
    ),
  ];
  const idSet = new Set(byId.keys());

  function mergeItems(items: TimelineItem[]) {
    const seen = new Set<string>();
    const merged: TimelineItem[] = [];
    for (const item of items) {
      if (seen.has(item.record.id)) continue;
      seen.add(item.record.id);
      merged.push(item);
    }
    return merged;
  }

  function childrenOf(parentId: string) {
    return order.filter((id) => (parentIdOf.get(id) ?? "") === parentId);
  }

  function buildNode(id: string, nodeDepth: number): TimelineGroup {
    const base = byId.get(id)!;
    const childIds = childrenOf(id);
    if (childIds.length === 0) {
      return { ...base, children: [], depth: nodeDepth };
    }
    const children = childIds.map((childId) =>
      buildNode(childId, nodeDepth + 1),
    );
    return {
      ...base,
      depth: nodeDepth,
      children,
      items: mergeItems([
        ...base.items,
        ...children.flatMap((child) => child.items),
      ]),
    };
  }

  const roots = order.filter((id) => {
    const parentId = parentIdOf.get(id) ?? "";
    return !parentId || !idSet.has(parentId);
  });

  return [...roots.map((id) => buildNode(id, depth)), ...noneGroups];
}

/** Items sorted by start; nested by split → cluster → rows. */
export function buildTimelineGroups(
  ctx: EntityValueContext,
  entity: Entity,
  setup: EntityTimelineSetup,
  records: readonly EntityRecord[],
): TimelineGroup[] {
  const items = records
    .map((record) => {
      const dates = getEntityTimelineDates(setup, record);
      return {
        record,
        start: dates ? toDayNumber(dates.start) : null,
        end: dates ? toDayNumber(dates.end) : null,
      };
    })
    .sort(
      (a, b) =>
        (a.start ?? Number.POSITIVE_INFINITY) -
        (b.start ?? Number.POSITIVE_INFINITY),
    );

  const groupField = setup.groupField;
  if (!groupField) {
    return [
      {
        key: "all",
        label: "",
        color: null,
        kind: "row" as const,
        optionId: "all",
        items,
        children: [],
        depth: 0,
      },
    ];
  }

  const target = getTimelineRowTargetEntity(entity, groupField, ctx.entities);
  const levels = buildLevels(ctx, entity, setup);
  return nestItems(
    ctx,
    entity,
    setup,
    items,
    levels,
    0,
    "",
    target,
    groupField,
    [],
  );
}

function walkGroupItems(
  groups: TimelineGroup[],
  visit: (item: TimelineItem) => void,
) {
  for (const group of groups) {
    if (group.children.length > 0) {
      walkGroupItems(group.children, visit);
    } else {
      for (const item of group.items) visit(item);
    }
  }
}

/** Extra days before/after data — enough to scroll, not endless. */
const TIMELINE_RANGE_PAD: Record<TimelineScale, number> = {
  day: 56, // 8 weeks each side
  week: 126, // ~18 weeks each side
  month: 366, // ~12 months each side
};

/** Hard cap on total span so a wide data range stays usable. */
const TIMELINE_RANGE_MAX_SPAN: Record<TimelineScale, number> = {
  day: 450,
  week: 900,
  month: 1500,
};

function alignTimelineRangeStart(day: number, scale: TimelineScale) {
  if (scale === "month") {
    const iso = fromDayNumber(day);
    const [year, month] = iso.split("-").map(Number);
    return toDayNumber(
      `${year}-${String(month).padStart(2, "0")}-01`,
    )!;
  }
  let start = day;
  // 1970-01-01 was a Thursday: (day + 3) % 7 === 0 on Mondays.
  while ((start + 3) % 7 !== 0) start -= 1;
  return start;
}

/** Visible days: data + today, with finite padding around for scrolling. */
export function getTimelineRange(
  groups: TimelineGroup[],
  scale: TimelineScale = "day",
) {
  const today = toDayNumber(todayIsoDate())!;
  let min = today;
  let max = today;
  walkGroupItems(groups, (item) => {
    if (item.start != null) min = Math.min(min, item.start);
    if (item.end != null) max = Math.max(max, item.end);
  });

  const pad = TIMELINE_RANGE_PAD[scale];
  let start = alignTimelineRangeStart(min - pad, scale);
  let end = max + pad;

  const maxSpan = TIMELINE_RANGE_MAX_SPAN[scale];
  if (end - start > maxSpan) {
    const core = Math.max(max - min, 0);
    const room = Math.max(maxSpan - core, 0);
    const before = Math.floor(room / 2);
    start = alignTimelineRangeStart(min - before, scale);
    end = start + maxSpan;
  }

  return { start, end, today };
}

export type TimelineSegment = {
  key: string;
  label: string;
  start: number;
  days: number;
};

export function getTimelineMonths(range: { start: number; end: number }) {
  const segments: TimelineSegment[] = [];
  let day = range.start;
  while (day <= range.end) {
    const iso = fromDayNumber(day);
    const [year, month] = iso.split("-").map(Number);
    const next = toDayNumber(
      `${month === 12 ? year! + 1 : year}-${String(month === 12 ? 1 : month! + 1).padStart(2, "0")}-01`,
    )!;
    const end = Math.min(next - 1, range.end);
    segments.push({
      key: iso.slice(0, 7),
      label: `${MONTHS[month! - 1]} ${year}`,
      start: day,
      days: end - day + 1,
    });
    day = end + 1;
  }
  return segments;
}

export function getTimelineWeeks(range: { start: number; end: number }) {
  const segments: TimelineSegment[] = [];
  for (let day = range.start; day <= range.end; day += 7) {
    const iso = fromDayNumber(day);
    segments.push({
      key: iso,
      label: formatDateDisplay(iso),
      start: day,
      days: Math.min(7, range.end - day + 1),
    });
  }
  return segments;
}

/** Date columns for the selected scale (one cell per period). */
export function getTimelineColumns(
  scale: TimelineScale,
  range: { start: number; end: number },
): TimelineSegment[] {
  if (scale === "day") {
    const columns: TimelineSegment[] = [];
    for (let day = range.start; day <= range.end; day += 1) {
      const iso = fromDayNumber(day);
      columns.push({
        key: String(day),
        label: iso.slice(8, 10),
        start: day,
        days: 1,
      });
    }
    return columns;
  }
  if (scale === "week") return getTimelineWeeks(range);
  return getTimelineMonths(range);
}

/** Whether the item's start date falls into the column period. */
export function timelineItemInColumn(
  item: Pick<TimelineItem, "start">,
  column: Pick<TimelineSegment, "start" | "days">,
) {
  if (item.start == null) return false;
  return item.start >= column.start && item.start < column.start + column.days;
}
