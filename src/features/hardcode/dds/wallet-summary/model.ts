import {
  buildEntityCashFlowRows,
  isEntityNumericFieldType,
  type Entity,
  type EntityAggregateRow,
  type EntityCashFlowPeriod,
  type EntityField,
  type EntityPageAggregateCashFlow,
  type EntityPageAggregatePanel,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { isDdsOperationsEntity } from "../match";

const WALLET_FIELD_NAMES = ["Кошелёк", "Кошелек"] as const;
const WALLETS_ENTITY_NAMES = ["Кошельки", "Кошелёк", "Кошелек"] as const;
const DATE_FIELD_NAMES = ["Дата"] as const;
const DIRECTION_FIELD_NAMES = ["Движение", "Вид движения"] as const;
const AMOUNT_FIELD_NAMES = ["С НДС", "Сумма с НДС", "Сумма"] as const;
const INCOME_OPTION_NAMES = ["Приход", "Доход", "Поступление"] as const;
const EXPENSE_OPTION_NAMES = ["Расход", "Выбытие"] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function fieldNameMatches(
  field: Pick<EntityField, "name">,
  labels: readonly string[],
): boolean {
  const name = normalizeName(field.name);
  return labels.some((label) => normalizeName(label) === name);
}

function findWalletFieldId(
  entity: Entity,
  entities: readonly Entity[],
): string | null {
  const byName = entity.fields.find((field) => {
    if (field.type !== "relation") return false;
    return fieldNameMatches(field, WALLET_FIELD_NAMES);
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

function findListOptionIds(
  field: EntityField,
  labels: readonly string[],
): string[] {
  const wanted = new Set(labels.map(normalizeName));
  return field.listOptions
    .filter((option) => wanted.has(normalizeName(option.name)))
    .map((option) => option.id);
}

/**
 * Prefer pageLayout cashFlow; otherwise infer from typical DDS field names.
 */
function resolveCashFlowConfig(
  entity: Entity,
): EntityPageAggregateCashFlow | null {
  const panel = entity.pageLayout?.panels.find(
    (item): item is EntityPageAggregatePanel => item.type === "aggregate",
  );
  if (panel?.cashFlow) return panel.cashFlow;

  const dateField = entity.fields.find(
    (field) =>
      field.type === "datetime" && fieldNameMatches(field, DATE_FIELD_NAMES),
  );
  const directionField = entity.fields.find(
    (field) =>
      field.type === "list" && fieldNameMatches(field, DIRECTION_FIELD_NAMES),
  );
  const amountField = entity.fields.find(
    (field) =>
      isEntityNumericFieldType(field.type) &&
      fieldNameMatches(field, AMOUNT_FIELD_NAMES),
  );
  if (!dateField || !directionField || !amountField) return null;

  const incomeOptionIds = findListOptionIds(
    directionField,
    INCOME_OPTION_NAMES,
  );
  const expenseOptionIds = findListOptionIds(
    directionField,
    EXPENSE_OPTION_NAMES,
  );
  if (incomeOptionIds.length === 0 || expenseOptionIds.length === 0) {
    return null;
  }

  return {
    dateFieldId: dateField.id,
    directionFieldId: directionField.id,
    amountFieldId: amountField.id,
    incomeOptionIds,
    expenseOptionIds,
  };
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

  const cashFlow = resolveCashFlowConfig(entity);
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
