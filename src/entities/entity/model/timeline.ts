import {
  addBusinessDays,
  businessDaysBetween,
  extractIsoDate,
} from "@/shared/lib/business-days";
import { parseEntityDependencies, type EntityDependency } from "./field";
import type {
  Entity,
  EntityField,
  EntityRecord,
  EntityTimelineConfig,
} from "./types";

export type EntityTimelineSetup = {
  config: EntityTimelineConfig;
  startField: EntityField;
  endField: EntityField;
  groupField: EntityField | null;
  colorField: EntityField | null;
  progressField: EntityField | null;
  dependenciesField: EntityField | null;
};

export type EntityScheduleChange = {
  recordId: string;
  start: string;
  end: string;
};

function findField(entity: Pick<Entity, "fields">, fieldId: string | null) {
  return fieldId
    ? (entity.fields.find((field) => field.id === fieldId) ?? null)
    : null;
}

/** Timeline settings with resolved fields (`null` when not configured). */
export function getEntityTimelineSetup(
  entity: Pick<Entity, "fields" | "timeline">,
): EntityTimelineSetup | null {
  const config = entity.timeline;
  if (!config) return null;
  const startField = findField(entity, config.startFieldId);
  const endField = findField(entity, config.endFieldId);
  if (startField?.type !== "datetime" || endField?.type !== "datetime") {
    return null;
  }
  const dependenciesField = findField(entity, config.dependenciesFieldId);
  return {
    config,
    startField,
    endField,
    groupField: findField(entity, config.groupFieldId),
    colorField: findField(entity, config.colorFieldId),
    progressField: findField(entity, config.progressFieldId),
    dependenciesField:
      dependenciesField?.type === "dependencies" ? dependenciesField : null,
  };
}

/** Bar dates of a record; a single date becomes a one-day bar. */
export function getEntityTimelineDates(
  setup: EntityTimelineSetup,
  record: EntityRecord,
): { start: string; end: string } | null {
  const start = extractIsoDate(record.values[setup.startField.id]);
  const end = extractIsoDate(record.values[setup.endField.id]);
  if (!start && !end) return null;
  const from = start ?? end!;
  const to = end ?? start!;
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

/** Stored date with a new day; the time part (if any) is kept. */
export function withEntityDatePart(previous: string | undefined, date: string) {
  const time = previous?.trim().slice(10) ?? "";
  return time.startsWith("T") ? `${date}${time}` : date;
}

export function getEntityRecordDependencies(
  setup: EntityTimelineSetup,
  record: EntityRecord,
): EntityDependency[] {
  return setup.dependenciesField
    ? parseEntityDependencies(record.values[setup.dependenciesField.id])
    : [];
}

/** Earliest start allowed by one predecessor (business days, as in ipk-new). */
function getDependencyBound(
  dependency: EntityDependency,
  predecessor: { start: string; end: string },
  duration: number,
) {
  const bound =
    dependency.type === "FS"
      ? addBusinessDays(predecessor.end, 1)
      : dependency.type === "SS"
        ? predecessor.start
        : dependency.type === "FF"
          ? addBusinessDays(predecessor.end, -(duration - 1))
          : addBusinessDays(predecessor.start, -(duration - 1));
  return addBusinessDays(bound, dependency.lag);
}

/**
 * New dates after `rootRecordId` moves: reachable successors are placed in
 * topological order right after their latest predecessor bound, keeping their
 * duration in business days. Throws when dependencies form a cycle.
 */
export function scheduleEntityTimeline({
  setup,
  records,
  rootRecordId,
  start,
  end,
}: {
  setup: EntityTimelineSetup;
  records: readonly EntityRecord[];
  rootRecordId: string;
  start: string;
  end: string;
}): EntityScheduleChange[] {
  const dates = new Map<string, { start: string; end: string }>();
  for (const record of records) {
    const value = getEntityTimelineDates(setup, record);
    if (value) dates.set(record.id, value);
  }
  const before = dates.get(rootRecordId);
  dates.set(rootRecordId, { start, end });

  const incoming = new Map<string, EntityDependency[]>();
  const outgoing = new Map<string, string[]>();
  const ids = new Set(records.map((record) => record.id));
  for (const record of records) {
    for (const dependency of getEntityRecordDependencies(setup, record)) {
      if (!ids.has(dependency.recordId)) continue;
      incoming.set(record.id, [...(incoming.get(record.id) ?? []), dependency]);
      outgoing.set(dependency.recordId, [
        ...(outgoing.get(dependency.recordId) ?? []),
        record.id,
      ]);
    }
  }

  const reachable = new Set([rootRecordId]);
  const queue = [rootRecordId];
  while (queue.length > 0) {
    for (const next of outgoing.get(queue.shift()!) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const indegree = new Map<string, number>();
  for (const id of reachable) {
    indegree.set(
      id,
      new Set(
        (incoming.get(id) ?? [])
          .map((dependency) => dependency.recordId)
          .filter((predecessorId) => reachable.has(predecessorId)),
      ).size,
    );
  }
  const ready = [...reachable].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    order.push(current);
    for (const next of new Set(outgoing.get(current) ?? [])) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  if (order.length !== reachable.size) {
    throw new Error("Зависимости образуют цикл — график не пересчитан");
  }

  const changes: EntityScheduleChange[] = [];
  if (before?.start !== start || before?.end !== end) {
    changes.push({ recordId: rootRecordId, start, end });
  }
  for (const recordId of order) {
    if (recordId === rootRecordId) continue;
    const current = dates.get(recordId);
    const duration = current
      ? businessDaysBetween(current.start, current.end)
      : null;
    if (!current || !duration) continue;
    const bounds = (incoming.get(recordId) ?? []).flatMap((dependency) => {
      const predecessor = dates.get(dependency.recordId);
      return predecessor
        ? [getDependencyBound(dependency, predecessor, duration)]
        : [];
    });
    if (bounds.length === 0) continue;
    const nextStart = bounds.sort().at(-1)!;
    const nextEnd = addBusinessDays(nextStart, duration - 1);
    dates.set(recordId, { start: nextStart, end: nextEnd });
    if (nextStart !== current.start || nextEnd !== current.end) {
      changes.push({ recordId, start: nextStart, end: nextEnd });
    }
  }
  return changes;
}
