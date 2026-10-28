import { useState } from "react";
import {
  ChartGantt,
  Check,
  Columns3,
  EyeOff,
  Pin,
  Settings,
  Table2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/cn";
import {
  ENTITY_VIEW_OPTIONS,
  getEntityBrowseViews,
  getVisibleEntities,
  isEntityBrowseView,
  resolveEntityDefaultView,
  useEntityConfig,
  type Entity,
  type EntityBrowseView,
  type EntityView,
} from "@/entities/entity";
import { EntityKanbanSettingsDialog } from "./EntityKanbanSettingsDialog";
import { EntityTableSettingsDialog } from "./EntityTableSettingsDialog";
import { EntityTimelineSettingsDialog } from "./EntityTimelineSettingsDialog";

type EntityFormData = {
  name: string;
  namePlural: string;
  description: string;
  views: EntityView[];
  defaultView: EntityBrowseView | null;
  /** When set on create — clone schema from this entity. */
  sourceEntityId: string | null;
};

type EntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: Entity | null;
  onSubmit: (data: EntityFormData) => void;
};

const CREATE_SOURCE_NEW = "new";

function copyEntityLabel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Копия";
  if (trimmed.endsWith("(копия)")) return trimmed;
  return `${trimmed} (копия)`;
}

const viewIcons: Record<EntityView, typeof Table2> = {
  table: Table2,
  kanban: Columns3,
  timeline: ChartGantt,
  internal: EyeOff,
};

type ViewSettingsKind = Extract<
  EntityBrowseView,
  "table" | "kanban" | "timeline"
>;

