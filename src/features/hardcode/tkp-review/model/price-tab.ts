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
    tableFlat: false,
  };
}

/**
 * Inserts the hardcode «Цена ТКП» tab first (ТЗ: на согласовании ТКП —
 * первая вкладка само ТКП). Idempotent.
 */
export function withTkpPriceHardcodeTab(
  tabs: readonly EntityTab[],
  entity: Entity,
  entities: readonly Entity[],
  showCommercialPricing: boolean,
): EntityTab[] {
  void entities;
  if (!isTkpAnalysisEntity(entity) || !showCommercialPricing) {
    return [...tabs];
  }
  if (tabs.some((tab) => isTkpPriceHardcodeTab(tab))) {
    return [...tabs];
  }

  const priceTab = createTkpPriceHardcodeTab();
  return [priceTab, ...tabs];
}
