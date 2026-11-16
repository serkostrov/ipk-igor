/**
 * Three-way schedule sync for entity forms:
 * «Дата постановки» ↔ «Длительность, рабочих дней» ↔ «Срок (план)».
 *
 * Duration is inclusive business days (Mon–Fri), same as gantt/timeline:
 * end = addBusinessDays(start, duration - 1).
 *
 * Prefer this over a formula on the end date: formulas do not persist a
 * datetime into the record the same way, and «дата + N» is easy to get wrong.
 */

import {
  addBusinessDays,
  businessDaysBetween,
  extractIsoDate,
  toIsoDate,
} from "@/shared/lib/business-days";
import { evaluateFormula } from "./formula";
import { getEntityFieldDisplayName } from "./field";
import { withEntityDatePart } from "./timeline";
import type { Entity, EntityField } from "./types";

export type EntityScheduleFields = {
  startField: EntityField;
  durationField: EntityField;
  endField: EntityField;
};

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll(/\s+/g, " ");
}

function fieldName(field: EntityField): string {
  return normalizeName(getEntityFieldDisplayName(field));
}

function isDatetimeLike(field: EntityField): boolean {
  return field.type === "datetime";
}

function isDurationNumber(field: EntityField): boolean {
  return field.type === "number" || field.type === "formula";
}

function pickBestField(
  fields: readonly EntityField[],
  scoreOf: (field: EntityField) => number,
): EntityField | null {
  let best: EntityField | null = null;
  let bestScore = 0;
  for (const field of fields) {
    const score = scoreOf(field);
    if (score > bestScore) {
      best = field;
      bestScore = score;
    }
  }
  return best;
}

function scoreStartField(field: EntityField): number {
  if (!isDatetimeLike(field)) return 0;
  const name = fieldName(field);
  if (name === "дата постановки") return 100;
  if (name.includes("дата постановки")) return 90;
  if (name === "постановка") return 70;
  if (name === "начало работ") return 60;
  if (name === "дата начала") return 50;
  if (name.includes("постановк")) return 40;
  if (name.includes("дата начала") || name === "начало") return 30;
  return 0;
}

function scoreDurationField(field: EntityField): number {
  if (!isDurationNumber(field)) return 0;
  const name = fieldName(field);
  if (name.includes("длительность") && name.includes("рабоч")) return 100;
  if (name.includes("длительность") && name.includes("дн")) return 80;
  if (name === "длительность") return 50;
  if (name.includes("длительность")) return 40;
  if (name.includes("рабоч") && name.includes("дн")) return 30;
  return 0;
}

function scoreEndField(
  field: EntityField,
  startFieldId: string | null,
): number {
  if (!isDatetimeLike(field)) return 0;
  if (startFieldId && field.id === startFieldId) return 0;
  const name = fieldName(field);
  if (name === "срок (план)" || name === "срок план") return 100;
  if (name.includes("срок (план)") || name.includes("срок план")) return 90;
  if (name.includes("срок") && name.includes("план")) return 80;
  if (name === "срок выполнения") return 60;
  if (name === "дедлайн") return 55;
  if (name === "дата окончания" || name === "окончание") return 50;
  if (name === "срок") return 40;
  if (name.includes("срок")) return 30;
  if (name.includes("окончан") || name.includes("конец")) return 20;
  return 0;
}

/**
 * Soft-resolve the schedule trio by Russian field titles (best match wins).
 * Returns null when any piece is missing.
 */
export function resolveEntityScheduleFields(
  entity: Entity,
): EntityScheduleFields | null {
  const startField = pickBestField(entity.fields, scoreStartField);
  const durationField = pickBestField(entity.fields, scoreDurationField);
  const endField = pickBestField(entity.fields, (field) =>
    scoreEndField(field, startField?.id ?? null),
  );

  if (!startField || !durationField || !endField) return null;
  if (
    startField.id === endField.id ||
    startField.id === durationField.id ||
    endField.id === durationField.id
  ) {
    return null;
  }
  return { startField, durationField, endField };
}

function parseDurationDays(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const days = Math.round(value);
  return days >= 1 ? days : null;
}

function formatDurationDays(days: number): string {
  return String(Math.max(1, Math.round(days)));
}

