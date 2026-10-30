import { getEntityRelationTargetId } from "../model/field";
import type { EntityCondition } from "../model/condition";
import {
  ENTITY_OVERVIEW_TAB_ID,
  isEntityOverviewTab,
  isEntitySubEntity,
  type Entity,
  type EntityBrowseView,
  type EntityDeadlineConfig,
  type EntityDependenciesConfig,
  type EntityField,
  type EntityFieldDefaultValue,
  type EntityFieldGroup,
  type EntityFormulaConfig,
  type EntityListOption,
  type EntityLookupConfig,
  type EntityPageLayout,
  type EntityRelationFilter,
  type EntityRelationGroupsConfig,
  type EntityRollupConfig,
  type EntityTab,
  type EntityTabDefaultFolder,
  type EntityTimeTracking,
  type EntityTimelineConfig,
  type EntityView,
} from "../model/types";
import { normalizeEntity } from "./parse-entity-config";

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function mapId(map: Map<string, string>, id: string | null | undefined) {
  if (typeof id !== "string" || !id) return id ?? null;
  return map.get(id) ?? id;
}

function mapIdList(map: Map<string, string>, ids: string[] | null | undefined) {
  if (!ids) return ids ?? [];
  return ids.map((id) => map.get(id) ?? id);
}

/** Remap `{{fieldId}}` tokens; unknown ids stay unchanged. */
function remapTemplateTokens(
  template: string,
  fieldIdMap: Map<string, string>,
) {
  if (!template.includes("{{")) return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, rawId: string) => {
    const id = rawId.trim();
    const next = fieldIdMap.get(id);
    return next ? `{{${next}}}` : match;
  });
}

