import { useEffect, useMemo, useRef } from "react";
import {
  collectDeptCalculationSiblingRecords,
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
  serializeTkpStageDepartmentPairs,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  filterDeptCalculationRecordsForAssignee,
  isTkpAnalysisEntity,
  resolveDeptCalculationsHostFields,
  resolveEditableDeptCalculationRecordIds,
  TkpReviewHardcodeSlot,
} from "@/features/hardcode";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import { DeptCalculationsView } from "@/pages/entity/ui/DeptCalculationsView";
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
  const pairs = records.flatMap((record) =>
    collectTkpStageDepartmentPairs(record.values[groupsField.id]),
  );
  return serializeTkpStageDepartmentPairs(pairs);
}

type DisplayAskGroup = RelatedAskGroup & {
  /** Merged stage×department tree for the fill picker (fan-out siblings). */
  mergedGroupsValue?: string;
};

/**
 * Related ask for «Расчёты отделов»: prefer the departments table (stage
 * groups). Flat field controls remain a fallback when the groups field is
 * the only ask (department selection step).
 */
function collapseDeptCalculationGroups(
  groups: RelatedAskGroup[],
  entities: Entity[],
  softFillParent?: { entity: Entity; record: EntityRecord } | null,
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
    const parent =
      softFillParent != null
        ? { entity: softFillParent.entity, recordId: softFillParent.record.id }
        : null;
    // Ask layout may only list a subset — pull every fan-out sibling that
    // shares the same parent so stages do not lose departments on reload.
    const records = collectDeptCalculationSiblingRecords(
      live,
      recordIds,
      parent,
    );
    const groupsField = findDeptCalculationsGroupsField(live);
    const mergedGroupsValue = mergeDeptCalculationGroupsValue(live, records);
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

function collectDeptCalcAskBundle(
  groups: RelatedAskGroup[],
  entities: Entity[],
): {
  entity: Entity;
  recordIds: string[];
  relationLabel: string;
  /**
   * Host fields (срок / описание / …) that this ask actually requests —
   * when non-empty we show the departments table instead of flat controls.
   */
  tableFieldIds: Set<string>;
  /** Asks that still need flat controls (e.g. stage/dept picker). */
  leftoverFields: RelatedAskGroup["fields"];
  primary: RelatedAskGroup;
} | null {
  const deptGroups = groups.filter((group) =>
    isDeptCalculationsEntity(group.relatedEntity),
  );
  if (deptGroups.length === 0) return null;
  const primary = deptGroups[0]!;
  const entity =
    entities.find((item) => item.id === primary.relatedEntity.id) ??
    primary.relatedEntity;
  const hostFields = resolveDeptCalculationsHostFields(entity);
  const groupsField = findDeptCalculationsGroupsField(entity);
  const askedFieldIds = new Set(primary.fields.map((row) => row.field.id));
  const hostTableFieldIds = new Set(
    [hostFields.deadline, hostFields.description, hostFields.comment]
      .filter(Boolean)
      .map((field) => field!.id),
  );
  // Only show the fill table when this outcome asks for table-owned fields.
  // Selection step asks «Стадия/отделы» alone — keep the groups picker.
  const tableFieldIds = new Set(
    [...hostTableFieldIds].filter((id) => askedFieldIds.has(id)),
  );
  const leftoverFields = primary.fields.filter((row) => {
    if (tableFieldIds.has(row.field.id)) return false;
    // On a fill-table step, groups are already chosen — hide the picker.
    // On a selection step (no table fields asked), keep «Стадия/отделы».
    if (
      groupsField &&
      row.field.id === groupsField.id &&
      tableFieldIds.size > 0
    ) {
      return false;
    }
    return true;
  });
  return {
    entity,
    recordIds: [...new Set(deptGroups.map((item) => item.relatedRecordId))],
    relationLabel: primary.relationLabel,
    tableFieldIds,
    leftoverFields,
    primary,
  };
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
  assigneeUserId = null,
  onSeedChange,
}: {
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (valueKey: string, value: string) => void;
  /**
   * Sync draft from live fan-out siblings without marking the form dirty
   * (avoids re-persist of a partial merge right after save).
   */
  onSeedChange?: (valueKey: string, value: string) => void;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
  /** Task assignee — filters «Расчёты отделов» to this head’s stages. */
  assigneeUserId?: string | null;
}) {
  const displayGroups = useMemo(
    () => collapseDeptCalculationGroups(groups, entities, softFillParent),
    [groups, entities, softFillParent],
  );

  const deptBundle = useMemo(
    () => collectDeptCalcAskBundle(groups, entities),
    [groups, entities],
  );

  const deptTableRecords = useMemo(() => {
    if (!deptBundle) return [];
    const live =
      entities.find((item) => item.id === deptBundle.entity.id) ??
      deptBundle.entity;
    const parent =
      softFillParent != null
        ? { entity: softFillParent.entity, recordId: softFillParent.record.id }
        : null;
    const linked = collectDeptCalculationSiblingRecords(
      live,
      deptBundle.recordIds,
      parent,
    );
    return filterDeptCalculationRecordsForAssignee({
      entity: live,
      records: linked,
      entities,
      assigneeUserId,
      leadParent: softFillParent,
    });
  }, [deptBundle, entities, assigneeUserId, softFillParent]);

  const editableDeptRecordIds = useMemo(() => {
    if (!deptBundle) return null;
    const live =
      entities.find((item) => item.id === deptBundle.entity.id) ??
      deptBundle.entity;
    return resolveEditableDeptCalculationRecordIds({
      entity: live,
      records: deptTableRecords,
      entities,
      assigneeUserId,
      leadParent: softFillParent,
    });
  }, [deptBundle, deptTableRecords, entities, assigneeUserId, softFillParent]);

  const flatGroups = useMemo(() => {
    if (!deptBundle) return displayGroups;
    const nonDept = displayGroups.filter(
      (group) => !isDeptCalculationsEntity(group.relatedEntity),
    );
    if (deptBundle.leftoverFields.length === 0) return nonDept;
    return [
      {
        ...deptBundle.primary,
        relatedEntity: deptBundle.entity,
        fields: deptBundle.leftoverFields,
      },
      ...nonDept,
    ];
  }, [displayGroups, deptBundle]);

  const onChangeRef = useRef(onChange);
  const onSeedChangeRef = useRef(onSeedChange);
  const valuesRef = useRef(values);
  /** Last value we auto-seeded per key — allows growing as siblings load. */
  const lastAutoSeedRef = useRef<Record<string, string>>({});
  useEffect(() => {
    onChangeRef.current = onChange;
    onSeedChangeRef.current = onSeedChange;
    valuesRef.current = values;
  }, [onChange, onSeedChange, values]);

  // Expand a pristine live draft (empty / single fan-out row) to the full
  // sibling tree. Never overwrite a user-edited draft — that restored deletes
  // and randomly wiped stages while autosave was still writing siblings.
  useEffect(() => {
    const seed = onSeedChangeRef.current ?? onChangeRef.current;
    for (const group of displayGroups) {
      if (!isDeptCalculationsEntity(group.relatedEntity)) continue;
      const groupsField = findDeptCalculationsGroupsField(group.relatedEntity);
      if (!groupsField || !group.mergedGroupsValue) continue;
      const row = group.fields.find((item) => item.field.id === groupsField.id);
      if (!row) continue;
      const key = row.valueKey;
      const current = valuesRef.current[key] ?? "";
      const merged = group.mergedGroupsValue;
      if (!merged || current === merged) {
        if (current === merged) lastAutoSeedRef.current[key] = merged;
        continue;
      }

      const livePrimary = group.relatedEntity.records.find(
        (item) => item.id === group.relatedRecordId,
      );
      const liveRaw = livePrimary?.values[groupsField.id] ?? "";
      const lastSeeded = lastAutoSeedRef.current[key] ?? "";
      const currentPairs = collectTkpStageDepartmentPairs(current);
      const lastPairs = collectTkpStageDepartmentPairs(lastSeeded);
      // User removed departments — never grow the draft back from live siblings.
      if (lastSeeded !== "" && currentPairs.length < lastPairs.length) {
        continue;
      }
      // Pristine = empty, still equal to live row, or only what we auto-filled.
      const pristine =
        current.trim() === "" ||
        current === liveRaw ||
        (lastSeeded !== "" && current === lastSeeded);
      if (!pristine) continue;

      const mergedPairs = collectTkpStageDepartmentPairs(merged);
      if (mergedPairs.length <= currentPairs.length) continue;
      lastAutoSeedRef.current[key] = merged;
      seed(key, merged);
    }
  }, [displayGroups]);

  if (groups.length === 0 && emptyRelations.length === 0) return null;

  const showDeptTable = Boolean(
    deptBundle && deptBundle.tableFieldIds.size > 0,
  );

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

      {showDeptTable && deptBundle ? (
        <div className="flex flex-col gap-2">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {deptBundle.relationLabel}
          </p>
          {deptTableRecords.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
              Нет расчётов отделов для этого исполнителя. Проверьте выбор
              отделов на предыдущем шаге.
            </p>
          ) : (
            <DeptCalculationsView
              entity={
                entities.find((item) => item.id === deptBundle.entity.id) ??
                deptBundle.entity
              }
              records={deptTableRecords}
              leadParent={softFillParent}
              editableRecordIds={editableDeptRecordIds}
            />
          )}
          {softFillParent && isTkpAnalysisEntity(softFillParent.entity) ? (
            <TkpReviewHardcodeSlot
              entity={softFillParent.entity}
              record={softFillParent.record}
              readOnly={disabled}
              sections={["gip"]}
            />
          ) : null}
        </div>
      ) : null}

      {flatGroups.map((group, groupIndex) => {
        const showTitle =
          flatGroups.filter(
            (item) => item.relationFieldId === group.relationFieldId,
          ).length > 1;
        return (
          <div
            key={`${group.relationFieldId}:${group.relatedRecordId}`}
            className={
              groupIndex > 0 || showDeptTable
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
