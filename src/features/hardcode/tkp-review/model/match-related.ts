/**
 * Match related entities for «Разбор ТКП»: dept calcs, trips, subcontractors.
 */

import {
  getEntityFieldDisplayName,
  isEntityNameField,
  isEntityNumericFieldType,
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { isDeptCalculationsEntity } from "../../tkp-gip/match";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function entityMatches(
  entity: Pick<Entity, "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const text = normalizeName(`${entity.name} ${entity.namePlural}`);
  return keys.some((key) => text.includes(normalizeName(key)));
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

export function isTkpTripsEntity(
  entity: Pick<Entity, "name" | "namePlural">,
): boolean {
  return (
    entityMatches(entity, ["командиров"]) ||
    (normalizeName(entity.name).includes("командир") &&
      !normalizeName(entity.name).includes("подряд"))
  );
}

export function isTkpSubcontractorsEntity(
  entity: Pick<Entity, "name" | "namePlural">,
): boolean {
  const text = normalizeName(`${entity.name} ${entity.namePlural}`);
  return (
    text.includes("подряд") ||
    text.includes("субподряд") ||
    text.includes("контрагент")
  );
}

export type TkpRelatedMoneyFields = {
  amount: EntityField | null;
  title: EntityField | null;
  counterparty: EntityField | null;
};

export function resolveTkpRelatedMoneyFields(
  entity: Entity,
): TkpRelatedMoneyFields {
  const amount =
    findField(entity, ["сумма", "стоимость", "amount"], (field) =>
      isEntityNumericFieldType(field.type),
    ) ?? null;
  const title =
    entity.fields.find((field) => isEntityNameField(field)) ??
    findField(entity, ["название", "наименование", "цель", "назначение"]);
  const counterparty = findField(entity, [
    "контрагент",
    "подрядчик",
    "исполнитель",
  ]);
  return { amount, title, counterparty };
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

export function findTripsLinkedEntity(
  host: Entity,
  entities: readonly Entity[],
): Entity | null {
  return findLinkedEntityByPredicate(host, entities, isTkpTripsEntity);
}

export function findSubcontractorsLinkedEntity(
  host: Entity,
  entities: readonly Entity[],
): Entity | null {
  return findLinkedEntityByPredicate(host, entities, isTkpSubcontractorsEntity);
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
      "общий срок выполнения гипа",
      "срок выполнения гипа",
      "общий срок выполнения",
    ],
    (f) => isEntityNumericFieldType(f.type),
  );
  if (field) return { [field.id]: String(days) };
  return { [TKP_GIP_EXECUTION_DURATION_KEY]: String(days) };
}
