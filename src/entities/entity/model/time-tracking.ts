import { extractIsoDate, listBusinessDays } from "@/shared/lib/business-days";
import { parseLocalDatetime } from "@/shared/lib/datetime";
import {
  parseEntityDecimal,
  serializeEntityDecimal,
  serializeEntityRelationIds,
} from "./field";
import {
  isEntityNameField,
  parseEntityListValueIds,
  parseEntityRelationIds,
  type Entity,
  type EntityRecord,
  type EntityTimeTracking,
} from "./types";

export type EntityTimeTrackingSetup = {
  config: EntityTimeTracking;
  entryEntity: Entity;
};

export type EntityRunningTimer = EntityTimeTrackingSetup & {
  /** Tracked entity and record (record is `null` when it was deleted). */
  entity: Entity;
  record: EntityRecord | null;
  entry: EntityRecord;
  startedAt: Date;
};

export type EntityTimeEntryInput = {
  userRecordId: string;
  start: string;
  end?: string;
  hours?: number;
  method: "timer" | "manual";
  comment?: string;
};

/** Valid time tracking of an entity (entry entity and its fields exist). */
export function getEntityTimeTracking(
  entity: Pick<Entity, "timeTracking">,
  entities: readonly Entity[],
): EntityTimeTrackingSetup | null {
  const config = entity.timeTracking;
  if (!config) return null;
  const entryEntity = entities.find((item) => item.id === config.entryEntityId);
  if (!entryEntity) return null;
  const fieldIds = new Set(entryEntity.fields.map((field) => field.id));
  const required = [
    config.linkFieldId,
    config.employeeFieldId,
    config.startFieldId,
    config.endFieldId,
    config.hoursFieldId,
  ];
  return required.every((id) => fieldIds.has(id))
    ? { config, entryEntity }
    : null;
}

function isRunningEntry(
  entry: EntityRecord,
  config: EntityTimeTracking,
  userRecordId: string,
) {
  return (
    parseEntityRelationIds(entry.values[config.employeeFieldId]).includes(
      userRecordId,
    ) &&
    Boolean(entry.values[config.startFieldId]?.trim()) &&
    !entry.values[config.endFieldId]?.trim()
  );
}

/** The user's started and not stopped entry (one per user). */
export function findRunningTimer(
  entities: readonly Entity[],
  userRecordId: string | null,
): EntityRunningTimer | null {
  if (!userRecordId) return null;
  for (const entity of entities) {
    const setup = getEntityTimeTracking(entity, entities);
    if (!setup) continue;
    const { config, entryEntity } = setup;
    for (const entry of entryEntity.records) {
      if (!isRunningEntry(entry, config, userRecordId)) continue;
      const sourceId = parseEntityRelationIds(
        entry.values[config.linkFieldId],
      )[0];
      const startedAt = parseLocalDatetime(entry.values[config.startFieldId]);
      if (!sourceId || !startedAt) continue;
      return {
        ...setup,
        entity,
        record: entity.records.find((record) => record.id === sourceId) ?? null,
        entry,
        startedAt,
      };
    }
  }
  return null;
}

/** Timer is allowed in the record's current status. */
export function canStartEntityTimer(
  config: EntityTimeTracking,
  record: EntityRecord,
) {
  if (!config.statusFieldId || config.statusOptionIds.length === 0) {
    return true;
  }
  const value = parseEntityListValueIds(record.values[config.statusFieldId])[0];
  return value != null && config.statusOptionIds.includes(value);
}

/** Hours between two stored datetimes, rounded to hundredths. */
export function getTimeEntryHours(start: Date, end: Date) {
  return (
    Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100
  );
}

export type EntityTimeEntryRow = {
  entry: EntityRecord;
  startedAt: Date | null;
  endedAt: Date | null;
  hours: number | null;
  employeeId: string | null;
  comment: string | null;
  running: boolean;
};