function remapCondition(
  condition: EntityCondition,
  fieldIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityCondition {
  const next: EntityCondition = {
    ...condition,
    id: createId("cond"),
    fieldId: mapId(fieldIdMap, condition.fieldId) ?? condition.fieldId,
  };
  if (condition.values) {
    next.values = condition.values.map(
      (value) => optionIdMap.get(value) ?? value,
    );
  }
  if (
    typeof condition.value === "string" &&
    condition.operator === "equalsRecordField"
  ) {
    next.value = mapId(fieldIdMap, condition.value) ?? condition.value;
  }
  return next;
}

function remapConditions(
  conditions: EntityCondition[] | undefined,
  fieldIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
) {
  return (conditions ?? []).map((condition) =>
    remapCondition(condition, fieldIdMap, optionIdMap),
  );
}

function remapListOptions(
  options: EntityListOption[],
  optionIdMap: Map<string, string>,
): EntityListOption[] {
  return options.map((option) => {
    const id = optionIdMap.get(option.id) ?? createId("list");
    return {
      ...option,
      id,
      parentOptionId: option.parentOptionId
        ? (optionIdMap.get(option.parentOptionId) ?? option.parentOptionId)
        : null,
    };
  });
}

function remapDefaultValue(
  value: EntityFieldDefaultValue | undefined,
  optionIdMap: Map<string, string>,
): EntityFieldDefaultValue | undefined {
  if (!value || value.kind !== "value") return value;
  const mapped = optionIdMap.get(value.value);
  if (!mapped) return value;
  return { kind: "value", value: mapped };
}

function remapFormula(
  config: EntityFormulaConfig | undefined,
  fieldIdMap: Map<string, string>,
): EntityFormulaConfig | undefined {
  if (!config) return undefined;
  return {
    ...config,
    expression: remapTemplateTokens(config.expression, fieldIdMap),
  };
}

function remapRollup(
  config: EntityRollupConfig | undefined,
  fieldIdMap: Map<string, string>,
  entityIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityRollupConfig | undefined {
  if (!config) return undefined;
  return {
    ...config,
    sourceEntityId:
      mapId(entityIdMap, config.sourceEntityId) ?? config.sourceEntityId,
    linkFieldId: mapId(fieldIdMap, config.linkFieldId) ?? config.linkFieldId,
    valueFieldId: config.valueFieldId
      ? (mapId(fieldIdMap, config.valueFieldId) ?? config.valueFieldId)
      : null,
    conditions: remapConditions(config.conditions, fieldIdMap, optionIdMap),
  };
}

function remapLookup(
  config: EntityLookupConfig | undefined,
  fieldIdMap: Map<string, string>,
): EntityLookupConfig | undefined {
  if (!config) return undefined;
  return {
    ...config,
    relationFieldId:
      mapId(fieldIdMap, config.relationFieldId) ?? config.relationFieldId,
    // target / via live on the related entity — remap when in fieldIdMap.
    targetFieldId:
      mapId(fieldIdMap, config.targetFieldId) ?? config.targetFieldId,
    ...(config.viaFieldId
      ? {
          viaFieldId: mapId(fieldIdMap, config.viaFieldId) ?? config.viaFieldId,
        }
      : {}),
  };
}

function remapDependencies(
  config: EntityDependenciesConfig | undefined,
  fieldIdMap: Map<string, string>,
): EntityDependenciesConfig | undefined {
  if (!config) return undefined;
  return {
    sameFieldId: config.sameFieldId
      ? (mapId(fieldIdMap, config.sameFieldId) ?? config.sameFieldId)
      : null,
  };
}

function remapRelationGroups(
  config: EntityRelationGroupsConfig | undefined,
  fieldIdMap: Map<string, string>,
  entityIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityRelationGroupsConfig | undefined {
  if (!config) return undefined;
  return {
    levels: config.levels.map((level) => {
      const source =
        level.source.kind === "entity"
          ? {
              kind: "entity" as const,
              entityId: level.source.entityId
                ? (mapId(entityIdMap, level.source.entityId) ??
                  level.source.entityId)
                : null,
              limitFieldId: level.source.limitFieldId
                ? (mapId(fieldIdMap, level.source.limitFieldId) ??
                  level.source.limitFieldId)
                : null,
              filter: remapRelationFilter(
                level.source.filter ?? undefined,
                fieldIdMap,
                optionIdMap,
              ),
            }
          : {
              kind: "field" as const,
              fieldId: level.source.fieldId
                ? (mapId(fieldIdMap, level.source.fieldId) ??
                  level.source.fieldId)
                : null,
            };
      return {
        ...level,
        id: createId("rg-level"),
        source,
        displayFieldIds: mapIdList(fieldIdMap, level.displayFieldIds),
      };
    }),
  };
}

function remapRelationFilter(
  filter: EntityRelationFilter | undefined,
  fieldIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityRelationFilter | undefined {
  if (!filter) return undefined;
  return {
    matches: filter.matches.map((match) => ({
      targetFieldId: match.targetFieldId,
      sourceFieldId:
        mapId(fieldIdMap, match.sourceFieldId) ?? match.sourceFieldId,
    })),
    conditions: remapConditions(filter.conditions, fieldIdMap, optionIdMap),
  };
}

function remapDeadline(
  config: EntityDeadlineConfig | undefined,
  fieldIdMap: Map<string, string>,
): EntityDeadlineConfig | undefined {
  if (!config) return undefined;
  return {
    doneListFieldId: config.doneListFieldId
      ? (mapId(fieldIdMap, config.doneListFieldId) ?? config.doneListFieldId)
      : null,
    doneBooleanFieldId: config.doneBooleanFieldId
      ? (mapId(fieldIdMap, config.doneBooleanFieldId) ??
        config.doneBooleanFieldId)
      : null,
    preliminaryFieldId: config.preliminaryFieldId
      ? (mapId(fieldIdMap, config.preliminaryFieldId) ??
        config.preliminaryFieldId)
      : null,
  };
}

function remapField(
  field: EntityField,
  maps: {
    fieldIdMap: Map<string, string>;
    tabIdMap: Map<string, string>;
    optionIdMap: Map<string, string>;
    entityIdMap: Map<string, string>;
  },
): EntityField {
  const { fieldIdMap, tabIdMap, optionIdMap, entityIdMap } = maps;
  const id = fieldIdMap.get(field.id) ?? field.id;
  const listOptions = remapListOptions(field.listOptions, optionIdMap);

  return {
    ...structuredClone(field),
    id,
    // Cloned entity is never a system entity — clear field system keys.
    systemKey: null,
    tabId: mapId(tabIdMap, field.tabId) ?? field.tabId,
    visibilityConditions: remapConditions(
      field.visibilityConditions,
      fieldIdMap,
      optionIdMap,
    ),
    relationEntityId: field.relationEntityId
      ? (mapId(entityIdMap, field.relationEntityId) ?? field.relationEntityId)
      : null,
    sumFieldIds: mapIdList(fieldIdMap, field.sumFieldIds),
    listOptions,
    // May point at another entity's field — remap only if we own that id.
    listSourceFieldId: field.listSourceFieldId
      ? (mapId(fieldIdMap, field.listSourceFieldId) ?? field.listSourceFieldId)
      : null,
    listDependsOnFieldId: field.listDependsOnFieldId
      ? (mapId(fieldIdMap, field.listDependsOnFieldId) ??
        field.listDependsOnFieldId)
      : null,
    formula: remapFormula(field.formula, fieldIdMap),
    rollup: remapRollup(field.rollup, fieldIdMap, entityIdMap, optionIdMap),
    lookup: remapLookup(field.lookup, fieldIdMap),
    dependencies: remapDependencies(field.dependencies, fieldIdMap),
    relationGroups: remapRelationGroups(
      field.relationGroups,
      fieldIdMap,
      entityIdMap,
      optionIdMap,
    ),
    defaultValue: remapDefaultValue(field.defaultValue, optionIdMap),
    relationFilter: remapRelationFilter(
      field.relationFilter,
      fieldIdMap,
      optionIdMap,
    ),
    deadline: remapDeadline(field.deadline, fieldIdMap),
  };
}

function remapFolders(
  folders: EntityTabDefaultFolder[],
  folderIdMap: Map<string, string>,
): EntityTabDefaultFolder[] {
  return folders.map((folder) => ({
    ...folder,
    id: folderIdMap.get(folder.id) ?? createId("folder"),
  }));
}

function remapTab(
  tab: EntityTab,
  maps: {
    tabIdMap: Map<string, string>;
    fieldIdMap: Map<string, string>;
    folderIdMap: Map<string, string>;
    entityIdMap: Map<string, string>;
  },
): EntityTab {
  const { tabIdMap, fieldIdMap, folderIdMap, entityIdMap } = maps;
  if (isEntityOverviewTab(tab)) {
    return {
      ...structuredClone(tab),
      id: ENTITY_OVERVIEW_TAB_ID,
      defaultFolders: [],
    };
  }

  return {
    ...structuredClone(tab),
    id: tabIdMap.get(tab.id) ?? createId("tab"),
    linkedEntityId: tab.linkedEntityId
      ? (mapId(entityIdMap, tab.linkedEntityId) ?? tab.linkedEntityId)
      : null,
    parentLinkFieldId: tab.parentLinkFieldId
      ? (mapId(fieldIdMap, tab.parentLinkFieldId) ?? tab.parentLinkFieldId)
      : null,
    sourceRelationFieldId: tab.sourceRelationFieldId
      ? (mapId(fieldIdMap, tab.sourceRelationFieldId) ??
        tab.sourceRelationFieldId)
      : null,
    // sourceTabId is on the related entity — keep unless we remapped it.
    sourceTabId: tab.sourceTabId
      ? (mapId(tabIdMap, tab.sourceTabId) ?? tab.sourceTabId)
      : null,
    defaultFolders: remapFolders(tab.defaultFolders, folderIdMap),
  };
}

function remapFieldGroups(
  groups: EntityFieldGroup[],
  tabIdMap: Map<string, string>,
): EntityFieldGroup[] {
  return groups.map((group) => ({
    ...group,
    tabId: group.tabId
      ? (mapId(tabIdMap, group.tabId) ?? group.tabId)
      : group.tabId,
  }));
}

function remapTimeline(
  timeline: EntityTimelineConfig | null,
  fieldIdMap: Map<string, string>,
): EntityTimelineConfig | null {
  if (!timeline) return null;
  return {
    ...timeline,
    startFieldId:
      mapId(fieldIdMap, timeline.startFieldId) ?? timeline.startFieldId,
    endFieldId: mapId(fieldIdMap, timeline.endFieldId) ?? timeline.endFieldId,
    groupFieldId: timeline.groupFieldId
      ? (mapId(fieldIdMap, timeline.groupFieldId) ?? timeline.groupFieldId)
      : null,
    clusterFieldId: timeline.clusterFieldId
      ? (mapId(fieldIdMap, timeline.clusterFieldId) ?? timeline.clusterFieldId)
      : null,
    splitFieldId: timeline.splitFieldId
      ? (mapId(fieldIdMap, timeline.splitFieldId) ?? timeline.splitFieldId)
      : null,
    colorFieldId: timeline.colorFieldId
      ? (mapId(fieldIdMap, timeline.colorFieldId) ?? timeline.colorFieldId)
      : null,
    labelFieldId: timeline.labelFieldId
      ? (mapId(fieldIdMap, timeline.labelFieldId) ?? timeline.labelFieldId)
      : null,
    progressFieldId: timeline.progressFieldId
      ? (mapId(fieldIdMap, timeline.progressFieldId) ??
        timeline.progressFieldId)
      : null,
    dependenciesFieldId: timeline.dependenciesFieldId
      ? (mapId(fieldIdMap, timeline.dependenciesFieldId) ??
        timeline.dependenciesFieldId)
      : null,
  };
}

function remapTimeTracking(
  tracking: EntityTimeTracking | null,
  fieldIdMap: Map<string, string>,
  entityIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityTimeTracking | null {
  if (!tracking) return null;
  return {
    ...tracking,
    entryEntityId:
      mapId(entityIdMap, tracking.entryEntityId) ?? tracking.entryEntityId,
    linkFieldId:
      mapId(fieldIdMap, tracking.linkFieldId) ?? tracking.linkFieldId,
    employeeFieldId:
      mapId(fieldIdMap, tracking.employeeFieldId) ?? tracking.employeeFieldId,
    startFieldId:
      mapId(fieldIdMap, tracking.startFieldId) ?? tracking.startFieldId,
    endFieldId: mapId(fieldIdMap, tracking.endFieldId) ?? tracking.endFieldId,
    hoursFieldId:
      mapId(fieldIdMap, tracking.hoursFieldId) ?? tracking.hoursFieldId,
    methodFieldId: tracking.methodFieldId
      ? (mapId(fieldIdMap, tracking.methodFieldId) ?? tracking.methodFieldId)
      : null,
    timerOptionId: tracking.timerOptionId
      ? (optionIdMap.get(tracking.timerOptionId) ?? tracking.timerOptionId)
      : null,
    manualOptionId: tracking.manualOptionId
      ? (optionIdMap.get(tracking.manualOptionId) ?? tracking.manualOptionId)
      : null,
    commentFieldId: tracking.commentFieldId
      ? (mapId(fieldIdMap, tracking.commentFieldId) ?? tracking.commentFieldId)
      : null,
    statusFieldId: tracking.statusFieldId
      ? (mapId(fieldIdMap, tracking.statusFieldId) ?? tracking.statusFieldId)
      : null,
    statusOptionIds: tracking.statusOptionIds.map(
      (id) => optionIdMap.get(id) ?? id,
    ),
    context: tracking.context.map((item) => ({
      sourceFieldId:
        mapId(fieldIdMap, item.sourceFieldId) ?? item.sourceFieldId,
      targetFieldId:
        mapId(fieldIdMap, item.targetFieldId) ?? item.targetFieldId,
    })),
  };
}

function remapPageLayout(
  layout: EntityPageLayout | null,
  fieldIdMap: Map<string, string>,
  optionIdMap: Map<string, string>,
): EntityPageLayout | null {
  if (!layout) return null;
  const panelIdMap = new Map<string, string>();
  for (const panel of layout.panels) {
    panelIdMap.set(panel.id, createId("panel"));
  }
  const rowIdMap = new Map<string, string>();
  for (const row of layout.rows) {
    rowIdMap.set(row.id, createId("row"));
  }

  return {
    panels: layout.panels.map((panel) => {
      const id = panelIdMap.get(panel.id) ?? createId("panel");
      if (panel.type === "records") {
        return { ...panel, id };
      }
      if (panel.type === "filters") {
        return {
          ...panel,
          id,
          fieldIds: panel.fieldIds
            ? mapIdList(fieldIdMap, panel.fieldIds)
            : null,
        };
      }
      return {
        ...panel,
        id,
        groupFieldIds: mapIdList(fieldIdMap, panel.groupFieldIds),
        valueFieldIds: mapIdList(fieldIdMap, panel.valueFieldIds),
        cashFlow: panel.cashFlow
          ? {
              ...panel.cashFlow,
              dateFieldId:
                mapId(fieldIdMap, panel.cashFlow.dateFieldId) ??
                panel.cashFlow.dateFieldId,
              directionFieldId:
                mapId(fieldIdMap, panel.cashFlow.directionFieldId) ??
                panel.cashFlow.directionFieldId,
              amountFieldId:
                mapId(fieldIdMap, panel.cashFlow.amountFieldId) ??
                panel.cashFlow.amountFieldId,
              incomeOptionIds: panel.cashFlow.incomeOptionIds.map(
                (optionId) => optionIdMap.get(optionId) ?? optionId,
              ),
              expenseOptionIds: panel.cashFlow.expenseOptionIds.map(
                (optionId) => optionIdMap.get(optionId) ?? optionId,
              ),
            }
          : undefined,
      };
    }),
    rows: layout.rows.map((row) => ({
      ...row,
      id: rowIdMap.get(row.id) ?? createId("row"),
      panelIds: row.panelIds.map(
        (panelId) => panelIdMap.get(panelId) ?? panelId,
      ),
    })),
  };
}

type IdMaps = {
  entityIdMap: Map<string, string>;
  fieldIdMap: Map<string, string>;
  tabIdMap: Map<string, string>;
  optionIdMap: Map<string, string>;
  folderIdMap: Map<string, string>;
};

function collectEntityIds(
  rootId: string,
  entities: Entity[],
  entityIdMap: Map<string, string>,
) {
  entityIdMap.set(rootId, createId("entity"));
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const entity of entities) {
      if (entity.parentEntityId !== parentId) continue;
      if (entityIdMap.has(entity.id)) continue;
      entityIdMap.set(entity.id, createId("entity"));
      queue.push(entity.id);
    }
  }
}

function seedMapsForEntity(entity: Entity, maps: IdMaps) {
  maps.tabIdMap.set(ENTITY_OVERVIEW_TAB_ID, ENTITY_OVERVIEW_TAB_ID);
  for (const tab of entity.tabs) {
    if (isEntityOverviewTab(tab)) continue;
    maps.tabIdMap.set(tab.id, createId("tab"));
    for (const folder of tab.defaultFolders) {
      maps.folderIdMap.set(folder.id, createId("folder"));
    }
  }
  for (const field of entity.fields) {
    maps.fieldIdMap.set(field.id, createId("field"));
    for (const option of field.listOptions) {
      maps.optionIdMap.set(option.id, createId("list"));
    }
  }
}

function cloneEntityStructure(
  source: Entity,
  maps: IdMaps,
  meta: {
    name: string;
    namePlural: string;
    description: string;
    views: EntityView[];
    defaultView: EntityBrowseView | null;
    parentEntityId: string | null;
    clearSystem: boolean;
  },
): Entity {
  const fields = source.fields.map((field) =>
    remapField(field, {
      fieldIdMap: maps.fieldIdMap,
      tabIdMap: maps.tabIdMap,
      optionIdMap: maps.optionIdMap,
      entityIdMap: maps.entityIdMap,
    }),
  );
  const tabs = source.tabs.map((tab) =>
    remapTab(tab, {
      tabIdMap: maps.tabIdMap,
      fieldIdMap: maps.fieldIdMap,
      folderIdMap: maps.folderIdMap,
      entityIdMap: maps.entityIdMap,
    }),
  );

  return normalizeEntity({
    id: maps.entityIdMap.get(source.id) ?? createId("entity"),
    name: meta.name,
    namePlural: meta.namePlural,
    description: meta.description,
    nameTemplate: remapTemplateTokens(
      source.nameTemplate ?? "",
      maps.fieldIdMap,
    ),
    views: meta.views,
    defaultView: meta.defaultView,
    fields,
    headerFieldId: source.headerFieldId
      ? (mapId(maps.fieldIdMap, source.headerFieldId) ?? null)
      : null,
    kanbanFieldId: source.kanbanFieldId
      ? (mapId(maps.fieldIdMap, source.kanbanFieldId) ?? null)
      : null,
    kanbanCardFieldIds: source.kanbanCardFieldIds
      ? mapIdList(maps.fieldIdMap, source.kanbanCardFieldIds)
      : null,
    kanbanShowFilters: source.kanbanShowFilters !== false,
    tableMassSelection: source.tableMassSelection,
    tableParentFieldId: source.tableParentFieldId
      ? (mapId(maps.fieldIdMap, source.tableParentFieldId) ?? null)
      : null,
    tableSubgroupFieldId: source.tableSubgroupFieldId
      ? (mapId(maps.fieldIdMap, source.tableSubgroupFieldId) ?? null)
      : null,
    tableNestedEntityId: source.tableNestedEntityId
      ? (mapId(maps.entityIdMap, source.tableNestedEntityId) ??
        source.tableNestedEntityId)
      : null,
    tabs,
    fieldGroups: remapFieldGroups(source.fieldGroups, maps.tabIdMap),
    systemKey: meta.clearSystem ? null : source.systemKey,
    locked: meta.clearSystem ? false : source.locked,
    parentEntityId: meta.parentEntityId,
    recordColumns: source.recordColumns,
    recordsDisplay: source.recordsDisplay,
    timeTracking: remapTimeTracking(
      source.timeTracking,
      maps.fieldIdMap,
      maps.entityIdMap,
      maps.optionIdMap,
    ),
    timeline: remapTimeline(source.timeline, maps.fieldIdMap),
    pageLayout: remapPageLayout(
      source.pageLayout,
      maps.fieldIdMap,
      maps.optionIdMap,
    ),
    publishedVersion: 1,
    records: [],
  });
}

function createParentLinkField(params: {
  parentEntityId: string;
  parentLabel: string;
}): EntityField {
  return {
    id: createId("field"),
    name: params.parentLabel,
    type: "relation",
    hint: "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: false,
    locked: false,
    systemKey: null,
    showInTable: false,
    showInFilters: false,
    showOnRecord: true,
    showOnCreate: true,
    visibilityConditions: [],
    includeInTotal: false,
    tableOrder: 0,
    relationEntityId: params.parentEntityId,
    relationMultiple: false,
    unitSuffix: null,
    decimals: 2,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    listShowEmptyValue: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
  };
}

export type CloneEntityOverrides = {
  name: string;
  namePlural: string;
  description: string;
  views?: EntityView[];
  defaultView?: EntityBrowseView | null;
};

export type CloneEntityPlan = {
  /** Root clone + owned sub-entity clones. */
  entities: Entity[];
  /** Shared entities that need a new parent-link field for the clone. */
  linkedEntityUpdates: Array<{ id: string; entity: Entity }>;
};

/**
 * Build a deep schema clone of `sourceId` (no records).
 * Owned sub-entities (`parentEntityId`) are cloned recursively.
 * Tabs to shared entities keep the link and add a parent relation field when needed.
 */
export function buildClonedEntityPlan(
  sourceId: string,
  allEntities: Entity[],
  overrides: CloneEntityOverrides,
): CloneEntityPlan | null {
  const source = allEntities.find((entity) => entity.id === sourceId);
  if (!source || isEntitySubEntity(source)) return null;

  const maps: IdMaps = {
    entityIdMap: new Map(),
    fieldIdMap: new Map(),
    tabIdMap: new Map(),
    optionIdMap: new Map(),
    folderIdMap: new Map(),
  };

  collectEntityIds(source.id, allEntities, maps.entityIdMap);

  const ownedIds = [...maps.entityIdMap.keys()];
  for (const id of ownedIds) {
    const entity = allEntities.find((item) => item.id === id);
    if (!entity) continue;
    seedMapsForEntity(entity, maps);
  }

  const newRootId = maps.entityIdMap.get(source.id)!;
  const views = overrides.views ?? source.views;
  const root = cloneEntityStructure(source, maps, {
    name: overrides.name.trim() || source.name,
    namePlural: overrides.namePlural.trim() || source.namePlural,
    description: overrides.description.trim(),
    views,
    defaultView:
      overrides.defaultView !== undefined
        ? overrides.defaultView
        : source.defaultView,
    parentEntityId: null,
    clearSystem: true,
  });

  const ownedClones: Entity[] = [];
  for (const id of ownedIds) {
    if (id === source.id) continue;
    const child = allEntities.find((item) => item.id === id);
    if (!child) continue;
    const newParentId = child.parentEntityId
      ? (maps.entityIdMap.get(child.parentEntityId) ?? null)
      : null;
    ownedClones.push(
      cloneEntityStructure(child, maps, {
        name: child.name,
        namePlural: child.namePlural,
        description: child.description,
        views: child.views,
        defaultView: child.defaultView,
        parentEntityId: newParentId,
        clearSystem: true,
      }),
    );
  }

  // Shared entity tabs still reference the original linked entity id.
  // Their parent-link field pointed at the source — add a field for the clone.
  const clonedEntityIds = new Set(ownedClones.map((entity) => entity.id));
  clonedEntityIds.add(newRootId);
  const linkedEntityUpdates = new Map<string, Entity>();
  const parentLabel = root.name.trim() || root.namePlural.trim() || "Связь";

  const remappedTabs = root.tabs.map((tab) => {
    if (tab.kind !== "entity" || !tab.linkedEntityId) return tab;
    const linkedId = tab.linkedEntityId;
    if (clonedEntityIds.has(linkedId)) return tab;

    const linked =
      linkedEntityUpdates.get(linkedId) ??
      allEntities.find((entity) => entity.id === linkedId);
    if (!linked) return tab;

    const existingLink = linked.fields.find(
      (field) =>
        field.type === "relation" &&
        getEntityRelationTargetId(field) === newRootId,
    );
    if (existingLink) {
      return { ...tab, parentLinkFieldId: existingLink.id };
    }

    const linkField = createParentLinkField({
      parentEntityId: newRootId,
      parentLabel,
    });
    linkedEntityUpdates.set(
      linkedId,
      normalizeEntity({
        ...linked,
        fields: [...linked.fields, linkField],
      }),
    );
    return { ...tab, parentLinkFieldId: linkField.id };
  });

  return {
    entities: [
      normalizeEntity({ ...root, tabs: remappedTabs }),
      ...ownedClones,
    ],
    linkedEntityUpdates: [...linkedEntityUpdates.entries()].map(
      ([id, entity]) => ({ id, entity }),
    ),
  };
}
