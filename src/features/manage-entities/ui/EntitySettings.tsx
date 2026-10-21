import { useEffect, useState, type ReactNode } from "react";
import {
  EyeOff,
  Pencil,
  Plus,
  Settings2,
  Shield,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  addEntity,
  beginEntitySchemaEdit,
  cancelEntitySchemaEdit,
  commitEntitySchemaEdit,
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
import { EntityBehaviorMenu } from "./EntityBehaviorMenu";
import { EntityDialog } from "./EntityDialog";
import { EntityFieldsEditor } from "./EntityFieldsEditor";
import { EntityMenuSelect } from "./EntityMenuSelect";
import { EntitySettingsSkeleton } from "./EntitySettingsSkeleton";

type DialogState =
  { mode: "closed" } | { mode: "create" } | { mode: "edit"; entity: Entity };

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
  onOpenRecords,
  activeTabId,
  onActiveTabIdChange,
}: {
  entity: Entity;
  editing: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onOpenRecords?: () => void;
  activeTabId?: string | null;
  onActiveTabIdChange?: (tabId: string) => void;
}) {
  const system = isSystemEntity(entity);
  const internal = isEntityInternal(entity);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {entity.name || "Без названия"}
              {entity.namePlural ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  ({entity.namePlural})
                </span>
              ) : null}
            </h3>
            {system ? <SystemEntityBadge /> : null}
            {internal ? <InternalEntityBadge /> : null}
            {editing ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/8 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-primary">
                Редактирование
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {entity.description || "Без описания"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {internal ? null : (
            <EntityBehaviorMenu entity={entity} disabled={!editing} />
          )}
          {onOpenRecords ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              aria-label="Открыть записи"
              title="Открыть записи"
              onClick={onOpenRecords}
            >
              <Table2 className="size-3.5" aria-hidden />
              Записи
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Редактировать сущность"
            disabled={!editing}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          {onDelete && !system ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить сущность"
              disabled={!editing}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-5 py-5">
        <EntityFieldsEditor
          key={entity.id}
          entity={entity}
          readOnly={!editing}
          activeTabId={activeTabId}
          onActiveTabIdChange={onActiveTabIdChange}
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

  // Leaving the page / unmount: discard unsaved schema edits.
  useEffect(() => {
    return () => {
      if (getEntitySchemaEditSession()) cancelEntitySchemaEdit();
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

      {editing ? (
        <Button
          type="button"
          className="min-w-24"
          disabled={!selected}
          onClick={saveAndExit}
        >
          Сохранить
        </Button>
      ) : null}

      <Button
        type="button"
        size="icon"
        variant={editing ? "default" : "outline"}
        aria-label={
          editing ? "Выйти из режима редактирования" : "Редактировать схему"
        }
        aria-pressed={editing}
        title={
          editing
            ? "Выйти из режима редактирования"
            : "Параметры — режим редактирования схемы"
        }
        disabled={!selected}
        onClick={() => {
          if (editing) requestExitEdit();
          else enterEditMode();
        }}
      >
        <Settings2 />
      </Button>

      <Button
        type="button"
        size="icon"
        aria-label="Добавить сущность"
        onClick={() => setDialog({ mode: "create" })}
      >
        <Plus />
      </Button>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex min-h-9 min-w-0 items-center">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leading}
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-2 bg-background pl-2">
          {toolbar}
        </div>
      </div>

      {selected ? (
        <EntityPage
          entity={selected}
          editing={editing}
          onEdit={() => setDialog({ mode: "edit", entity: selected })}
          onDelete={() => setPendingDelete(selected)}
          onOpenRecords={
            onOpenEntity ? () => onOpenEntity(selected.id) : undefined
          }
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
            const created = addEntity(data);
            onSelectedEntityIdChange?.(created.id);
            return;
          }
          if (dialog.mode === "edit") {
            updateEntity(dialog.entity.id, data);
          }
        }}
      />
    </div>
  );
}
