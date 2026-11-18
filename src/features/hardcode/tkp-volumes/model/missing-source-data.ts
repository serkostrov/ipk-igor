/**
 * Недостающие исходные данные — ответ отдела×стадия (ТЗ шаг 7, ТК-08).
 * Immutable after submit (stored as JSON soft key on «Расчёты отделов» row).
 */

import {
  updateEntityRecord,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";

export const TKP_MISSING_SOURCE_DATA_KEY = "__tkp_missing_source_data__";
export const TKP_MISSING_SOURCE_SUBMITTED_AT_KEY =
  "__tkp_missing_source_submitted_at__";

export type TkpMissingSourceEntry = {
  id: string;
  text: string;
  stageLabel?: string;
  departmentLabel?: string;
  submittedAt: string;
  submittedByUserId?: string | null;
};

export function parseTkpMissingSourceData(
  values: Record<string, string | undefined>,
): TkpMissingSourceEntry[] {
  const raw = values[TKP_MISSING_SOURCE_DATA_KEY]?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TkpMissingSourceEntry =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as TkpMissingSourceEntry).id === "string" &&
        typeof (item as TkpMissingSourceEntry).text === "string",
    );
  } catch {
    return [];
  }
}

export function isTkpMissingSourceLocked(
  values: Record<string, string | undefined>,
): boolean {
  return Boolean(values[TKP_MISSING_SOURCE_SUBMITTED_AT_KEY]?.trim());
}

export async function saveTkpMissingSourceData(options: {
  entity: Entity;
  record: EntityRecord;
  entries: readonly TkpMissingSourceEntry[];
  lock: boolean;
  actorUserId?: string | null;
}): Promise<void> {
  if (isTkpMissingSourceLocked(options.record.values) && options.lock) {
    // Already locked — allow only identical rewrite.
    const current = parseTkpMissingSourceData(options.record.values);
    const same =
      current.length === options.entries.length &&
      current.every(
        (item, index) => item.text === options.entries[index]?.text,
      );
    if (!same) {
      throw new Error(
        "Недостающие исходные данные уже отправлены и не редактируются",
      );
    }
    return;
  }

  const now = new Date().toISOString();
  const entries = options.entries.map((entry) => ({
    ...entry,
    submittedAt: entry.submittedAt || now,
    submittedByUserId: entry.submittedByUserId ?? options.actorUserId ?? null,
  }));

  const patch: Record<string, string> = {
    [TKP_MISSING_SOURCE_DATA_KEY]: JSON.stringify(entries),
  };
  if (options.lock) {
    patch[TKP_MISSING_SOURCE_SUBMITTED_AT_KEY] = now;
  }
  await updateEntityRecord(options.entity.id, options.record.id, patch);
}

/** Aggregate locked answers from department calculation rows for GIP view. */
export function collectTkpMissingSourceFromDeptRows(
  records: readonly EntityRecord[],
): TkpMissingSourceEntry[] {
  const out: TkpMissingSourceEntry[] = [];
  for (const record of records) {
    if (!isTkpMissingSourceLocked(record.values)) continue;
    out.push(...parseTkpMissingSourceData(record.values));
  }
  return out;
}
