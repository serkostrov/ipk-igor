import { useEffect, useState, type ReactNode } from "react";
import {
  ChartGantt,
  ChevronDown,
  ChevronUp,
  Columns3,
  Settings,
  Table2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  ENTITY_VIEW_OPTIONS,
  SYSTEM_ENTITY_KEY_USERS,
  SYSTEM_USERS_FIELD_ROLE_ID,
  addEntityRecord,
  appendEntityRecord,
  getEntityBrowseViews,
  inviteSystemUser,
  isEntityBrowseView,
  isEntityInternal,
  hasEntityPageLayout,
  encodeEntityTableParentValue,
  isEntityTableRelationGroupsNestedSubgroup,
  resolveEntityDefaultView,
  resolveEntityTableParentField,
  resolveEntityTableSubgroupField,
  useEntityConfig,
  useEntityStatus,
  type EntityBrowseView,
  type EntityRecord,
} from "@/entities/entity";
import {
  ROLE_EMPLOYEE_ID,
  useCanEntity,
  useCanInviteUsers,
  useCanSettingsTab,
} from "@/entities/access";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  entityListLocation,
  settingsLocation,
  useAppLocation,
  useAppLocationState,
  useAppNavigate,
} from "@/shared/lib/navigation";
import { EntityTimelineSettingsDialog } from "@/features/manage-entities";
import { isDeptCalculationsEntity } from "@/features/hardcode";
import { EntityRecordDialog } from "./EntityRecordDialog";
import { EntityRecordPage } from "./EntityRecordPage";
import { EntityKanbanView } from "./EntityKanbanView";
import { AddRecordButton, EntityTableView } from "./EntityTableView";
import { DeptCalculationsView } from "./DeptCalculationsView";
import { EntityBoardView } from "./EntityBoardView";
import {
  entityBoardChromeCollapsedKey,
  entityHasBoardChrome,
  parseBoardChromeCollapsed,
} from "./entity-board-chrome";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { EntityTimelineView, TimelineScaleTabs } from "./EntityTimelineView";
import { HiddenRecordsBar } from "./HiddenRecordsBar";
import { useEntityRecordScope } from "./use-entity-record-scope";
import { parseTimelineScale, type TimelineScale } from "../lib/timeline-layout";

