import type { Entity } from "@/entities/entity";
import { isDdsOperationsEntity } from "../dds/match";
import { findDdsArticlesEntity, findDdsOperationsEntity } from "../opiu/match";

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

const LEGAL_KEYS = ["Юрлица", "Юрлицо", "Юридические лица"] as const;
const WALLET_KEYS = ["Кошельки", "Кошелёк", "Кошелек"] as const;
const PLANNED_RECEIPT_KEYS = [
  "Плановые поступления",
  "Плановое поступление",
] as const;
const PLANNED_OUTFLOW_KEYS = [
  "Плановые выбытия",
  "Плановое выбытие",
  "Плановые расходы",
] as const;
const PROJECT_KEYS = ["Проекты", "Проект"] as const;

export function findLegalEntitiesEntity(
  entities: readonly Entity[],
): Entity | null {
  return entities.find((entity) => entityMatches(entity, LEGAL_KEYS)) ?? null;
}

export function findWalletsEntity(entities: readonly Entity[]): Entity | null {
  return entities.find((entity) => entityMatches(entity, WALLET_KEYS)) ?? null;
}

export function findPlannedReceiptsEntity(
  entities: readonly Entity[],
): Entity | null {
  return (
    entities.find((entity) => entityMatches(entity, PLANNED_RECEIPT_KEYS)) ??
    null
  );
}

export function findPlannedOutflowsEntity(
  entities: readonly Entity[],
): Entity | null {
  return (
    entities.find((entity) => entityMatches(entity, PLANNED_OUTFLOW_KEYS)) ??
    null
  );
}

export function findProjectsEntity(entities: readonly Entity[]): Entity | null {
  return entities.find((entity) => entityMatches(entity, PROJECT_KEYS)) ?? null;
}

export type FinanceDashboardSourceEntities = {
  dds: Entity | null;
  articles: Entity | null;
  wallets: Entity | null;
  legalEntities: Entity | null;
  plannedReceipts: Entity | null;
  plannedOutflows: Entity | null;
  projects: Entity | null;
};

export function resolveFinanceDashboardSources(
  entities: readonly Entity[],
): FinanceDashboardSourceEntities {
  return {
    dds: findDdsOperationsEntity(entities),
    articles: findDdsArticlesEntity(entities),
    wallets: findWalletsEntity(entities),
    legalEntities: findLegalEntitiesEntity(entities),
    plannedReceipts: findPlannedReceiptsEntity(entities),
    plannedOutflows: findPlannedOutflowsEntity(entities),
    projects: findProjectsEntity(entities),
  };
}

export {
  isDdsOperationsEntity,
  findDdsArticlesEntity,
  findDdsOperationsEntity,
};
