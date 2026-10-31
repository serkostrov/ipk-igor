/**
 * Match related entities for «Разбор ТКП» (dept calcs) and GIP duration fields.
 */

import {
  getEntityFieldDisplayName,
  isEntityNumericFieldType,
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { isDeptCalculationsEntity } from "../../tkp-gip/match";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function findField(
  entity: Entity,
  keys: readonly string[],
  predicate?: (field: EntityField) => boolean,
): EntityField | null {
  return (
    entity.fields.find((field) => {
      if (predicate && !predicate(field)) return false;
      const name = normalizeName(getEntityFieldDisplayName(field));
      return keys.some((key) => {
        const needle = normalizeName(key);
        return name === needle || name.includes(needle);
      });
    }) ?? null
  );
}

export function findLinkedEntityByPredicate(
  host: Entity,
  entities: readonly Entity[],
  predicate: (entity: Entity) => boolean,
): Entity | null {
  for (const tab of host.tabs) {
    if (!isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) continue;
    const linked = entities.find((item) => item.id === tab.linkedEntityId);
    if (linked && predicate(linked)) return linked;
  }
  return (
    entities.find(
      (item) =>
        item.parentEntityId === host.id &&
        predicate(item) &&
        item.id !== host.id,
    ) ?? null
  );
}

export function findDeptCalculationsLinkedEntity(
  host: Entity,
  entities: readonly Entity[],
): Entity | null {
  return findLinkedEntityByPredicate(host, entities, isDeptCalculationsEntity);
}

/** Soft key for GIP execution duration on «Разбор ТКП» record.values */
export const TKP_GIP_EXECUTION_DURATION_KEY =
  "__tkp_gip_execution_duration_days__";

export function readTkpGipExecutionDurationDays(
  values: Record<string, string>,
  entity: Entity,
): number | null {
  const field = findField(
    entity,
    [
      "общий срок расчета",
      "общий срок расчёта",
      "общий срок выполнения гипа",
      "срок выполнения гипа",
      "общий срок выполнения",
    ],
    (f) => isEntityNumericFieldType(f.type),
  );
  if (field) {
    const raw = values[field.id]?.trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const soft = values[TKP_GIP_EXECUTION_DURATION_KEY]?.trim();
  if (!soft) return null;
  const parsed = Number(soft.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function writeTkpGipExecutionDurationPatch(
  entity: Entity,
  days: number,
): Record<string, string> {
  const field = findField(
    entity,
    [
      "общий срок расчета",
      "общий срок расчёта",
      "общий срок выполнения гипа",
      "срок выполнения гипа",
      "общий срок выполнения",
    ],
    (f) => isEntityNumericFieldType(f.type),
  );
  if (field) return { [field.id]: String(days) };
  return { [TKP_GIP_EXECUTION_DURATION_KEY]: String(days) };
}