function PageHeader({
  title,
  description,
  titleExtra,
  actions,
  descriptionActions,
}: {
  title: string;
  description?: string;
  titleExtra?: ReactNode;
  actions?: ReactNode;
  /** Right-aligned control on the description row (under `actions`). */
  descriptionActions?: ReactNode;
}) {
  const hasDescriptionRow = Boolean(description || descriptionActions);

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleExtra}
        </div>
        {actions ? <div className="shrink-0 pt-0.5">{actions}</div> : null}
      </div>
      {hasDescriptionRow ? (
        <div className="flex items-center justify-between gap-4">
          {description ? (
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {descriptionActions ? (
            <div className="flex shrink-0 items-center">
              {descriptionActions}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type EntityPageProps = {
  entityId: string;
  /** Record id from the URL (`/e/:entityId/r/:recordId`), or null for list. */
  recordId?: string | null;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

const viewIcons: Record<EntityBrowseView, typeof Table2> = {
  table: Table2,
  kanban: Columns3,
  timeline: ChartGantt,
};

function getViewLabel(view: EntityBrowseView) {
  return (
    ENTITY_VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view
  );
}

export function EntityPage({
  entityId,
  recordId = null,
  onOpenRelation,
}: EntityPageProps) {
  const { entities } = useEntityConfig();
  const status = useEntityStatus();
  const entity = entities.find((item) => item.id === entityId);
  const isInternal = entity != null && isEntityInternal(entity);
  const scope = useEntityRecordScope(entity ?? null);
  const location = useAppLocation();
  const { go, replace, back, openRecord } = useAppNavigate();
  const locationState = useAppLocationState();
  const canReadEntity = useCanEntity(entityId, "read");
  const canCreateEntity = useCanEntity(entityId, "create");
  const canInvite = useCanInviteUsers();
  const canOpenEntitySettings = useCanSettingsTab("entities");
  const locationView =
    location.type === "entity" && location.entityId === entityId
      ? location.view
      : undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [createHierarchyGroupId, setCreateHierarchyGroupId] = useState<
    string | null
  >(null);
  const [createHierarchySubgroupId, setCreateHierarchySubgroupId] = useState<
    string | null
  >(null);
  const [timelineSettingsOpen, setTimelineSettingsOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EntityRecord | null>(null);
  const [handledEditId, setHandledEditId] = useState<string | null>(null);
  const [timelineScale, setTimelineScale] = useLocalStorageState(
    `entity-timeline-scale:${entityId}`,
    parseTimelineScale,
    "week" satisfies TimelineScale,
  );
  const [boardChromeCollapsed, setBoardChromeCollapsed] = useLocalStorageState(
    entityBoardChromeCollapsedKey(entityId),
    parseBoardChromeCollapsed,
    false,
  );

  const editRecordId = locationState?.editRecordId ?? null;

  if (editRecordId && editRecordId !== handledEditId && isInternal && entity) {
    setHandledEditId(editRecordId);
    const record =
      entity.records.find((item) => item.id === editRecordId) ?? null;
    setEditingRecord(record);
  }

  useEffect(() => {
    if (!editRecordId) return;
    if (handledEditId !== editRecordId) return;
    // Drop one-shot state so refresh does not reopen the dialog.
    replace(entityListLocation(entityId));
  }, [editRecordId, handledEditId, replace, entityId]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex h-full flex-col gap-2 p-8" aria-busy="true">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-40 animate-pulse rounded-md bg-muted/60" />
              <div className="h-8 w-36 animate-pulse rounded-md bg-muted/40" />
            </div>
            <div className="h-4 w-72 animate-pulse rounded-md bg-muted/40" />
          </div>
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted/50" />
        </div>
        <div className="mt-2 h-9 w-full max-w-xl animate-pulse rounded-md bg-muted/30" />
        <div className="mt-2 h-64 animate-pulse rounded-xl border border-border bg-muted/30" />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Сущность не найдена
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Возможно, она была удалена.
        </p>
      </div>
    );
  }

  const currentEntity = entity;
  const title =
    currentEntity.namePlural.trim() ||
    currentEntity.name.trim() ||
    "Без названия";
  const pageDescription =
    currentEntity.description.trim() ||
    (isDeptCalculationsEntity(currentEntity)
      ? "Для каждого отдела видны руководитель, число подзадач, часы и итоговая сумма. Внутри отдела можно выбрать шаблон подзадачи, указать часы или фиксированную сумму и добавить комментарий."
      : undefined);
  const views = getEntityBrowseViews(currentEntity.views);
  const browseViews =
    views.length > 0 ? views : (["table"] as EntityBrowseView[]);
  const preferredView = resolveEntityDefaultView(currentEntity);
  const activeView =
    locationView && browseViews.includes(locationView)
      ? locationView
      : browseViews.includes(preferredView)
        ? preferredView
        : browseViews[0];
  const isUsersEntity = currentEntity.systemKey === SYSTEM_ENTITY_KEY_USERS;
  const canOpenRecord = currentEntity.fields.length > 0;
  const canCreateRecord =
    canOpenRecord && canCreateEntity && (!isUsersEntity || canInvite);

  const viewingRecord: EntityRecord | null =
    !isInternal && recordId
      ? (currentEntity.records.find((item) => item.id === recordId) ?? null)
      : null;

  if (!isInternal && recordId) {
    if (!viewingRecord) {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Запись не найдена
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Возможно, она была удалена.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-fit"
            onClick={() => replace(entityListLocation(entityId))}
          >
            К списку
          </Button>
        </div>
      );
    }

    return (
      <EntityRecordPage
        key={`${currentEntity.id}-${viewingRecord.id}`}
        entity={currentEntity}
        record={viewingRecord}
        onBack={() => back(entityListLocation(entityId))}
        onDeleted={() => replace(entityListLocation(entityId))}
        onOpenRelation={onOpenRelation}
      />
    );
  }

  if (!canReadEntity) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Нет доступа</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Недостаточно прав для просмотра этой сущности.
        </p>
      </div>
    );
  }

  /** Full record page (kanban / timeline / row). Internal entities use a dialog. */
  function openRecordLocal(record: EntityRecord) {
    if (isInternal) {
      setCreateOpen(false);
      setEditingRecord(record);
      return;
    }
    setEditingRecord(null);
    openRecord(currentEntity.id, record.id);
  }

  /** Pencil — always quick-edit dialog. */
  function editRecordLocal(record: EntityRecord) {
    setCreateOpen(false);
    setEditingRecord(record);
  }

  const tableParentField = resolveEntityTableParentField(currentEntity);
  const tableSubgroupField = resolveEntityTableSubgroupField(currentEntity);

  const addAction = canCreateRecord ? (
    <AddRecordButton
      label={
        isDeptCalculationsEntity(currentEntity) ? "Добавить отдел" : "Добавить"
      }
      onClick={() => {
        setEditingRecord(null);
        setCreateHierarchyGroupId(null);
        setCreateHierarchySubgroupId(null);
        setCreateOpen(true);
      }}
    />
  ) : null;
  const entitySettingsAction = canOpenEntitySettings ? (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0"
      aria-label="Настройки сущности"
      title="Настройки сущности"
      onClick={() =>
        go(
          settingsLocation({
            tab: "entities",
            entityId: currentEntity.id,
          }),
        )
      }
    >
      <Settings className="size-4" />
    </Button>
  ) : null;
  const headerActions =
    entitySettingsAction || addAction ? (
      <div className="flex items-center gap-2">
        {entitySettingsAction}
        {addAction}
      </div>
    ) : null;
  const hiddenRecordsAction =
    scope.hiddenCount > 0 ? <HiddenRecordsBar scope={scope} /> : undefined;
  const timelineScaleAction =
    activeView === "timeline" ? (
      <TimelineScaleTabs value={timelineScale} onChange={setTimelineScale} />
    ) : null;
  const showBoardChromeToggle =
    activeView === "table" && entityHasBoardChrome(currentEntity);
  const boardChromeAction = showBoardChromeToggle ? (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      aria-expanded={!boardChromeCollapsed}
      onClick={() => setBoardChromeCollapsed(!boardChromeCollapsed)}
    >
      {boardChromeCollapsed ? (
        <ChevronDown data-icon="inline-start" aria-hidden />
      ) : (
        <ChevronUp data-icon="inline-start" aria-hidden />
      )}
      {boardChromeCollapsed ? "Развернуть" : "Свернуть"}
    </Button>
  ) : null;
  const descriptionActions =
    boardChromeAction || timelineScaleAction || hiddenRecordsAction ? (
      <div className="flex items-center gap-2">
        {boardChromeAction}
        {hiddenRecordsAction}
        {timelineScaleAction}
      </div>
    ) : undefined;

  function renderView(view: EntityBrowseView) {
    if (view === "table") {
      if (isDeptCalculationsEntity(currentEntity)) {
        return (
          <DeptCalculationsView
            entity={currentEntity}
            records={scope.records}
            onEditRecord={canOpenRecord ? editRecordLocal : undefined}
          />
        );
      }
      const tableProps = {
        entity: currentEntity,
        records: scope.records,
        title,
        onEditRecord: canOpenRecord ? editRecordLocal : undefined,
        onOpenRecord: canOpenRecord ? openRecordLocal : undefined,
        onOpenRelation,
        onCreateChildRecord:
          canCreateRecord && tableParentField
            ? (groupValue: string, subgroupValue?: string) => {
                setEditingRecord(null);
                setCreateHierarchyGroupId(groupValue);
                setCreateHierarchySubgroupId(subgroupValue ?? null);
                setCreateOpen(true);
              }
            : undefined,
      };
      return hasEntityPageLayout(currentEntity) ? (
        <EntityBoardView
          {...tableProps}
          chromeCollapsed={boardChromeCollapsed}
          onChromeCollapsedChange={setBoardChromeCollapsed}
        />
      ) : (
        <EntityTableView {...tableProps} />
      );
    }
    if (view === "timeline") {
      return (
        <EntityTimelineView
          entity={currentEntity}
          records={scope.records}
          scale={timelineScale}
          onOpenRecord={canOpenRecord ? editRecordLocal : undefined}
          onConfigure={() => setTimelineSettingsOpen(true)}
        />
      );
    }
    return (
      <EntityKanbanView
        entity={currentEntity}
        records={scope.records}
        hiddenOptionIds={scope.showHidden ? null : scope.hiddenOptionIds}
        title={title}
        onOpenRecord={canOpenRecord ? openRecordLocal : undefined}
      />
    );
  }

  const content =
    browseViews.length > 1 ? (
      <Tabs
        key={currentEntity.id}
        value={activeView}
        onValueChange={(next) => {
          if (!isEntityBrowseView(next)) return;
          go(entityListLocation(currentEntity.id, next));
        }}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <PageHeader
          title={title}
          description={pageDescription}
          titleExtra={
            <TabsList className="!h-8 gap-0.5 p-0.5">
              {browseViews.map((view) => {
                const Icon = viewIcons[view];
                return (
                  <TabsTrigger
                    key={view}
                    value={view}
                    className="h-full flex-none gap-1 px-2.5 text-xs font-medium"
                  >
                    <Icon className="size-3 opacity-70" aria-hidden />
                    {getViewLabel(view)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          }
          actions={headerActions}
          descriptionActions={descriptionActions}
        />

        {browseViews.map((view) => (
          <TabsContent
            key={view}
            value={view}
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            {renderView(view)}
          </TabsContent>
        ))}
      </Tabs>
    ) : (
      <>
        <PageHeader
          title={title}
          description={pageDescription}
          actions={headerActions}
          descriptionActions={descriptionActions}
        />
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          {renderView(activeView)}
        </div>
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
      {content}
      {canCreateRecord ? (
        <EntityRecordDialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              setCreateHierarchyGroupId(null);
              setCreateHierarchySubgroupId(null);
            }
          }}
          entity={currentEntity}
          requireAccountPassword={isUsersEntity}
          submitLabel={isUsersEntity ? "Создать аккаунт" : undefined}
          presetValues={{
            ...(isUsersEntity
              ? { [SYSTEM_USERS_FIELD_ROLE_ID]: ROLE_EMPLOYEE_ID }
              : {}),
            ...(createHierarchyGroupId != null &&
            createHierarchyGroupId !== "" &&
            tableParentField
              ? {
                  [tableParentField.id]: encodeEntityTableParentValue(
                    tableParentField,
                    createHierarchyGroupId,
                    isEntityTableRelationGroupsNestedSubgroup(
                      tableParentField,
                      tableSubgroupField,
                    )
                      ? createHierarchySubgroupId
                      : null,
                  ),
                }
              : {}),
            ...(createHierarchySubgroupId != null &&
            createHierarchySubgroupId !== "" &&
            tableSubgroupField &&
            !isEntityTableRelationGroupsNestedSubgroup(
              tableParentField,
              tableSubgroupField,
            )
              ? {
                  [tableSubgroupField.id]: encodeEntityTableParentValue(
                    tableSubgroupField,
                    createHierarchySubgroupId,
                  ),
                }
              : {}),
          }}
          onSubmit={
            isUsersEntity
              ? async (values, meta) => {
                  if (!isSupabaseConfigured) {
                    addEntityRecord(currentEntity.id, values);
                    return;
                  }
                  const password = meta.password?.trim() ?? "";
                  if (password.length < 6) {
                    throw new Error("Пароль должен быть не короче 6 символов");
                  }
                  const record = await inviteSystemUser({
                    values,
                    password,
                  });
                  appendEntityRecord(currentEntity.id, record);
                }
              : undefined
          }
        />
      ) : null}
      {canOpenRecord ? (
        <EntityRecordDialog
          open={editingRecord != null}
          onOpenChange={(open) => {
            if (!open) setEditingRecord(null);
          }}
          entity={currentEntity}
          record={editingRecord}
        />
      ) : null}
      <EntityTimelineSettingsDialog
        open={timelineSettingsOpen}
        onOpenChange={setTimelineSettingsOpen}
        entity={currentEntity}
      />
    </div>
  );
}