/** Time entries linked to one record, newest first. `null` — tracking not set up. */
export function listRecordTimeEntries(
  entity: Pick<Entity, "timeTracking">,
  recordId: string,
  entities: readonly Entity[],
): EntityTimeEntryRow[] | null {
  const setup = getEntityTimeTracking(entity, entities);
  if (!setup) return null;
  const { config, entryEntity } = setup;
  const rows: EntityTimeEntryRow[] = [];
  for (const entry of entryEntity.records) {
    if (
      !parseEntityRelationIds(entry.values[config.linkFieldId]).includes(
        recordId,
      )
    ) {
      continue;
    }
    const startedAt = parseLocalDatetime(entry.values[config.startFieldId]);
    const endedAt = parseLocalDatetime(entry.values[config.endFieldId]);
    const hoursRaw = parseEntityDecimal(
      entry.values[config.hoursFieldId] ?? "",
    );
    const employeeId =
      parseEntityRelationIds(entry.values[config.employeeFieldId])[0] ?? null;
    const comment = config.commentFieldId
      ? entry.values[config.commentFieldId]?.trim() || null
      : null;
    const running = Boolean(startedAt) && !endedAt;
    rows.push({
      entry,
      startedAt,
      endedAt,
      hours: Number.isFinite(hoursRaw) ? hoursRaw : null,
      employeeId,
      comment,
      running,
    });
  }
  rows.sort((a, b) => {
    const aMs = a.startedAt?.getTime() ?? 0;
    const bMs = b.startedAt?.getTime() ?? 0;
    return bMs - aMs;
  });
  return rows;
}

/** Values of a new entry: name and context fields come from the record. */
export function buildTimeEntryValues(
  entity: Entity,
  record: EntityRecord,
  { config, entryEntity }: EntityTimeTrackingSetup,
  input: EntityTimeEntryInput,
): Record<string, string> {
  const values: Record<string, string> = {};
  const entryName = entryEntity.fields.find((field) =>
    isEntityNameField(field),
  );
  const recordName = entity.fields.find((field) => isEntityNameField(field));
  if (entryName && recordName) {
    values[entryName.id] = (record.values[recordName.id] ?? "").trim();
  }
  for (const { sourceFieldId, targetFieldId } of config.context) {
    values[targetFieldId] = record.values[sourceFieldId] ?? "";
  }
  values[config.linkFieldId] = serializeEntityRelationIds([record.id]);
  values[config.employeeFieldId] = serializeEntityRelationIds([
    input.userRecordId,
  ]);
  values[config.startFieldId] = input.start;
  if (input.end) values[config.endFieldId] = input.end;
  if (input.hours != null) {
    values[config.hoursFieldId] = serializeEntityDecimal(input.hours);
  }
  const methodOptionId =
    input.method === "timer" ? config.timerOptionId : config.manualOptionId;
  if (config.methodFieldId && methodOptionId) {
    values[config.methodFieldId] = methodOptionId;
  }
  if (config.commentFieldId && input.comment?.trim()) {
    values[config.commentFieldId] = input.comment.trim();
  }
  return values;
}

/** Hours already logged by the user per local day (all tracked entities). */
export function getLoggedHoursByDay(
  entryEntity: Entity,
  config: EntityTimeTracking,
  userRecordId: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of entryEntity.records) {
    if (
      !parseEntityRelationIds(entry.values[config.employeeFieldId]).includes(
        userRecordId,
      )
    ) {
      continue;
    }
    const day = extractIsoDate(entry.values[config.startFieldId]);
    const hours = parseEntityDecimal(entry.values[config.hoursFieldId] ?? "");
    if (!day || !Number.isFinite(hours)) continue;
    result.set(day, (result.get(day) ?? 0) + hours);
  }
  return result;
}

export type ManualTimePlan = {
  days: string[];
  /** Days where logged + new hours exceed the daily limit. */
  overLimitDays: string[];
  totalHours: number;
};

/** Business days of the range and the days that break the daily limit. */
export function planManualTimeEntries({
  dateFrom,
  dateTo,
  hoursPerDay,
  dailyLimitHours,
  loggedByDay,
}: {
  dateFrom: string;
  dateTo: string;
  hoursPerDay: number;
  dailyLimitHours: number;
  loggedByDay: Map<string, number>;
}): ManualTimePlan {
  const days =
    hoursPerDay > 0 ? listBusinessDays(dateFrom, dateTo || dateFrom) : [];
  const overLimitDays =
    dailyLimitHours > 0
      ? days.filter(
          (day) =>
            (loggedByDay.get(day) ?? 0) + hoursPerDay > dailyLimitHours + 1e-9,
        )
      : [];
  return {
    days,
    overLimitDays,
    totalHours: Math.round(days.length * hoursPerDay * 100) / 100,
  };
}
