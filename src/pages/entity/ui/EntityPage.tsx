import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChartGantt, Columns3, Settings, Table2 } from "lucide-react";
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
  resolveEntityDefaultView,
  useEntityConfig,
  useEntityStatus,
  type EntityBrowseView,
  type EntityRecord,
} from "@/entities/entity";
import {
  ROLE_EMPLOYEE_ID,
  useCanEntity,
  useCanInviteUsers,
} from "@/entities/access";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  entityListLocation,
  useAppLocation,
  useAppLocationState,
  useAppNavigate,
} from "@/shared/lib/navigation";
import { EntityTimelineSettingsDialog } from "@/features/manage-entities";
import { EntityRecordDialog } from "./EntityRecordDialog";
import { EntityRecordPage } from "./EntityRecordPage";
import {
  EntityKanbanView,
  KanbanFieldSettingsButton,
} from "./EntityKanbanView";
import { AddRecordButton, EntityTableView } from "./EntityTableView";
import { EntityTimelineView } from "./EntityTimelineView";
import { HiddenRecordsBar } from "./HiddenRecordsBar";
import { useEntityRecordScope } from "./use-entity-record-scope";

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
        <div className="flex items-start justify-between gap-4">
          {description ? (
            <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap text-muted-foreground">
              {description}
            </p>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {descriptionActions ? (
            <div className="shrink-0">{descriptionActions}</div>
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
  const locationView =
    location.type === "entity" && location.entityId === entityId
      ? location.view
      : undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [timelineSettingsOpen, setTimelineSettingsOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EntityRecord | null>(null);
  const [handledEditId, setHandledEditId] = useState<string | null>(null);

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

  const addAction = canCreateRecord ? (
    <AddRecordButton
      onClick={() => {
        setEditingRecord(null);
        setCreateOpen(true);
      }}
    />
  ) : null;
  const hiddenRecordsAction =
    scope.hiddenCount > 0 ? <HiddenRecordsBar scope={scope} /> : undefined;

  function openRecordLocal(record: EntityRecord) {
    if (isInternal) {
      setCreateOpen(false);
      setEditingRecord(record);
      return;
    }
    setEditingRecord(null);
    openRecord(currentEntity.id, record.id);
  }

  function renderView(view: EntityBrowseView) {
    if (view === "table") {
      return (
        <EntityTableView
          entity={currentEntity}
          records={scope.records}
          title={title}
          onEditRecord={canOpenRecord ? openRecordLocal : undefined}
          onOpenRelation={onOpenRelation}
        />
      );
    }
    if (view === "timeline") {
      return (
        <EntityTimelineView
          entity={currentEntity}
          records={scope.records}
          onOpenRecord={canOpenRecord ? openRecordLocal : undefined}
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

  const timelineSettingsButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label="Настройки графика"
      title="Настройки графика"
      onClick={() => setTimelineSettingsOpen(true)}
    >
      <Settings className="size-3.5" />
    </Button>
  );

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
          description={currentEntity.description || undefined}
          titleExtra={
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <TabsList
                variant="line"
                className="h-auto gap-3 bg-transparent p-0"
              >
                {browseViews.map((view) => {
                  const Icon = viewIcons[view];
                  return (
                    <Fragment key={view}>
                      <TabsTrigger
                        value={view}
                        className="h-auto gap-1 rounded-none px-0 py-0.5 text-xs font-normal text-muted-foreground shadow-none data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
                      >
                        <Icon className="size-3 opacity-70" aria-hidden />
                        {getViewLabel(view)}
                      </TabsTrigger>
                      {view === "kanban" && activeView === "kanban" ? (
                        <KanbanFieldSettingsButton
                          entity={currentEntity}
                          className="-ml-1.5"
                        />
                      ) : null}
                      {view === "timeline" && activeView === "timeline" ? (
                        <span className="-ml-1.5 inline-flex">
                          {timelineSettingsButton}
                        </span>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TabsList>
            </div>
          }
          actions={addAction}
          descriptionActions={hiddenRecordsAction}
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
          description={currentEntity.description || undefined}
          titleExtra={
            activeView === "kanban" ? (
              <KanbanFieldSettingsButton entity={currentEntity} />
            ) : activeView === "timeline" ? (
              timelineSettingsButton
            ) : undefined
          }
          actions={addAction}
          descriptionActions={hiddenRecordsAction}
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
          onOpenChange={setCreateOpen}
          entity={currentEntity}
          requireAccountPassword={isUsersEntity}
          submitLabel={isUsersEntity ? "Создать аккаунт" : undefined}
          presetValues={
            isUsersEntity
              ? { [SYSTEM_USERS_FIELD_ROLE_ID]: ROLE_EMPLOYEE_ID }
              : undefined
          }
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
      {canOpenRecord && isInternal ? (
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
