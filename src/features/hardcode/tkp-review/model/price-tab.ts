import type { Entity, EntityTab } from "@/entities/entity";
import {
  isEntityTabWithLinkedEntity,
  isTkpAnalysisEntity,
} from "@/entities/entity";
import { isDeptCalculationsEntity } from "../../tkp-gip/match";

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
 * Inserts the hardcode «Цена ТКП» tab right after «Расчёты отделов».
 * Falls back to the end when the dept tab is missing. Idempotent.
 */
export function withTkpPriceHardcodeTab(
  tabs: readonly EntityTab[],
  entity: Entity,
  entities: readonly Entity[],
  showCommercialPricing: boolean,
): EntityTab[] {
  if (!isTkpAnalysisEntity(entity) || !showCommercialPricing) {
    return [...tabs];
  }
  if (tabs.some((tab) => isTkpPriceHardcodeTab(tab))) {
    return [...tabs];
  }

  const priceTab = createTkpPriceHardcodeTab();
  const deptIndex = tabs.findIndex((tab) => {
    if (!isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) return false;
    const linked = entities.find((item) => item.id === tab.linkedEntityId);
    return linked != null && isDeptCalculationsEntity(linked);
  });

  if (deptIndex < 0) return [...tabs, priceTab];
  const next = [...tabs];
  next.splice(deptIndex + 1, 0, priceTab);
  return next;
}