function EntityForm({
  entity,
  sourceEntities,
  canConfigureViews,
  onCancel,
  onSubmit,
  onOpenViewSettings,
}: {
  entity?: Entity | null;
  sourceEntities: Entity[];
  canConfigureViews: boolean;
  onCancel: () => void;
  onSubmit: (data: EntityFormData) => void;
  onOpenViewSettings: (view: ViewSettingsKind) => void;
}) {
  const isEdit = Boolean(entity);
  const [sourceEntityId, setSourceEntityId] = useState<string | null>(null);
  const [name, setName] = useState(entity?.name ?? "");
  const [namePlural, setNamePlural] = useState(entity?.namePlural ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [views, setViews] = useState<EntityView[]>(
    entity?.views?.length ? entity.views : ["table"],
  );
  const [defaultView, setDefaultView] = useState<EntityBrowseView | null>(
    () => {
      if (!entity) return "table";
      if (entity.views.includes("internal")) return null;
      return resolveEntityDefaultView(entity);
    },
  );
  const canSubmit =
    name.trim().length > 0 && namePlural.trim().length > 0 && views.length > 0;
  const activeDefault = resolveEntityDefaultView({ views, defaultView });
  const selectedSource =
    sourceEntityId != null
      ? (sourceEntities.find((item) => item.id === sourceEntityId) ?? null)
      : null;

  function applySource(nextSourceId: string | null) {
    setSourceEntityId(nextSourceId);
    if (!nextSourceId) {
      setName("");
      setNamePlural("");
      setDescription("");
      setViews(["table"]);
      setDefaultView("table");
      return;
    }
    const source = sourceEntities.find((item) => item.id === nextSourceId);
    if (!source) return;
    setName(copyEntityLabel(source.name));
    setNamePlural(copyEntityLabel(source.namePlural || source.name));
    setDescription(source.description);
    const nextViews: EntityView[] = source.views.length
      ? source.views
      : ["table"];
    setViews(nextViews);
    setDefaultView(
      nextViews.includes("internal") ? null : resolveEntityDefaultView(source),
    );
  }

  function toggleView(view: EntityView) {
    if (view === "internal") {
      setDefaultView(null);
      setViews((current) =>
        current.includes("internal") && current.length === 1
          ? current
          : ["internal"],
      );
      return;
    }

    const browse = views.filter((item) => item !== "internal");
    let next: EntityView[];
    if (browse.includes(view)) {
      if (browse.length === 1) return;
      next = browse.filter((item) => item !== view);
    } else {
      next = [...browse, view];
    }

    setViews(next);
    const nextBrowse = getEntityBrowseViews(next);
    setDefaultView((currentDefault) => {
      if (currentDefault && nextBrowse.includes(currentDefault)) {
        return currentDefault;
      }
      return nextBrowse[0] ?? null;
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать сущность" : "Новая сущность"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Название, описание и способы отображения записей."
            : "Создайте пустую сущность или скопируйте поля и настройки из существующей."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {!isEdit && sourceEntities.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="entity-source">Источник</Label>
            <Select
              value={sourceEntityId ?? CREATE_SOURCE_NEW}
              onValueChange={(next) => {
                if (next == null) return;
                const value = String(next);
                applySource(value === CREATE_SOURCE_NEW ? null : value);
              }}
            >
              <SelectTrigger id="entity-source" className="w-full">
                <SelectValue>
                  {selectedSource
                    ? `Скопировать «${selectedSource.name}»`
                    : "Создать новую (пустая)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CREATE_SOURCE_NEW}>
                  Создать новую (пустая)
                </SelectItem>
                {sourceEntities.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    Скопировать «{item.name || "Без названия"}»
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-name">Название</Label>
          <Input
            id="entity-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, Проект"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-name-plural">Название во множ. числе</Label>
          <Input
            id="entity-name-plural"
            value={namePlural}
            onChange={(event) => setNamePlural(event.target.value)}
            placeholder="Например, Проекты"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-description">Описание</Label>
          <Textarea
            id="entity-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Кратко, для чего нужна эта сущность"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <Label>Отображение</Label>
            <p className="text-xs text-muted-foreground">
              Включите виды списка записей
              {canConfigureViews ? " и настройте каждый" : ""}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            {ENTITY_VIEW_OPTIONS.map((option, index) => {
              const Icon = viewIcons[option.value];
              const selected = views.includes(option.value);
              const isBrowse = isEntityBrowseView(option.value);
              const isDefault =
                selected && isBrowse && activeDefault === option.value;
              const canConfigure =
                canConfigureViews &&
                (option.value === "table" ||
                  option.value === "kanban" ||
                  option.value === "timeline");

              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex items-center gap-2.5 px-3 py-2.5 transition-colors",
                    index > 0 && "border-t border-border",
                    selected
                      ? "bg-primary/5"
                      : "bg-background hover:bg-muted/40",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleView(option.value)}
                    className="absolute inset-0 z-0"
                    aria-label={option.label}
                  />

                  <span
                    className={cn(
                      "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md pointer-events-none",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>

                  <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
                    <div className="truncate text-sm font-medium leading-none">
                      {option.label}
                    </div>
                    <div className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
                      {option.description}
                    </div>
                  </div>

                  <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                    {canConfigure ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-label={`Настройки: ${option.label}`}
                        title="Настройки"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            option.value === "table" ||
                            option.value === "kanban" ||
                            option.value === "timeline"
                          ) {
                            onOpenViewSettings(option.value);
                          }
                        }}
                      >
                        <Settings className="size-3.5" />
                      </Button>
                    ) : null}

                    {selected && isBrowse ? (
                      <button
                        type="button"
                        aria-pressed={isDefault}
                        aria-label={
                          isDefault
                            ? "Открывается по умолчанию"
                            : "Открывать по умолчанию"
                        }
                        title={
                          isDefault
                            ? "Открывается по умолчанию"
                            : "Открывать по умолчанию"
                        }
                        className={cn(
                          "inline-grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                          isDefault
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isEntityBrowseView(option.value)) {
                            setDefaultView(option.value);
                          }
                        }}
                      >
                        <Pin
                          className="size-3.5"
                          strokeWidth={2.25}
                          fill={isDefault ? "currentColor" : "none"}
                          aria-hidden
                        />
                      </button>
                    ) : null}

                    <span
                      className={cn(
                        "ml-1 inline-grid size-3.5 shrink-0 place-items-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="size-2" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit({
              name: name.trim(),
              namePlural: namePlural.trim(),
              description: description.trim(),
              views,
              defaultView: views.includes("internal") ? null : activeDefault,
              sourceEntityId: isEdit ? null : sourceEntityId,
            });
            onCancel();
          }}
        >
          {isEdit ? "Сохранить" : sourceEntityId ? "Создать копию" : "Добавить"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityDialog({
  open,
  onOpenChange,
  entity,
  onSubmit,
}: EntityDialogProps) {
  const formKey = entity?.id ?? "new-entity";
  const { entities } = useEntityConfig();
  const liveEntity = entity
    ? (entities.find((item) => item.id === entity.id) ?? entity)
    : null;
  const sourceEntities = getVisibleEntities(entities);
  const [viewSettings, setViewSettings] = useState<ViewSettingsKind | null>(
    null,
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setViewSettings(null);
          onOpenChange(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {open ? (
            <EntityForm
              key={formKey}
              entity={entity}
              sourceEntities={sourceEntities}
              canConfigureViews={liveEntity != null}
              onCancel={() => onOpenChange(false)}
              onSubmit={onSubmit}
              onOpenViewSettings={setViewSettings}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {liveEntity ? (
        <>
          <EntityTableSettingsDialog
            open={viewSettings === "table"}
            onOpenChange={(next) => {
              if (!next) setViewSettings(null);
            }}
            entity={liveEntity}
          />
          <EntityKanbanSettingsDialog
            open={viewSettings === "kanban"}
            onOpenChange={(next) => {
              if (!next) setViewSettings(null);
            }}
            entity={liveEntity}
          />
          <EntityTimelineSettingsDialog
            open={viewSettings === "timeline"}
            onOpenChange={(next) => {
              if (!next) setViewSettings(null);
            }}
            entity={liveEntity}
          />
        </>
      ) : null}
    </>
  );
}
