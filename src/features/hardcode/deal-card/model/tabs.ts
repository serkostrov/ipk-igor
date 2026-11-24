import {
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityTab,
} from "@/entities/entity";
import {
  isDealsEntity,
  resolveDealCardSources,
  type DealCardSources,
} from "../match";

/** Content rendered by the deal card hardcode. */
export type DealCardSection =
  /** Fallback «Расходы» tab: category totals + request list. */
  | "expenses"
  /** Category totals above a configured «Заявки на оплату» tab. */
  | "expense-totals"
  | "calculation"
  /** Plan of receipts above the deal's ДДС tab. */
  | "payments";

/** Virtual record tabs — not stored in the entity schema. */
const EXPENSES_TAB = { id: "hardcode-deal-expenses", name: "Расходы" };
const CALCULATION_TAB = { id: "hardcode-deal-calculation", name: "Расчёт" };

function createDealCardTab(id: string, name: string): EntityTab {
  return {
    id,
    name,
    locked: true,
    kind: "fields",
    linkedEntityId: null,
    parentLinkFieldId: null,
    sourceRelationFieldId: null,
    sourceTabId: null,
    defaultFolders: [],
    singleRecord: false,
    tableFlat: false,
  };
}

function isLinkedTo(tab: EntityTab, target: Entity | null): boolean {
  return (
    target != null &&
    isEntityTabWithLinkedEntity(tab) &&
    tab.linkedEntityId === target.id
  );
}

/** Virtual deal tab section by id (`null` — not a deal hardcode tab). */
export function getDealCardSection(
  tab: Pick<EntityTab, "id">,
): DealCardSection | null {
  if (tab.id === EXPENSES_TAB.id) return "expenses";
  if (tab.id === CALCULATION_TAB.id) return "calculation";
  return null;
}

/**
 * Extra block above a configured deal tab: plan of receipts on the ДДС tab,
 * expense totals on the «Заявки на оплату» tab.
 */
export function getDealLinkedTabSection(
  tab: EntityTab,
  sources: DealCardSources,
): DealCardSection | null {
  if (isLinkedTo(tab, sources.dds)) return "payments";
  if (isLinkedTo(tab, sources.request)) return "expense-totals";
  return null;
}

/**
 * Adds «Расчёт» (financial roles) and a fallback «Расходы» tab when the deal
 * has no configured «Заявки на оплату» tab, before «Комментарии» / «История».
 * Idempotent.
 */
export function withDealCardHardcodeTabs(
  tabs: readonly EntityTab[],
  entity: Entity,
  entities: readonly Entity[],
  showFinance: boolean,
): EntityTab[] {
  if (!isDealsEntity(entity)) return [...tabs];
  const sources = resolveDealCardSources(entity, entities);
  const hasRequestsTab = tabs.some((tab) => isLinkedTo(tab, sources.request));
  const extra = [
    hasRequestsTab ? null : EXPENSES_TAB,
    showFinance ? CALCULATION_TAB : null,
  ]
    .filter((item) => item != null)
    .filter((item) => !tabs.some((tab) => tab.id === item.id))
    .map((item) => createDealCardTab(item.id, item.name));
  if (extra.length === 0) return [...tabs];

  const tailIndex = tabs.findIndex(
    (tab) => tab.kind === "records" || tab.kind === "history",
  );
  if (tailIndex < 0) return [...tabs, ...extra];
  return [...tabs.slice(0, tailIndex), ...extra, ...tabs.slice(tailIndex)];
}
