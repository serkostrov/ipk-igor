import {
  buildEntityCashFlowRows,
  type Entity,
  type EntityAggregateRow,
  type EntityCashFlowPeriod,
  type EntityPageAggregateCashFlow,
  type EntityPageAggregatePanel,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { isDdsOperationsEntity } from "../match";

const WALLET_FIELD_NAMES = ["Кошелёк", "Кошелек"] as const;
const WALLETS_ENTITY_NAMES = ["Кошельки", "Кошелёк", "Кошелек"] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function findWalletFieldId(
  entity: Entity,
  entities: readonly Entity[],
): string | null {
  const byName = entity.fields.find((field) => {
    if (field.type !== "relation") return false;
    const name = normalizeName(field.name);
    return WALLET_FIELD_NAMES.some((label) => normalizeName(label) === name);
  });
  if (byName) return byName.id;

  const walletEntityIds = new Set(
    entities
      .filter((item) => {
        const names = [item.name, item.namePlural].map(normalizeName);
        return WALLETS_ENTITY_NAMES.some((label) =>
          names.includes(normalizeName(label)),
        );
      })
      .map((item) => item.id),
  );
  if (walletEntityIds.size === 0) return null;

  const byRelation = entity.fields.find(
    (field) =>
      field.type === "relation" &&
      field.relationEntityId != null &&
      walletEntityIds.has(field.relationEntityId),
  );
  return byRelation?.id ?? null;
}

function findCashFlowConfig(
  entity: Entity,
): EntityPageAggregateCashFlow | null {
  const panel = entity.pageLayout?.panels.find(
    (item): item is EntityPageAggregatePanel => item.type === "aggregate",
  );
  return panel?.cashFlow ?? null;
}

export type DdsWalletSummarySetup = {
  panel: EntityPageAggregatePanel;
  cashFlow: EntityPageAggregateCashFlow;
  walletFieldId: string;
};

/**
 * Resolves cash-flow config + wallet group field for the DDS hardcode summary.
 * Returns null when the entity is not DDS ops or required config is missing.
 */
export function resolveDdsWalletSummarySetup(
  entity: Entity,
  entities: readonly Entity[],
): DdsWalletSummarySetup | null {
  if (!isDdsOperationsEntity(entity)) return null;

  const cashFlow = findCashFlowConfig(entity);
  if (!cashFlow) return null;

  const walletFieldId = findWalletFieldId(entity, entities);
  if (!walletFieldId) return null;

  const panel: EntityPageAggregatePanel = {
    id: "hardcode-dds-wallet-summary",
    type: "aggregate",
    title: null,
    groupFieldIds: [walletFieldId],
    valueFieldIds: [],
    showRecordCount: false,
    cashFlow,
  };

  return { panel, cashFlow, walletFieldId };
}

export function buildDdsWalletSummaryRows(
  ctx: EntityValueContext,
  entity: Entity,
  historyRecords: readonly EntityRecord[],
  setup: DdsWalletSummarySetup,
  period: EntityCashFlowPeriod,
): EntityAggregateRow[] {
  return buildEntityCashFlowRows(
    ctx,
    entity,
    historyRecords,
    setup.panel,
    period,
  );
}
