import type { Entity, EntityTab } from "@/entities/entity";
import { isTkpAnalysisEntity } from "@/entities/entity";

/** Virtual record tab — not stored in entity schema. */
export const TKP_PRICE_HARDCODE_TAB_ID = "hardcode-tkp-price";
export const TKP_PRICE_HARDCODE_TAB_NAME = "Цена ТКП";

export function isTkpPriceHardcodeTab(tab: Pick<EntityTab, "id">) {
  return tab.id === TKP_PRICE_HARDCODE_TAB_ID;
}

export function createTkpPriceHardcodeTab(): EntityTab {
  return {
    id: TKP_PRICE_HARDCODE_TAB_ID,
    name: TKP_PRICE_HARDCODE_TAB_NAME,
    locked: true,
    kind: "fields",
    linkedEntityId: null,
    parentLinkFieldId: null,
    sourceRelationFieldId: null,
    sourceTabId: null,
    defaultFolders: [],
    singleRecord: false,
  };
}

/**
 * Appends the hardcode «Цена ТКП» tab for TKP analysis when commercial
 * pricing is visible. Idempotent.
 */
export function withTkpPriceHardcodeTab(
  tabs: readonly EntityTab[],
  entity: Entity,
  showCommercialPricing: boolean,
): EntityTab[] {
  if (!isTkpAnalysisEntity(entity) || !showCommercialPricing) {
    return [...tabs];
  }
  if (tabs.some((tab) => isTkpPriceHardcodeTab(tab))) {
    return [...tabs];
  }
  return [...tabs, createTkpPriceHardcodeTab()];
}
