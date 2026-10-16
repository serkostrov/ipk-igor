import { useEffect, useState, type ReactNode } from "react";
import {
  EyeOff,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Shield,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  addEntity,
  getVisibleEntities,
  isEntityInternal,
  isEntityLocked,
  isSystemEntity,
  removeEntity,
  setEntityLocked,
  sortEntitiesByMenuOrder,
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

function LockedEntityBadge() {
  return (
    <span
      title="Схема сущности заблокирована"
      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground"
    >
      <Lock className="size-3 shrink-0" aria-hidden />
      Заблокировано
    </span>
  );
}

function EntityPage({
  entity,
  onEdit,
  onDelete,
  onOpenRecords,
  activeTabId,
  onActiveTabIdChange,
}: {
  entity: Entity;
  onEdit: () => void;
  onDelete?: () => void;
  onOpenRecords?: () => void;
  activeTabId?: string | null;
  onActiveTabIdChange?: (tabId: string) => void;
}) {
  const system = isSystemEntity(entity);
  const internal = isEntityInternal(entity);
  const locked = isEntityLocked(entity);

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
            {locked ? <LockedEntityBadge /> : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {entity.description || "Без описания"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {internal ? null : (
            <EntityBehaviorMenu entity={entity} disabled={locked} />
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
            disabled={locked}
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
              disabled={locked}
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
          readOnly={locked}
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
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<Entity | null>(null);

  const entities = sortEntitiesByMenuOrder(
    getVisibleEntities(config.entities),
    getEntityLinkedMenuItemIds({ entries }),
  );
  const selected =
    entities.find((entity) => entity.id === selectedEntityId) ??
    entities[0] ??
    null;

  // Sync URL when falling back to the first entity (no id in history yet).
  useEffect(() => {
    if (status === "idle" || status === "loading") return;
    if (!selected || !onSelectedEntityIdChange) return;
    if (selectedEntityId === selected.id) return;
    onSelectedEntityIdChange(selected.id);
  }, [status, selected, selectedEntityId, onSelectedEntityIdChange]);

  if (status === "idle" || status === "loading") {
    return <EntitySettingsSkeleton leading={leading} />;
  }

  const selectedLocked = selected ? isEntityLocked(selected) : false;
  const pendingDeleteName =
    pendingDelete?.name.trim() ||
    pendingDelete?.namePlural.trim() ||
    "Без названия";

  const toolbar = (
    <div className="flex shrink-0 items-center gap-2">
      <EntityMenuSelect
        entities={entities}
        menuEntries={entries}
        value={selected?.id}
        onValueChange={(entityId) => {
          onSelectedEntityIdChange?.(entityId);
        }}
      />

      <Button
        type="button"
        size="icon"
        variant={selectedLocked ? "default" : "outline"}
        aria-label={
          selectedLocked
            ? "Разблокировать редактирование"
            : "Заблокировать редактирование"
        }
        aria-pressed={selectedLocked}
        title={
          selectedLocked
            ? "Разблокировать схему сущности"
            : "Заблокировать схему сущности"
        }
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          setEntityLocked(selected.id, !selectedLocked);
        }}
      >
        {selectedLocked ? <Lock /> : <LockOpen />}
      </Button>

      <Button
        type="button"
        size="icon"
        aria-label="Добавить сущность"
        onClick={() => setDialog({ mode: "create" })}
      >
        <Plus />
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">{leading}</div>
        {toolbar}
      </div>

      {selected ? (
        <EntityPage
          entity={selected}
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
          removeEntity(deletedId);
          if (selectedEntityId === deletedId) {
            const fallback =
              entities.find((entity) => entity.id !== deletedId)?.id ?? null;
            if (fallback) onSelectedEntityIdChange?.(fallback);
          }
        }}
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