function resolveDurationDays(
  entity: Entity,
  values: Record<string, string>,
  durationField: EntityField,
): number | null {
  const stored = parseDurationDays(values[durationField.id]);
  if (stored != null) return stored;
  if (durationField.type !== "formula") return null;
  const expression = durationField.formula?.expression?.trim() ?? "";
  if (!expression) return null;
  const result = evaluateFormula(
    expression,
    (fieldId) => {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field) return null;
      if (field.type === "datetime") {
        return extractIsoDate(values[field.id]);
      }
      if (field.type === "number" || field.type === "formula") {
        return parseDurationDays(values[field.id]);
      }
      const raw = (values[field.id] ?? "").trim();
      return raw || null;
    },
    toIsoDate(new Date()),
  );
  if (typeof result === "number" && Number.isFinite(result)) {
    const days = Math.round(result);
    return days >= 1 ? days : null;
  }
  if (typeof result === "string") return parseDurationDays(result);
  return null;
}

function fillEndFromStartAndDuration(
  values: Record<string, string>,
  startField: EntityField,
  durationField: EntityField,
  endField: EntityField,
  entity: Entity,
): Record<string, string> {
  const start = extractIsoDate(values[startField.id]);
  const duration = resolveDurationDays(entity, values, durationField);
  if (!start || duration == null) return values;
  const nextEnd = addBusinessDays(start, duration - 1);
  const stamped = withEntityDatePart(values[endField.id], nextEnd);
  if ((values[endField.id] ?? "") === stamped) return values;
  return { ...values, [endField.id]: stamped };
}

/**
 * Fill missing schedule values when the other two sides are known.
 * Safe to run on form open (defaults) and after any field edit.
 */
export function reconcileEntityScheduleValues(
  entity: Entity,
  values: Record<string, string>,
): Record<string, string> {
  const schedule = resolveEntityScheduleFields(entity);
  if (!schedule) return values;

  const { startField, durationField, endField } = schedule;
  const start = extractIsoDate(values[startField.id]);
  const end = extractIsoDate(values[endField.id]);
  const duration = resolveDurationDays(entity, values, durationField);

  if (start && duration != null) {
    return fillEndFromStartAndDuration(
      values,
      startField,
      durationField,
      endField,
      entity,
    );
  }

  if (start && end && duration == null) {
    const days = businessDaysBetween(start, end);
    if (days != null && days >= 1) {
      const next = formatDurationDays(days);
      if ((values[durationField.id] ?? "") === next) return values;
      return { ...values, [durationField.id]: next };
    }
  }

  return values;
}

/**
 * After a user edits one schedule field, recompute the dependent ones
 * using business days. No-op when the entity has no schedule trio.
 */
export function applyEntityScheduleFieldSync(
  entity: Entity,
  values: Record<string, string>,
  changedFieldId: string,
): Record<string, string> {
  const schedule = resolveEntityScheduleFields(entity);
  if (!schedule) return values;

  const { startField, durationField, endField } = schedule;
  if (
    changedFieldId !== startField.id &&
    changedFieldId !== durationField.id &&
    changedFieldId !== endField.id
  ) {
    // Still fill end when start+duration arrived via defaults / soft-fill.
    return reconcileEntityScheduleValues(entity, values);
  }

  const start = extractIsoDate(values[startField.id]);
  const end = extractIsoDate(values[endField.id]);
  const duration = resolveDurationDays(entity, values, durationField);
  const next = { ...values };

  if (changedFieldId === endField.id) {
    // End edited → refresh duration from the date span.
    if (start && end) {
      const days = businessDaysBetween(start, end);
      if (days != null && days >= 1) {
        next[durationField.id] = formatDurationDays(days);
      }
    }
    return next;
  }

  if (changedFieldId === durationField.id) {
    // Duration edited → refresh planned end from start.
    if (start && duration != null) {
      const nextEnd = addBusinessDays(start, duration - 1);
      next[endField.id] = withEntityDatePart(values[endField.id], nextEnd);
    }
    return next;
  }

  // Start edited: prefer keeping duration and moving the end;
  // if duration is empty, derive it from the existing end.
  if (start && duration != null) {
    const nextEnd = addBusinessDays(start, duration - 1);
    next[endField.id] = withEntityDatePart(values[endField.id], nextEnd);
  } else if (start && end) {
    const days = businessDaysBetween(start, end);
    if (days != null && days >= 1) {
      next[durationField.id] = formatDurationDays(days);
    }
  }
  return next;
}
