import type { ReactNode } from "react";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  RecordValue,
  type EntityValueContext,
} from "@/entities/entity";
import type { ViewEntityEmpty, ViewEntityGroup } from "@/entities/automation";
import type {
  RelatedAskEmptyRelation,
  RelatedAskGroup,
} from "../lib/task-related-ask";

type TriggerViewField = {
  id: string;
  label: string;
  node: ReactNode;
};

type TaskViewContextFieldsProps = {
  triggerViewFields: TriggerViewField[];
  relatedGroups: RelatedAskGroup[];
  relatedEmpty: RelatedAskEmptyRelation[];
  entityGroups: ViewEntityGroup[];
  entityEmpty: ViewEntityEmpty[];
  ctx: EntityValueContext;
};

export function TaskViewContextFields({
  triggerViewFields,
  relatedGroups,
  relatedEmpty,
  entityGroups,
  entityEmpty,
  ctx,
}: TaskViewContextFieldsProps) {
  const hasTrigger = triggerViewFields.length > 0;
  const hasRelated = relatedGroups.length > 0 || relatedEmpty.length > 0;
  const hasEntity = entityGroups.length > 0 || entityEmpty.length > 0;
  if (!hasTrigger && !hasRelated && !hasEntity) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Для просмотра
      </p>

      {hasTrigger ? (
        <div className="flex flex-col gap-2">
          {triggerViewFields.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {item.label}
              </span>
              {item.node}
            </div>
          ))}
        </div>
      ) : null}

      {hasRelated ? (
        <div className="flex flex-col gap-2">
          {hasTrigger || hasEntity ? (
            <p className="text-[10px] font-medium text-muted-foreground/90">
              Связанные
            </p>
          ) : null}
          {relatedEmpty.map((item) => (
            <p
              key={item.relationFieldId}
              className="rounded-lg border border-dashed border-border/70 bg-background/50 px-2.5 py-2 text-[11px] text-muted-foreground"
            >
              Нет связанных записей «{item.relationLabel}»
            </p>
          ))}
          {relatedGroups.map((group) => {
            const showTitle =
              relatedGroups.filter(
                (item) => item.relationFieldId === group.relationFieldId,
              ).length > 1;
            return (
              <div
                key={`${group.relationFieldId}:${group.relatedRecordId}`}
                className="flex flex-col gap-2"
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
                  const relatedRecord = group.relatedEntity.records.find(
                    (item) => item.id === group.relatedRecordId,
                  );
                  if (!relatedRecord) return null;
                  return (
                    <div
                      key={row.askId}
                      className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
                    >
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {getEntityFieldDisplayName(row.field)}
                      </span>
                      <RecordValue
                        ctx={ctx}
                        entity={group.relatedEntity}
                        record={relatedRecord}
                        field={row.field}
                        className="text-sm text-foreground"
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}

      {hasEntity ? (
        <div className="flex flex-col gap-2">
          {hasTrigger || hasRelated ? (
            <p className="text-[10px] font-medium text-muted-foreground/90">
              Из других сущностей
            </p>
          ) : null}
          {entityEmpty.map((item) => (
            <p
              key={item.viewId}
              className="rounded-lg border border-dashed border-border/70 bg-background/50 px-2.5 py-2 text-[11px] text-muted-foreground"
            >
              {item.reason === "missing-config"
                ? `Не настроено: ${item.entityLabel} · ${item.fieldLabel}`
                : `Нет записи «${item.entityLabel}» по параметрам · ${item.fieldLabel}`}
            </p>
          ))}
          {entityGroups.map((group) => {
            const showTitle =
              entityGroups.filter((item) => item.entity.id === group.entity.id)
                .length > 1;
            return (
              <div
                key={`${group.entity.id}:${group.record.id}`}
                className="flex flex-col gap-2"
              >
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  {getEntityDisplayName(group.entity)}
                  {showTitle ? (
                    <>
                      <span className="text-muted-foreground/50"> · </span>
                      <span className="text-foreground">
                        {group.recordTitle}
                      </span>
                    </>
                  ) : null}
                </p>
                {group.fields.map((row) => (
                  <div
                    key={row.viewId}
                    className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
                  >
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {getEntityFieldDisplayName(row.field)}
                    </span>
                    <RecordValue
                      ctx={ctx}
                      entity={group.entity}
                      record={group.record}
                      field={row.field}
                      className="text-sm text-foreground"
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
