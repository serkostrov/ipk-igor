import {
  fromDayNumber,
  todayIsoDate,
  toDayNumber,
} from "@/shared/lib/business-days";
import {
  getEntityListOption,
  getEntityRelationTargetId,
  getEntityTimelineDates,
  getRecordFieldIds,
  resolveEntityFieldSource,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTimelineSetup,
  type EntityValueContext,
} from "@/entities/entity";

export type TimelineScale = "day" | "week" | "month";

/** Pixels per day for each scale. */
export const TIMELINE_DAY_WIDTH: Record<TimelineScale, number> = {
  day: 32,
  week: 14,
  month: 5,
};

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

export type TimelineGroup = {
  key: string;
  label: string;
  color: string | null;
  items: TimelineItem[];
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

function describeGroup(
  ctx: EntityValueContext,
  entity: Entity,
  field: EntityField,
  id: string,
) {
  if (!id) return { label: "Без группы", color: null };
  const source = resolveEntityFieldSource(entity, field, ctx.entities);
  if (source?.field.type === "list") {
    const option = getEntityListOption(
      resolveEntityListFieldOptions(source.field, ctx.entities),
      id,
    );
    return {
      label: option?.name ?? "Без названия",
      color: option?.color ?? null,
    };
  }
  if (source?.field.type === "relation") {
    const target = ctx.entityById.get(
      getEntityRelationTargetId(source.field) ?? "",
    );
    return {
      label: resolveRelationRecordLabel(target, id) ?? "Без названия",
      color: null,
    };
  }
  return { label: id, color: null };
}

/** Items sorted by start; grouped by the first value of the group field. */
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
  if (!groupField) return [{ key: "all", label: "", color: null, items }];

  const groups = new Map<string, TimelineGroup>();
  for (const item of items) {
    const id = getRecordFieldIds(ctx, entity, item.record, groupField)[0] ?? "";
    const group = groups.get(id);
    if (group) {
      group.items.push(item);
      continue;
    }
    groups.set(id, {
      key: id || "__none__",
      ...describeGroup(ctx, entity, groupField, id),
      items: [item],
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.key === "__none__" ? 1 : b.key === "__none__" ? -1 : 0,
  );
}

/** Visible days: all bars and today, padded and starting on a Monday. */
export function getTimelineRange(groups: TimelineGroup[]) {
  const today = toDayNumber(todayIsoDate())!;
  let min = today;
  let max = today;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.start != null) min = Math.min(min, item.start);
      if (item.end != null) max = Math.max(max, item.end);
    }
  }
  let start = min - 7;
  // 1970-01-01 was a Thursday: (day + 3) % 7 === 0 on Mondays.
  while ((start + 3) % 7 !== 0) start -= 1;
  return { start, end: max + 21, today };
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
      label: `${iso.slice(8, 10)}.${iso.slice(5, 7)}`,
      start: day,
      days: Math.min(7, range.end - day + 1),
    });
  }
  return segments;
}
