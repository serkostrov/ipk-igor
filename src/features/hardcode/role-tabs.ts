import {
  isTkpAnalysisEntity,
  type Entity,
  type EntityTab,
} from "@/entities/entity";
import {
  DEAL_CALCULATION_TAB_ID,
  DEAL_EXPENSES_TAB_ID,
} from "./deal-card/model/tabs";
import { isDealsEntity } from "./deal-card/match";
import { isProjectsEntity } from "./project-gantt/match";
import { createProjectGanttHardcodeTab } from "./project-gantt/model/gantt-tab";
import { createTkpPriceHardcodeTab } from "./tkp-review/model/price-tab";
import { TKP_GIP_COST_TAB_ID } from "./tkp-review/model/visibility";

function hardcodeTab(id: string, name: string): EntityTab {
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
 * Card tabs that are drawn in code, not stored on the entity.
 * The role matrix lists them so «видеть / редактировать» can turn them off.
 */
export function hardcodeRoleTabs(entity: Entity): EntityTab[] {
  const tabs: EntityTab[] = [];
  if (isTkpAnalysisEntity(entity)) {
    tabs.push(
      createTkpPriceHardcodeTab(),
      hardcodeTab(TKP_GIP_COST_TAB_ID, "Расчёт ГИПа"),
    );
  }
  if (isProjectsEntity(entity)) {
    tabs.push(createProjectGanttHardcodeTab());
  }
  if (isDealsEntity(entity)) {
    tabs.push(
      hardcodeTab(DEAL_CALCULATION_TAB_ID, "Расчёт"),
      hardcodeTab(DEAL_EXPENSES_TAB_ID, "Расходы"),
    );
  }
  return tabs;
}
