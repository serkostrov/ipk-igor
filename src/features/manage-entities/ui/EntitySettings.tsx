import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  EyeOff,
  History,
  ListTree,
  Plus,
  Settings,
  Shield,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { cn } from "@/shared/lib/cn";
import {
  addEntity,
  beginEntitySchemaEdit,
  cancelEntitySchemaEdit,
  cloneEntity,
  commitEntitySchemaEdit,
  ensureEntitySchemaVersion,
  getEntitySchemaEditSession,
  getVisibleEntities,
  isEntityInternal,
  isEntitySchemaEditDirty,
  isSystemEntity,
  removeEntity,
  sortEntitiesByMenuOrder,
  subscribeEntityConfig,
  updateEntity,
  useEntityConfig,
  useEntityStatus,
  type Entity,
} from "@/entities/entity";
import { getEntityLinkedMenuItemIds, useMenuConfig } from "@/entities/menu";
import { EntityDialog } from "./EntityDialog";
import { EntityFieldsEditor } from "./EntityFieldsEditor";
import { EntityMenuSelect } from "./EntityMenuSelect";
import {
  EntityPublishedVersionBadge,
  EntitySchemaHistoryDialog,
} from "./EntitySchemaHistoryDialog";
import { EntitySettingsSkeleton } from "./EntitySettingsSkeleton";

type DialogState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; entity: Entity };

const toolbarIconTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.6,
};

