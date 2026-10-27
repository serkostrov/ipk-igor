import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRecordTitle,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import type { AutomationViewEntityField } from "../model/types";

function normalizeMatchTokens(
  value: string | undefined,
  fieldType?: EntityField["type"],
): string[] {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  if (
    fieldType === "relation" ||
    fieldType === "belonging" ||
    fieldType === "list" ||
    fieldType === "lookup" ||
    raw.startsWith("[")
  ) {
    return parseEntityRelationIds(raw);
  }
  return [raw];
}

/** Whether two field values count as equal for view-entity match params. */
export function viewEntityFieldValuesMatch(
  left: string | undefined,
  right: string | undefined,
  leftType?: EntityField["type"],
  rightType?: EntityField["type"],
): boolean {
  const leftTokens = normalizeMatchTokens(left, leftType);
  const rightTokens = normalizeMatchTokens(right, rightType);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  const rightSet = new Set(
    rightTokens.map((token) => token.toLocaleLowerCase("ru")),
  );
  return leftTokens.some((token) =>
    rightSet.has(token.toLocaleLowerCase("ru")),
  );
}

export type ViewEntityFieldRow = {
  viewId: string;
  field: EntityField;
};

export type ViewEntityGroup = {
  entity: Entity;
  record: EntityRecord;
  recordTitle: string;
  fields: ViewEntityFieldRow[];
};

export type ViewEntityEmpty = {
  viewId: string;
  entityLabel: string;
  fieldLabel: string;
  reason: "no-match" | "missing-config";
};

function recordMatchesView(
  record: EntityRecord,
  entity: Entity,
  view: AutomationViewEntityField,
  triggerEntity: Entity,
  triggerValues: Record<string, string>,
): boolean {
  if (view.matches.length === 0) return false;
  for (const match of view.matches) {
    const entityField = entity.fields.find(
      (field) => field.id === match.entityFieldId,
    );
    const triggerField = triggerEntity.fields.find(
      (field) => field.id === match.triggerFieldId,
    );
    if (!entityField || !triggerField) return false;
    if (
      !viewEntityFieldValuesMatch(
        record.values[match.entityFieldId],
        triggerValues[match.triggerFieldId],
        entityField.type,
        triggerField.type,
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve read-only fields from arbitrary entities by match parameters
 * against the trigger record.
 */
export function resolveViewEntityFieldsLayout(options: {
  triggerEntity: Entity;
  entities: Entity[];
  entityFields: AutomationViewEntityField[];
  triggerValues: Record<string, string>;
  ctx: EntityValueContext;
}): {
  groups: ViewEntityGroup[];
  empty: ViewEntityEmpty[];
} {
  const { triggerEntity, entities, entityFields, triggerValues, ctx } = options;
  if (entityFields.length === 0) {
    return { groups: [], empty: [] };
  }

  const entityById = new Map(entities.map((item) => [item.id, item]));
  const byRecord = new Map<string, ViewEntityGroup>();
  const empty: ViewEntityEmpty[] = [];

  for (const view of entityFields) {
    const entity = entityById.get(view.entityId);
    const field = entity?.fields.find((item) => item.id === view.fieldId);
    if (!entity || !field) {
      empty.push({
        viewId: view.id,
        entityLabel: entity
          ? getEntityDisplayName(entity)
          : view.entityId || "Сущность",
        fieldLabel: field
          ? getEntityFieldDisplayName(field)
          : view.fieldId || "Поле",
        reason: "missing-config",
      });
      continue;
    }

    const matches = entity.records.filter((record) =>
      recordMatchesView(record, entity, view, triggerEntity, triggerValues),
    );

    if (matches.length === 0) {
      empty.push({
        viewId: view.id,
        entityLabel: getEntityDisplayName(entity),
        fieldLabel: getEntityFieldDisplayName(field),
        reason: "no-match",
      });
      continue;
    }

    for (const record of matches) {
      const key = `${entity.id}:${record.id}`;
      let group = byRecord.get(key);
      if (!group) {
        group = {
          entity,
          record,
          recordTitle: getEntityRecordTitle(ctx, entity, record),
          fields: [],
        };
        byRecord.set(key, group);
      }
      if (group.fields.some((row) => row.viewId === view.id)) continue;
      group.fields.push({ viewId: view.id, field });
    }
  }

  return {
    groups: [...byRecord.values()],
    empty,
  };
}
