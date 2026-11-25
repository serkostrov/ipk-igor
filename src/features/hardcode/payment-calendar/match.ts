import { findLegalEntitiesEntity, type Entity } from "@/entities/entity";
import {
  isDealsEntity,
  resolveDealCardSources,
  type DealCardSources,
} from "../deal-card/match";

export { findNamedField, findRelationTo } from "../deal-card/match";

const COUNTERPARTY_KEYS = ["контрагент", "контрагенты"];

export type PaymentCalendarSources = Pick<
  DealCardSources,
  "deal" | "contract" | "stage" | "dds" | "article"
> & {
  legal: Entity | null;
  counterparty: Entity | null;
};

function findCounterpartiesEntity(entities: readonly Entity[]): Entity | null {
  return (
    entities.find((entity) =>
      [entity.name, entity.namePlural].some((value) =>
        COUNTERPARTY_KEYS.includes(value.trim().toLocaleLowerCase("ru")),
      ),
    ) ?? null
  );
}

/** Entities the calendar reads, matched by name (ids differ per stand). */
export function resolvePaymentCalendarSources(
  entities: readonly Entity[],
): PaymentCalendarSources | null {
  const deal = entities.find((entity) => isDealsEntity(entity));
  if (!deal) return null;
  const { contract, stage, dds, article } = resolveDealCardSources(
    deal,
    entities,
  );
  return {
    deal,
    contract,
    stage,
    dds,
    article,
    legal: findLegalEntitiesEntity(entities),
    counterparty: findCounterpartiesEntity(entities),
  };
}

export function listPaymentCalendarSourceIds(
  sources: PaymentCalendarSources,
): string[] {
  return [
    sources.deal,
    sources.contract,
    sources.stage,
    sources.dds,
    sources.article,
    sources.legal,
    sources.counterparty,
  ]
    .filter((entity): entity is Entity => entity != null)
    .map((entity) => entity.id);
}

/** Names of the entities the calendar still needs, for the empty state. */
export function listMissingPaymentCalendarSources(
  sources: PaymentCalendarSources | null,
): string[] {
  const missing: string[] = [];
  if (!sources) missing.push("Сделки");
  if (!sources?.contract) missing.push("Договоры");
  if (!sources?.stage) missing.push("Этапы по договору");
  if (!sources?.dds) missing.push("ДДС");
  return missing;
}
