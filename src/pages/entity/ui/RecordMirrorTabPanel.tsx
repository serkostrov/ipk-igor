import { useMemo, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { canField, useCurrentRole } from "@/entities/access";
import {
  filterEntityFieldGroupsForTab,
  getEntityFieldDisplayName,
  getEntityFieldGroupArea,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  groupEntityFields,
  isEntityFieldVisibleOnRecord,
  isEntityFilesTab,
  isEntityHistoryTab,
  isEntityNameField,
  isEntityRecordsTab,
  isEntityTabWithLinkedEntity,
  PRIMARY_ENTITY_FIELD_GROUP,
  RecordValue,
  resolveEntityMirrorTab,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";
import { RecordEntityTabPanel } from "./RecordEntityTabPanel";
import { RecordFilesTabPanel } from "./RecordFilesTabPanel";
import { RecordHistoryTabPanel } from "./RecordHistoryTabPanel";
import { RecordNotesTabPanel } from "./RecordNotesTabPanel";

type RecordMirrorTabPanelProps = {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  tab: EntityTab;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

function MirrorEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function MirrorFieldsPanel({
  entity,
  record,
  tab,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
}) {
  const role = useCurrentRole();
  const valueContext = useEntityValueContext();

  const groups = useMemo(() => {
    const fields = entity.fields.filter((field) => {
      if (isEntityNameField(field)) return false;
      if (!isEntityFieldVisibleOnRecord(field)) return false;
      if (!canField(role, entity.id, field.id, "view")) return false;
      const groupName = getEntityFieldGroupName(field.group);
      if (groupName === PRIMARY_ENTITY_FIELD_GROUP) return false;
      if (
        getEntityFieldGroupArea(groupName, entity.fieldGroups) === "primary"
      ) {
        return false;
      }
      return getEntityFieldTabId(field) === tab.id;
    });
    return groupEntityFields(
      fields,
      filterEntityFieldGroupsForTab(entity.fieldGroups, tab.id, fields),
    ).filter((group) => group.fields.length > 0);
  }, [entity, role, tab.id]);

  if (groups.length === 0) {
    return <MirrorEmpty>На этой вкладке нет полей.</MirrorEmpty>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.name}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <header className="flex h-9 items-center border-b border-border bg-muted/40 px-4">
            <h3 className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {group.name}
            </h3>
          </header>
          <div className="divide-y divide-border/70">
            {group.fields.map((field: EntityField) => (
              <div
                key={field.id}
                className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5"
              >
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {getEntityFieldDisplayName(field)}
                </p>
                <RecordValue
                  ctx={valueContext}
                  entity={entity}
                  record={record}
                  field={field}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RecordMirrorTabPanel({
  hostEntity,
  hostRecord,
  tab,
  onOpenRelation,
}: RecordMirrorTabPanelProps) {
  const { entities } = useEntityConfig();
  const resolved = resolveEntityMirrorTab(
    tab,
    hostEntity,
    hostRecord,
    entities,
  );

  if (!resolved) {
    return (
      <MirrorEmpty>
        Настройте поле связи и вкладку источника для этой вкладки.
      </MirrorEmpty>
    );
  }

  const {
    relationField,
    sourceEntity,
    sourceTab,
    sourceRecord,
    sourceRecordId,
  } = resolved;
  const relationLabel = getEntityFieldDisplayName(relationField);
  const nameField =
    sourceEntity.fields.find((field) => isEntityNameField(field)) ?? null;
  const sourceTitle = sourceRecord
    ? nameField
      ? sourceRecord.values[nameField.id]?.trim() || "Без названия"
      : "Запись"
    : null;

  if (!sourceRecordId || !sourceRecord) {
    return (
      <MirrorEmpty>
        В поле «{relationLabel}» не выбрана запись — нечего показать.
      </MirrorEmpty>
    );
  }

  const openSource =
    onOpenRelation != null
      ? () => onOpenRelation(sourceEntity.id, sourceRecord.id)
      : undefined;

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="min-w-0 text-xs text-muted-foreground">
        Данные записи «{sourceTitle}» · вкладка «{sourceTab.name}»
      </p>
      {openSource ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={openSource}
        >
          Открыть
          <ArrowUpRight className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );

  const body: ReactNode = (() => {
    if (isEntityTabWithLinkedEntity(sourceTab) && sourceTab.linkedEntityId) {
      const linkedEntity =
        entities.find((item) => item.id === sourceTab.linkedEntityId) ?? null;
      return linkedEntity ? (
        <RecordEntityTabPanel
          tab={sourceTab}
          linkedEntity={linkedEntity}
          parentEntityId={sourceEntity.id}
          parentRecordId={sourceRecord.id}
          entities={entities}
          onOpenRelation={onOpenRelation}
        />
      ) : (
        <MirrorEmpty>Связанная сущность не найдена.</MirrorEmpty>
      );
    }
    if (isEntityRecordsTab(sourceTab)) {
      return (
        <RecordNotesTabPanel
          entity={sourceEntity}
          record={sourceRecord}
          tab={sourceTab}
        />
      );
    }
    if (isEntityFilesTab(sourceTab)) {
      return (
        <RecordFilesTabPanel
          entity={sourceEntity}
          record={sourceRecord}
          tab={sourceTab}
        />
      );
    }
    if (isEntityHistoryTab(sourceTab)) {
      return (
        <RecordHistoryTabPanel
          entity={sourceEntity}
          record={sourceRecord}
          tab={sourceTab}
        />
      );
    }
    return (
      <MirrorFieldsPanel
        entity={sourceEntity}
        record={sourceRecord}
        tab={sourceTab}
      />
    );
  })();

  return (
    <div>
      {header}
      {body}
    </div>
  );
}
