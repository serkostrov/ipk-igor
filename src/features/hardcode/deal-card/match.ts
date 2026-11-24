import {
  getEntityRelationTargetId,
  type Entity,
  type EntityField,
  type EntityFieldType,
} from "@/entities/entity";
import { isDdsOperationsEntity } from "../dds/match";
import { isProjectsEntity } from "../project-gantt/match";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

function entityMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return keys.some((key) =>
    candidates.some((value) => normalizeName(value) === normalizeName(key)),
  );
}

export const DEAL_ENTITY_KEYS = ["Сделка", "Сделки"] as const;
const CONTRACT_KEYS = ["Договор", "Договоры"] as const;
const STAGE_KEYS = ["Этап по договору", "Этапы по договору"] as const;
const ACT_KEYS = [
  "Акт выполненных работ",
  "Акты выполненных работ",
  "Акт",
  "Акты",
] as const;
const REQUEST_KEYS = ["Заявка на оплату", "Заявки на оплату"] as const;
const ARTICLE_KEYS = ["Статья ДДС", "Статьи ДДС"] as const;

export function isDealsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return entityMatches(entity, DEAL_ENTITY_KEYS);
}

export type DealCardSources = {
  /** Deal entity with the record's pinned schema (formulas as of creation). */
  deal: Entity;
  /** Live deal entity — fields added after the record was created. */
  liveDeal: Entity;
  contract: Entity | null;
  stage: Entity | null;
  act: Entity | null;
  request: Entity | null;
  dds: Entity | null;
  article: Entity | null;
  project: Entity | null;
};

/** Entities the deal card reads, matched by name (ids differ per stand). */
export function resolveDealCardSources(
  deal: Entity,
  entities: readonly Entity[],
): DealCardSources {
  const byKeys = (keys: readonly string[]) =>
    entities.find((entity) => entityMatches(entity, keys)) ?? null;
  return {
    deal,
    liveDeal: entities.find((entity) => entity.id === deal.id) ?? deal,
    contract: byKeys(CONTRACT_KEYS),
    stage: byKeys(STAGE_KEYS),
    act: byKeys(ACT_KEYS),
    request: byKeys(REQUEST_KEYS),
    dds: entities.find((entity) => isDdsOperationsEntity(entity)) ?? null,
    article: byKeys(ARTICLE_KEYS),
    project: entities.find((entity) => isProjectsEntity(entity)) ?? null,
  };
}

export function listDealCardSourceIds(sources: DealCardSources): string[] {
  return [
    sources.contract,
    sources.stage,
    sources.act,
    sources.request,
    sources.dds,
    sources.article,
    sources.project,
  ]
    .filter((entity): entity is Entity => entity != null)
    .map((entity) => entity.id);
}

/** First field whose name matches one of `names` (and type, when given). */
export function findNamedField(
  entity: Entity | null,
  names: readonly string[],
  types?: readonly EntityFieldType[],
): EntityField | null {
  if (!entity) return null;
  const wanted = names.map(normalizeName);
  for (const name of wanted) {
    const field = entity.fields.find(
      (item) =>
        normalizeName(item.name) === name &&
        (!types || types.includes(item.type)),
    );
    if (field) return field;
  }
  return null;
}

/** Relation on `entity` pointing to `target` (name match wins on ties). */
export function findRelationTo(
  entity: Entity | null,
  target: Entity | null,
  names: readonly string[] = [],
): EntityField | null {
  if (!entity || !target) return null;
  const relations = entity.fields.filter(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      getEntityRelationTargetId(field) === target.id,
  );
  return (
    findNamedField({ ...entity, fields: relations }, names) ??
    relations[0] ??
    null
  );
}
