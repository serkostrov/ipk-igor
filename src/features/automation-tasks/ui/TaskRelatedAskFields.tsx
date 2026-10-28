import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEntityDraftRecord,
  findDeptCalculationsGroupsField,
  getEntityFieldDisplayName,
  getEntityListParentField,
  getVisibleListOptions,
  isDeptCalculationsEntity,
  isEntityFieldVisibleByConditions,
  parseEntityListValueIds,
  resolveEntityListFieldPresentation,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import { DeptCalculationsView } from "@/pages/entity/ui/DeptCalculationsView";
import { EntityRecordDialog } from "@/pages/entity/ui/EntityRecordDialog";
import type {
  RelatedAskEmptyRelation,
  RelatedAskGroup,
} from "../lib/task-related-ask";

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
  const deptGroups = useMemo(
    () =>
      groups.filter((group) => isDeptCalculationsEntity(group.relatedEntity)),
    [groups],
  );
  const otherGroups = useMemo(
    () =>
      groups.filter((group) => !isDeptCalculationsEntity(group.relatedEntity)),
    [groups],
  );

  const deptBlocks = useMemo(() => {
    const byEntity = new Map<
      string,
      {
        entity: Entity;
        recordIds: string[];
        label: string;
        groups: RelatedAskGroup[];
      }
    >();
    for (const group of deptGroups) {
      const live =
        entities.find((item) => item.id === group.relatedEntity.id) ??
        group.relatedEntity;
      const existing = byEntity.get(live.id);
      if (existing) {
        if (!existing.recordIds.includes(group.relatedRecordId)) {
          existing.recordIds.push(group.relatedRecordId);
        }
        existing.groups.push(group);
        continue;
      }
      byEntity.set(live.id, {
        entity: live,
        recordIds: [group.relatedRecordId],
        label: group.relationLabel,
        groups: [group],
      });
    }
    return [...byEntity.values()].map((block) => {
      const groupsField = findDeptCalculationsGroupsField(block.entity);
      return {
        ...block,
        // Skip empty shells — fan-out / drafts without stage×department.
        records: block.entity.records.filter((record) => {
          if (!block.recordIds.includes(record.id)) return false;
          if (!groupsField) return true;
          return Boolean((record.values[groupsField.id] ?? "").trim());
        }),
      };
    });
  }, [deptGroups, entities]);

  const [hostEdit, setHostEdit] = useState<{
    entity: Entity;
    record: EntityRecord;
  } | null>(null);

  /** Keep related:* keys in sync with live store (view / fan-out write there). */
  const onChangeRef = useRef(onChange);
  const valuesRef = useRef(values);
  useEffect(() => {
    onChangeRef.current = onChange;
    valuesRef.current = values;
  }, [onChange, values]);

  useEffect(() => {
    for (const block of deptBlocks) {
      for (const group of block.groups) {
        const record = block.entity.records.find(
          (item) => item.id === group.relatedRecordId,
        );
        if (!record) continue;
        for (const row of group.fields) {
          const live = record.values[row.field.id] ?? "";
          if ((valuesRef.current[row.valueKey] ?? "") === live) continue;
          onChangeRef.current(row.valueKey, live);
        }
      }
    }
  }, [deptBlocks, entities]);

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

      {deptBlocks.map((block) => (
        <div key={block.entity.id} className="flex flex-col gap-2">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {block.label}
          </p>
          {block.records.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
              Нет записей «{block.label}».
            </p>
          ) : (
            <DeptCalculationsView
              entity={block.entity}
              records={block.records}
              onEditRecord={
                disabled
                  ? undefined
                  : (record) => setHostEdit({ entity: block.entity, record })
              }
            />
          )}
        </div>
      ))}

      {otherGroups.map((group, groupIndex) => {
        const showTitle =
          otherGroups.filter(
            (item) => item.relationFieldId === group.relationFieldId,
          ).length > 1;
        return (
          <div
            key={`${group.relationFieldId}:${group.relatedRecordId}`}
            className={
              groupIndex > 0 || deptBlocks.length > 0
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
                    value={values[row.valueKey] ?? ""}
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

      {hostEdit ? (
        <EntityRecordDialog
          open
          onOpenChange={(open) => {
            if (!open) setHostEdit(null);
          }}
          entity={hostEdit.entity}
          record={hostEdit.record}
          entities={entities}
          softFillParent={softFillParent}
          submitLabel="Сохранить"
          onSubmit={async (nextValues) => {
            await updateEntityRecord(
              hostEdit.entity.id,
              hostEdit.record.id,
              nextValues,
            );
            setHostEdit(null);
          }}
        />
      ) : null}
    </div>
  );
}
