import { useEffect, useMemo, useRef } from "react";
import {
  collectTkpStageDepartmentPairs,
  createEntityDraftRecord,
  findDeptCalculationsGroupsField,
  getEntityFieldDisplayName,
  getEntityListParentField,
  getVisibleListOptions,
  isDeptCalculationsEntity,
  isEntityFieldVisibleByConditions,
  parseEntityListValueIds,
  resolveEntityListFieldPresentation,
  serializeEntityRelationGroups,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import type {
  RelatedAskEmptyRelation,
  RelatedAskGroup,
} from "../lib/task-related-ask";

/** One relationGroups value with all stage×department pairs from sibling rows. */
function mergeDeptCalculationGroupsValue(
  entity: Entity,
  records: readonly EntityRecord[],
): string {
  const groupsField = findDeptCalculationsGroupsField(entity);
  if (!groupsField) return "";
  const byStage = new Map<string, Set<string>>();
  for (const record of records) {
    for (const pair of collectTkpStageDepartmentPairs(
      record.values[groupsField.id],
    )) {
      const set = byStage.get(pair.stageId) ?? new Set<string>();
      set.add(pair.departmentId);
      byStage.set(pair.stageId, set);
    }
  }
  if (byStage.size === 0) return "";
  return serializeEntityRelationGroups(
    [...byStage.entries()].map(([stageId, departmentIds]) => ({
      id: stageId,
      children: [...departmentIds].map((id) => ({ id, children: [] })),
    })),
  );
}

type DisplayAskGroup = RelatedAskGroup & {
  /** Merged stage×department tree for the fill picker (fan-out siblings). */
  mergedGroupsValue?: string;
};

/**
 * Related ask for «Расчёты отделов»: one «Стадия/отделы» picker (merged),
 * not the department-calculations table. Table view stays on the entity page.
 */
function collapseDeptCalculationGroups(
  groups: RelatedAskGroup[],
  entities: Entity[],
): DisplayAskGroup[] {
  const deptByEntity = new Map<string, RelatedAskGroup[]>();
  const other: DisplayAskGroup[] = [];

  for (const group of groups) {
    if (!isDeptCalculationsEntity(group.relatedEntity)) {
      other.push(group);
      continue;
    }
    const list = deptByEntity.get(group.relatedEntity.id) ?? [];
    list.push(group);
    deptByEntity.set(group.relatedEntity.id, list);
  }

  const collapsed: DisplayAskGroup[] = [];
  for (const [entityId, list] of deptByEntity) {
    const primary = list[0];
    if (!primary) continue;
    const live =
      entities.find((item) => item.id === entityId) ?? primary.relatedEntity;
    const recordIds = [...new Set(list.map((item) => item.relatedRecordId))];
    const records = live.records.filter((record) =>
      recordIds.includes(record.id),
    );
    const groupsField = findDeptCalculationsGroupsField(live);
    const mergedGroupsValue = mergeDeptCalculationGroupsValue(live, records);

    // One form on the primary row — siblings are covered by fan-out on persist.
    const fields = primary.fields;

    collapsed.push({
      ...primary,
      relatedEntity: live,
      relatedRecordTitle:
        records.length > 1
          ? `${live.namePlural.trim() || live.name.trim() || "Записи"} · ${records.length}`
          : primary.relatedRecordTitle,
      fields: fields.map((row) =>
        groupsField && row.field.id === groupsField.id
          ? { ...row, relationGroupsMode: "full" as const }
          : row,
      ),
      ...(mergedGroupsValue ? { mergedGroupsValue } : {}),
    });
  }

  return [...collapsed, ...other];
}

export function TaskRelatedAskFields({
  groups,
  emptyRelations,
  values,
  entities,
  ctx,
  disabled,
  onChange,
  softFillParent = null,
}: {
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (valueKey: string, value: string) => void;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
}) {
  const displayGroups = useMemo(
    () => collapseDeptCalculationGroups(groups, entities),
    [groups, entities],
  );

  const onChangeRef = useRef(onChange);
  const valuesRef = useRef(values);
  useEffect(() => {
    onChangeRef.current = onChange;
    valuesRef.current = values;
  }, [onChange, values]);

  // Seed the primary «Стадия/отделы» draft with the merged tree so the picker
  // shows every stage×department already fan-out into sibling rows.
  useEffect(() => {
    for (const group of displayGroups) {
      if (!isDeptCalculationsEntity(group.relatedEntity)) continue;
      const groupsField = findDeptCalculationsGroupsField(group.relatedEntity);
      if (!groupsField || !group.mergedGroupsValue) continue;
      const row = group.fields.find((item) => item.field.id === groupsField.id);
      if (!row) continue;
      const current = valuesRef.current[row.valueKey] ?? "";
      if (current === group.mergedGroupsValue) continue;

      const currentPairs = collectTkpStageDepartmentPairs(current);
      const mergedPairs = collectTkpStageDepartmentPairs(
        group.mergedGroupsValue,
      );
      // Keep an in-progress richer draft (user added depts not yet persisted).
      if (currentPairs.length > mergedPairs.length) continue;
      const mergedKeys = new Set(
        mergedPairs.map((pair) => `${pair.stageId}\0${pair.departmentId}`),
      );
      const hasUnsaved = currentPairs.some(
        (pair) => !mergedKeys.has(`${pair.stageId}\0${pair.departmentId}`),
      );
      if (hasUnsaved) continue;

      onChangeRef.current(row.valueKey, group.mergedGroupsValue);
    }
  }, [displayGroups]);

  if (groups.length === 0 && emptyRelations.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Связанные записи
      </p>
      {emptyRelations.map((item) => (
        <p
          key={item.relationFieldId}
          className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground"
        >
          Нет связанных записей «{item.relationLabel}». Сначала создайте их
          (автозаполнение или предыдущий шаг).
        </p>
      ))}

      {displayGroups.map((group, groupIndex) => {
        const showTitle =
          displayGroups.filter(
            (item) => item.relationFieldId === group.relationFieldId,
          ).length > 1;
        return (
          <div
            key={`${group.relationFieldId}:${group.relatedRecordId}`}
            className={
              groupIndex > 0
                ? "flex flex-col gap-3 border-t border-border/50 pt-3.5"
                : "flex flex-col gap-3"
            }
          >
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              {group.relationLabel}
              {showTitle ? (
                <>
                  <span className="text-muted-foreground/50"> · </span>
                  <span className="text-foreground">
                    {group.relatedRecordTitle}
                  </span>
                </>
              ) : null}
            </p>
            {group.fields.map((row) => {
              const field = row.field;
              const relatedEntity = group.relatedEntity;
              const parentField = getEntityListParentField(
                relatedEntity,
                field,
              );
              const relatedRecord = relatedEntity.records.find(
                (item) => item.id === group.relatedRecordId,
              );
              const relatedMerged = {
                ...(relatedRecord?.values ?? {}),
                ...Object.fromEntries(
                  group.fields.map((item) => [
                    item.field.id,
                    values[item.valueKey] ?? "",
                  ]),
                ),
              };
              const groupsField =
                findDeptCalculationsGroupsField(relatedEntity);
              if (
                groupsField &&
                field.id === groupsField.id &&
                group.mergedGroupsValue &&
                !(values[row.valueKey] ?? "").trim()
              ) {
                relatedMerged[groupsField.id] = group.mergedGroupsValue;
              }
              const relatedDraft = createEntityDraftRecord(
                relatedMerged,
                group.relatedRecordId,
              );
              if (
                !isEntityFieldVisibleByConditions(
                  ctx,
                  relatedEntity,
                  relatedDraft,
                  field,
                )
              ) {
                return null;
              }
              const parentValue = parentField
                ? (relatedMerged[parentField.id] ?? "")
                : undefined;
              const listOptions =
                field.type === "list"
                  ? getVisibleListOptions(
                      field,
                      parentValue,
                      parentField,
                      entities,
                    )
                  : field.listOptions;
              const listPresentation = resolveEntityListFieldPresentation(
                field,
                entities,
              );
              const listDisabled =
                field.type === "list" &&
                parentField != null &&
                parseEntityListValueIds(parentValue).length === 0;

              return (
                <div key={row.valueKey}>
                  <RecordFieldControl
                    ctx={ctx}
                    entity={relatedEntity}
                    field={field}
                    value={
                      values[row.valueKey] ??
                      (groupsField &&
                      field.id === groupsField.id &&
                      group.mergedGroupsValue
                        ? group.mergedGroupsValue
                        : "")
                    }
                    values={relatedMerged}
                    onChange={(value) => onChange(row.valueKey, value)}
                    listOptions={listOptions}
                    listDisabled={listDisabled || disabled === true}
                    listDisabledHint={
                      parentField
                        ? `Сначала выберите «${getEntityFieldDisplayName(parentField)}»`
                        : undefined
                    }
                    listMultiple={listPresentation.listMultiple}
                    showColors={listPresentation.listUseColors}
                    listAllowEmpty={!row.required}
                    entities={entities}
                    recordId={group.relatedRecordId}
                    required={row.required}
                    relationGroupsMode={row.relationGroupsMode ?? "full"}
                    softFillParent={softFillParent}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