function ToolbarIconSwap({
  swapKey,
  icon,
}: {
  swapKey: string;
  icon: ReactNode;
}) {
  return (
    <span className="relative flex size-4 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          className="inline-flex [&_svg]:size-4"
          initial={{ opacity: 0, scale: 0.55, rotate: -28 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.55, rotate: 28 }}
          transition={toolbarIconTransition}
        >
          {icon}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type EntitySettingsProps = {
  /** Left side of the top row (e.g. settings tabs). */
  leading?: ReactNode;
  /** Open entity records page (e.g. from App navigation). */
  onOpenEntity?: (entityId: string) => void;
  /** Selected entity from visit history / URL. */
  selectedEntityId?: string | null;
  /** Active schema tab from visit history / URL. */
  selectedEntityTabId?: string | null;
  onSelectedEntityIdChange?: (entityId: string) => void;
  onSelectedEntityTabIdChange?: (entityId: string, tabId: string) => void;
};

function SystemEntityBadge() {
  return (
    <span
      title="Системная сущность — нельзя удалить"
      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
    >
      <Shield className="size-3 shrink-0" aria-hidden />
      Система
    </span>
  );
}

function InternalEntityBadge() {
  return (
    <span
      title="Служебная сущность — без раздела в меню"
      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
    >
      <EyeOff className="size-3 shrink-0" aria-hidden />
      Служебная
    </span>
  );
}

function useSchemaEditSession() {
  const [session, setSession] = useState(getEntitySchemaEditSession);
  useEffect(() => {
    return subscribeEntityConfig(() => {
      setSession(getEntitySchemaEditSession());
    });
  }, []);
  return session;
}

function EntityPage({
  entity,
  editing,
  onEdit,
  onDelete,
  onOpenVersions,
  activeTabId,
  onActiveTabIdChange,
}: {
  entity: Entity;
  editing: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onOpenVersions?: () => void;
  activeTabId?: string | null;
  onActiveTabIdChange?: (tabId: string) => void;
}) {
  const system = isSystemEntity(entity);
  const internal = isEntityInternal(entity);
  const [fieldsOverviewOpen, setFieldsOverviewOpen] = useState(false);
  const [createFieldRequestId, setCreateFieldRequestId] = useState(0);

  useEffect(() => {
    void ensureEntitySchemaVersion(entity.id, entity.publishedVersion);
  }, [entity.id, entity.publishedVersion]);

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex h-7 min-w-0 flex-nowrap items-center gap-2">
            <h3 className="min-w-0 truncate text-lg leading-7 font-semibold tracking-tight">
              {entity.name || "Без названия"}
              {entity.namePlural ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  ({entity.namePlural})
                </span>
              ) : null}
            </h3>
            <EntityPublishedVersionBadge
              entity={entity}
              onClick={onOpenVersions}
            />
            {system ? <SystemEntityBadge /> : null}
            {internal ? <InternalEntityBadge /> : null}
            <div
              className={cn(
                "flex h-7 shrink-0 items-center gap-0.5 overflow-hidden transition-[opacity,width] duration-200",
                editing ? "opacity-100" : "pointer-events-none w-0 opacity-0",
              )}
              aria-hidden={!editing}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Параметры сущности"
                title="Параметры"
                tabIndex={editing ? undefined : -1}
                onClick={onEdit}
              >
                <Settings className="size-3.5" />
              </Button>
              {onDelete && !system ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label="Удалить сущность"
                  title="Удалить"
                  tabIndex={editing ? undefined : -1}
                  onClick={onDelete}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {entity.description || "Без описания"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            aria-label="Все поля сущности"
            title="Все поля"
            onClick={() => setFieldsOverviewOpen(true)}
          >
            <ListTree className="size-3.5" aria-hidden />
            Все поля
          </Button>
          <AnimatePresence initial={false}>
            {editing ? (
              <motion.div
                key="entity-add-field"
                className="inline-flex"
                initial={{ opacity: 0, scale: 0.88, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: -6 }}
                transition={toolbarIconTransition}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setCreateFieldRequestId((value) => value + 1)}
                >
                  <Plus className="size-3.5" />
                  Добавить
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="min-w-0 px-5 py-5">
        <EntityFieldsEditor
          key={entity.id}
          entity={entity}
          readOnly={!editing}
          activeTabId={activeTabId}
          onActiveTabIdChange={onActiveTabIdChange}
          hideFieldsOverviewButton
          hideFieldsToolbar
          fieldsOverviewOpen={fieldsOverviewOpen}
          onFieldsOverviewOpenChange={setFieldsOverviewOpen}
          createFieldRequestId={createFieldRequestId}
        />
      </div>
    </div>
  );
}

export function EntitySettings({
  leading,
  onOpenEntity,
  selectedEntityId,
  selectedEntityTabId,
  onSelectedEntityIdChange,
  onSelectedEntityTabIdChange,
}: EntitySettingsProps) {
  const config = useEntityConfig();
  const { entries } = useMenuConfig();
  const status = useEntityStatus();
  const schemaEdit = useSchemaEditSession();
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Entity | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [pendingSwitchEntityId, setPendingSwitchEntityId] = useState<
    string | null
  >(null);

  const entities = sortEntitiesByMenuOrder(
    getVisibleEntities(config.entities),
    getEntityLinkedMenuItemIds({ entries }),
  );
  const selected =
    entities.find((entity) => entity.id === selectedEntityId) ??
    entities[0] ??
    null;

  const editing = selected != null && schemaEdit?.entityId === selected.id;
  const dirty = editing && isEntitySchemaEditDirty();

  // Sync URL when falling back to the first entity (no id in history yet).
  useEffect(() => {
    if (status === "idle" || status === "loading") return;
    if (!selected || !onSelectedEntityIdChange) return;
    if (selectedEntityId === selected.id) return;
    onSelectedEntityIdChange(selected.id);
  }, [status, selected, selectedEntityId, onSelectedEntityIdChange]);

  // Leaving the page / unmount: persist dirty schema so switching settings
  // tabs (which unmounts this panel) does not silently discard work.
  useEffect(() => {
    return () => {
      const session = getEntitySchemaEditSession();
      if (!session) return;
      if (session.dirty) commitEntitySchemaEdit();
      else cancelEntitySchemaEdit();
    };
  }, []);

  if (status === "idle" || status === "loading") {
    return <EntitySettingsSkeleton leading={leading} />;
  }

  const pendingDeleteName =
    pendingDelete?.name.trim() ||
    pendingDelete?.namePlural.trim() ||
    "Без названия";

  function selectEntity(entityId: string) {
    if (editing && dirty) {
      setPendingSwitchEntityId(entityId);
      setDiscardConfirm(true);
      return;
    }
    if (editing) cancelEntitySchemaEdit();
    onSelectedEntityIdChange?.(entityId);
  }

  function enterEditMode() {
    if (!selected) return;
    beginEntitySchemaEdit(selected.id);
  }

  function saveAndExit() {
    commitEntitySchemaEdit();
  }

  function requestExitEdit() {
    if (dirty) {
      setPendingSwitchEntityId(null);
      setDiscardConfirm(true);
      return;
    }
    cancelEntitySchemaEdit();
  }

  function confirmDiscard() {
    cancelEntitySchemaEdit();
    setDiscardConfirm(false);
    if (pendingSwitchEntityId) {
      onSelectedEntityIdChange?.(pendingSwitchEntityId);
      setPendingSwitchEntityId(null);
    }
  }

  const toolbar = (
    <>
      <EntityMenuSelect
        entities={entities}
        menuEntries={entries}
        value={selected?.id}
        onValueChange={selectEntity}
      />

      {onOpenEntity && selected ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Открыть записи"
          title="Записи"
          onClick={() => onOpenEntity(selected.id)}
        >
          <Table2 className="size-4" aria-hidden />
        </Button>
      ) : null}

      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="История версий схемы"
        title="Версии схемы"
        disabled={!selected}
        onClick={() => setVersionsOpen(true)}
      >
        <History className="size-4" aria-hidden />
      </Button>

      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={editing ? "Отменить редактирование" : "Редактировать схему"}
        aria-pressed={editing}
        title={editing ? "Отменить" : "Параметры — режим редактирования схемы"}
        disabled={!selected}
        onClick={() => {
          if (editing) requestExitEdit();
          else enterEditMode();
        }}
      >
        <ToolbarIconSwap
          swapKey={editing ? "cancel" : "edit"}
          icon={editing ? <X /> : <Settings />}
        />
      </Button>

      <Button
        type="button"
        size="icon"
        aria-label={editing ? "Сохранить схему" : "Добавить сущность"}
        title={editing ? "Сохранить" : "Добавить сущность"}
        disabled={editing && !selected}
        onClick={() => {
          if (editing) saveAndExit();
          else setDialog({ mode: "create" });
        }}
      >
        <ToolbarIconSwap
          swapKey={editing ? "save" : "add"}
          icon={editing ? <Check /> : <Plus />}
        />
      </Button>
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="sticky top-0 z-40 -mx-1 flex min-h-9 min-w-0 items-center bg-background px-1 pb-3">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leading}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-2 bg-background pl-2">
          {toolbar}
        </div>
      </div>

      {selected ? (
        <EntityPage
          key={selected.id}
          entity={selected}
          editing={editing}
          onEdit={() => setDialog({ mode: "edit", entity: selected })}
          onDelete={() => setPendingDelete(selected)}
          onOpenVersions={() => setVersionsOpen(true)}
          activeTabId={selectedEntityTabId}
          onActiveTabIdChange={(tabId) => {
            onSelectedEntityTabIdChange?.(selected.id, tabId);
          }}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Пока нет сущностей. Добавьте первую.
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus />
            Добавить сущность
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Удалить сущность?"
        description={`Вы уверены, что хотите удалить «${pendingDeleteName}»? Будут удалены все её поля, записи и связанные данные. Это действие нельзя отменить.`}
        confirmLabel="Удалить"
        onConfirm={() => {
          if (!pendingDelete) return;
          const deletedId = pendingDelete.id;
          if (getEntitySchemaEditSession()?.entityId === deletedId) {
            cancelEntitySchemaEdit();
          }
          removeEntity(deletedId);
          if (selectedEntityId === deletedId) {
            const fallback =
              entities.find((entity) => entity.id !== deletedId)?.id ?? null;
            if (fallback) onSelectedEntityIdChange?.(fallback);
          }
        }}
      />

      <ConfirmDialog
        open={discardConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setDiscardConfirm(false);
            setPendingSwitchEntityId(null);
          }
        }}
        title="Отменить изменения?"
        description="Несохранённые изменения схемы будут потеряны."
        confirmLabel="Отменить изменения"
        onConfirm={confirmDiscard}
      />

      <EntityDialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDialog({ mode: "closed" });
        }}
        entity={dialog.mode === "edit" ? dialog.entity : null}
        onSubmit={(data) => {
          if (dialog.mode === "create") {
            const { sourceEntityId, ...payload } = data;
            const created = sourceEntityId
              ? cloneEntity(sourceEntityId, payload)
              : addEntity(payload);
            if (created) onSelectedEntityIdChange?.(created.id);
            return;
          }
          if (dialog.mode === "edit") {
            updateEntity(dialog.entity.id, {
              name: data.name,
              namePlural: data.namePlural,
              description: data.description,
              views: data.views,
              defaultView: data.defaultView,
            });
          }
        }}
      />

      {selected ? (
        <EntitySchemaHistoryDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          entity={selected}
          onRestoredToDraft={() => {
            if (!editing) beginEntitySchemaEdit(selected.id);
          }}
        />
      ) : null}
    </div>
  );
}
