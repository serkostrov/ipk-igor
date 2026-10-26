import {
  getEntityFieldDisplayName,
  getEntityListParentField,
  getVisibleListOptions,
  parseEntityListValueIds,
  resolveEntityListFieldPresentation,
  type Entity,
  type EntityValueContext,
} from "@/entities/entity";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
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
}: {
  groups: RelatedAskGroup[];
  emptyRelations: RelatedAskEmptyRelation[];
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (valueKey: string, value: string) => void;
}) {
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
      {groups.map((group, groupIndex) => {
        const showTitle =
          groups.filter(
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
              const { field, relatedEntity } = {
                field: row.field,
                relatedEntity: group.relatedEntity,
              };
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
