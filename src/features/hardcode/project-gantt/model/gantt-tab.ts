import type { Entity, EntityTab } from "@/entities/entity";
import { isProjectsEntity } from "../match";

/** Virtual record tab — not stored in entity schema. */
export const PROJECT_GANTT_HARDCODE_TAB_ID = "hardcode-project-gantt";
export const PROJECT_GANTT_HARDCODE_TAB_NAME = "График";

export function isProjectGanttHardcodeTab(tab: Pick<EntityTab, "id">) {
  return tab.id === PROJECT_GANTT_HARDCODE_TAB_ID;
}

export function createProjectGanttHardcodeTab(): EntityTab {
  return {
    id: PROJECT_GANTT_HARDCODE_TAB_ID,
    name: PROJECT_GANTT_HARDCODE_TAB_NAME,
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
 * Inserts the hardcode «График» tab for Projects entity. Idempotent.
 */
export function withProjectGanttHardcodeTab(
  tabs: readonly EntityTab[],
  entity: Entity,
): EntityTab[] {
  if (!isProjectsEntity(entity)) return [...tabs];
  if (tabs.some((tab) => isProjectGanttHardcodeTab(tab))) return [...tabs];
  return [...tabs, createProjectGanttHardcodeTab()];
}
