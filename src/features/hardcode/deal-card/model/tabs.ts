import type { Entity, EntityTab } from "@/entities/entity";
import { isDealsEntity } from "../match";

export type DealCardSection = "acts" | "schedule" | "expenses" | "calculation";

/** Virtual record tabs — not stored in the entity schema. */
const DEAL_CARD_TABS: ReadonlyArray<{
  id: string;
  name: string;
  section: DealCardSection;
}> = [
  { id: "hardcode-deal-acts", name: "Акты", section: "acts" },
  {
    id: "hardcode-deal-schedule",
    name: "График платежей",
    section: "schedule",
  },
  { id: "hardcode-deal-expenses", name: "Расходы", section: "expenses" },
  { id: "hardcode-deal-calculation", name: "Расчёт", section: "calculation" },
];

export function getDealCardSection(
  tab: Pick<EntityTab, "id">,
): DealCardSection | null {
  return DEAL_CARD_TABS.find((item) => item.id === tab.id)?.section ?? null;
}

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

/**
 * Inserts the deal tabs before «Комментарии» / «История» (end otherwise).
 * «Расчёт» only with financial access. Idempotent.
 */
export function withDealCardHardcodeTabs(
  tabs: readonly EntityTab[],
  entity: Entity,
  showFinance: boolean,
): EntityTab[] {
  if (!isDealsEntity(entity)) return [...tabs];
  const extra = DEAL_CARD_TABS.filter(
    (item) =>
      (showFinance || item.section !== "calculation") &&
      !tabs.some((tab) => tab.id === item.id),
  ).map((item) => createDealCardTab(item.id, item.name));
  if (extra.length === 0) return [...tabs];

  const tailIndex = tabs.findIndex(
    (tab) => tab.kind === "records" || tab.kind === "history",
  );
  if (tailIndex < 0) return [...tabs, ...extra];
  return [...tabs.slice(0, tailIndex), ...extra, ...tabs.slice(tailIndex)];
}
