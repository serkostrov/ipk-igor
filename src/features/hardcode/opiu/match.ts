import type { Entity } from "@/entities/entity";
import { isDdsOperationsEntity } from "../dds/match";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
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

const ACTS_KEYS = ["Акты", "Акт"] as const;
const ARTICLES_KEYS = ["Статьи ДДС"] as const;

export function findActsEntity(entities: readonly Entity[]): Entity | null {
  return entities.find((entity) => entityMatches(entity, ACTS_KEYS)) ?? null;
}

export function findDdsOperationsEntity(
  entities: readonly Entity[],
): Entity | null {
  return entities.find((entity) => isDdsOperationsEntity(entity)) ?? null;
}

export function findDdsArticlesEntity(
  entities: readonly Entity[],
): Entity | null {
  return (
    entities.find((entity) => entityMatches(entity, ARTICLES_KEYS)) ?? null
  );
}

export type OpiuSourceEntities = {
  acts: Entity | null;
  dds: Entity | null;
  articles: Entity | null;
};

export function resolveOpiuSourceEntities(
  entities: readonly Entity[],
): OpiuSourceEntities {
  return {
    acts: findActsEntity(entities),
    dds: findDdsOperationsEntity(entities),
    articles: findDdsArticlesEntity(entities),
  };
}
