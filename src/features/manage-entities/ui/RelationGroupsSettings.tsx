import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  buildEntityRelationGroupsValue,
  createEntityRelationGroupsLevel,
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityRelationTargetId,
  getRelationRecordOptions,
  isEntityNameField,
  isEntityStructuredFieldType,
  ListSelect,
  parseEntityListValueIds,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  RelationSelect,
  serializeEntityListValueIds,
  serializeEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityFieldDefaultValue,
  type EntityRelationGroupsConfig,
  type EntityRelationGroupsLayout,
  type EntityRelationGroupsLevel,
  type EntityRelationGroupsLevelSource,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { SettingLabel, SettingSelect } from "@/shared/ui/setting-controls";

type EntityOption = {
  id: string;
  name: string;
  parentName?: string | null;
};

type RelationGroupsSettingsProps = {
  entities: Entity[];
  entityOptions: EntityOption[];
  value: EntityRelationGroupsConfig;
  onChange: (value: EntityRelationGroupsConfig) => void;
  /** Root ids for a new record (level 0 defaults live in field.defaultValue). */
  defaultValue: EntityFieldDefaultValue | null;
  onDefaultValueChange: (value: EntityFieldDefaultValue | null) => void;
};

const SETTINGS_SELECT_CLASS =
  "h-8 bg-background hover:bg-background aria-expanded:bg-background";

function constantDefaultValue(value: EntityFieldDefaultValue | null) {
  return value?.kind === "value" ? value.value : "";
}

function toConstantDefaultValue(value: string): EntityFieldDefaultValue | null {
  return value.trim().length > 0 ? { kind: "value", value } : null;
}

const LAYOUT_OPTIONS: Array<{
  value: EntityRelationGroupsLayout;
  label: string;
}> = [
  { value: "column", label: "Столбец" },
  { value: "row", label: "Строка" },
];

const SOURCE_KIND_OPTIONS = [
  { value: "entity", label: "Сущность" },
  { value: "field", label: "Поле" },
] as const;

function optionLabel(option: EntityOption) {
  if (option.parentName) return `${option.parentName} → ${option.name}`;
  return option.name;
}

function displayFieldCandidates(entity: Entity | null): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter(
    (field) =>
      !isEntityNameField(field) && !isEntityStructuredFieldType(field.type),
  );
}

function keepKnownIds(ids: readonly string[], allowed: ReadonlySet<string>) {
  return ids.filter((id) => allowed.has(id));
}

function isLevelSourceReady(
  source: EntityRelationGroupsLevelSource,
  allowField: boolean,
) {
  if (source.kind === "entity") return Boolean(source.entityId);
  return allowField && Boolean(source.fieldId);
}

function levelTitle(index: number) {
  if (index === 0) return "Строки";
  if (index === 1) return "Вложенные";
  return `Уровень ${index + 1}`;
}

function levelDescription(index: number) {
  return index === 0
    ? "Что выбирают в первую очередь"
    : "Мультивыбор внутри каждого родителя";
}

type DisplayFieldOption = {
  id: string;
  name: string;
  typeLabel: string;
};

const DISPLAY_FIELDS_VISIBLE_CHIPS = 2;

function DisplayFieldsPicker({
  id,
  title,
  description,
  fields,
  selectedIds,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  fields: EntityField[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo<DisplayFieldOption[]>(
    () =>
      fields.map((field) => ({
        id: field.id,
        name: getEntityFieldDisplayName(field),
        typeLabel: getEntityFieldTypeLabel(field.type),
      })),
    [fields],
  );

  const selectedSet = new Set(selectedIds);
  const selectedOptions = useMemo(
    () =>
      selectedIds
        .map((fieldId) => options.find((option) => option.id === fieldId))
        .filter((option): option is DisplayFieldOption => option != null),
    [options, selectedIds],
  );

  const visibleOptions = selectedOptions.slice(0, DISPLAY_FIELDS_VISIBLE_CHIPS);
  const hiddenOptions = selectedOptions.slice(DISPLAY_FIELDS_VISIBLE_CHIPS);
  const hiddenCount = hiddenOptions.length;
  const hiddenLabel = hiddenOptions.map((option) => option.name).join(", ");

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(q) ||
        option.typeLabel.toLowerCase().includes(q),
    );
  }, [options, query]);

  function toggle(fieldId: string) {
    if (selectedSet.has(fieldId)) {
      onChange(selectedIds.filter((id) => id !== fieldId));
      return;
    }
    onChange([...selectedIds, fieldId]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SettingLabel title={title} description={description} />
      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-xs text-muted-foreground">
          Нет полей для отображения
        </p>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger
            id={id}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left text-sm shadow-xs transition-colors",
              "hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground">Не показывать</span>
              ) : (
                <>
                  {visibleOptions.map((option) => (
                    <span
                      key={option.id}
                      className="inline-flex max-w-[9rem] items-center gap-0.5 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                    >
                      <span className="truncate">{option.name}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 hover:bg-primary/15"
                        aria-label={`Убрать «${option.name}»`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggle(option.id);
                        }}
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))}
                  {hiddenCount > 0 ? (
                    <span
                      className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums leading-none text-muted-foreground"
                      title={hiddenLabel}
                    >
                      +{hiddenCount}
                    </span>
                  ) : null}
                </>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-max min-w-[max(var(--anchor-width),16rem)] max-w-[min(32rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
            sideOffset={6}
          >
            <div className="border-b border-border/70 p-2">
              <Input
                value={query}
                placeholder="Поиск…"
                className="h-8"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                  Ничего не найдено
                </p>
              ) : (
                filteredOptions.map((option) => {
                  const checked = selectedSet.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        checked
                          ? "bg-primary/8 text-foreground"
                          : "text-foreground hover:bg-muted/60",
                      )}
                      onClick={() => toggle(option.id)}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                        aria-hidden
                      >
                        {checked ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                      <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        {option.typeLabel}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {selectedIds.length > 0 ? (
              <div className="flex items-center justify-between border-t border-border/70 px-2.5 py-2">
                <span className="text-xs text-muted-foreground">
                  Выбрано: {selectedIds.length}
                </span>
                <button
                  type="button"
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  onClick={() => onChange([])}
                >
                  Очистить
                </button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function resolveLevelEntity(
  levels: readonly EntityRelationGroupsLevel[],
  index: number,
  entities: Entity[],
): Entity | null {
  let previousId: string | null = null;
  for (let i = 0; i <= index; i += 1) {
    const level = levels[i];
    if (!level) return null;
    if (level.source.kind === "entity") {
      previousId = level.source.entityId;
    } else {
      const fieldId = level.source.fieldId;
      if (!previousId || !fieldId) return null;
      const prevEntity = entities.find((item) => item.id === previousId);
      const sourceField = prevEntity?.fields.find(
        (item) => item.id === fieldId,
      );
      previousId = sourceField ? getEntityRelationTargetId(sourceField) : null;
    }
    if (i === index) {
      return previousId
        ? (entities.find((item) => item.id === previousId) ?? null)
        : null;
    }
  }
  return null;
}

function levelSummary(
  level: EntityRelationGroupsLevel,
  index: number,
  levels: readonly EntityRelationGroupsLevel[],
  entities: Entity[],
  entityOptions: EntityOption[],
): string {
  if (level.source.kind === "entity") {
    if (!level.source.entityId) return "Не настроено";
    const entityId = level.source.entityId;
    const option = entityOptions.find((item) => item.id === entityId);
    const entity = entities.find((item) => item.id === entityId);
    const name = option
      ? optionLabel(option)
      : entity
        ? getEntityDisplayName(entity)
        : "Сущность";
    const extras = level.displayFieldIds.length;
    return extras > 0 ? `${name} · +${extras}` : name;
  }
  const fieldId = level.source.kind === "field" ? level.source.fieldId : null;
  const previous =
    index > 0 ? resolveLevelEntity(levels, index - 1, entities) : null;
  const field = fieldId
    ? previous?.fields.find((item) => item.id === fieldId)
    : null;
  if (!field) return "Не настроено";
  return getEntityFieldDisplayName(field);
}

function LevelEditorDialog({
  open,
  onOpenChange,
  index,
  level,
  levels,
  entities,
  selectOptions,
  defaultValue,
  onCommitDefaults,
  onUpdateLevel,
  onSetLevelSource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  level: EntityRelationGroupsLevel;
  levels: readonly EntityRelationGroupsLevel[];
  entities: Entity[];
  selectOptions: Array<{ value: string; label: string }>;
  defaultValue: EntityFieldDefaultValue | null;
  onCommitDefaults: (index: number, nextIds: readonly string[]) => void;
  onUpdateLevel: (
    index: number,
    patch: Partial<EntityRelationGroupsLevel>,
    resetFollowing?: boolean,
  ) => void;
  onSetLevelSource: (
    index: number,
    source: EntityRelationGroupsLevelSource,
  ) => void;
}) {
  const previousEntity =
    index === 0 ? null : resolveLevelEntity(levels, index - 1, entities);
  const levelEntity = resolveLevelEntity(levels, index, entities);
  const entityName = levelEntity ? getEntityDisplayName(levelEntity) : null;
  const displayFields = displayFieldCandidates(levelEntity);
  const displayFieldIds = keepKnownIds(
    level.displayFieldIds,
    new Set(displayFields.map((field) => field.id)),
  );
  const sourceFieldId =
    level.source.kind === "field" ? level.source.fieldId : null;
  const sourceField =
    sourceFieldId && previousEntity
      ? (previousEntity.fields.find((field) => field.id === sourceFieldId) ??
        null)
      : null;
  const rootIds = parseEntityRelationGroups(
    constantDefaultValue(defaultValue),
  ).map((node) => node.id);
  const defaultIds = index === 0 ? rootIds : (level.defaultIds ?? []);
  const defaultDescription =
    index === 0
      ? "Предзаполнить в новой записи"
      : "Подставляются в каждый родительский узел";
  const canEditDefaults = sourceField?.type === "list" || levelEntity != null;

  const usedEntityIds = new Set(
    levels
      .slice(0, index)
      .map((item) =>
        item.source.kind === "entity" ? item.source.entityId : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
  const entitySelectOptions = selectOptions.filter(
    (option) => !usedEntityIds.has(option.value),
  );

  const levelEntityId =
    level.source.kind === "entity" ? level.source.entityId : null;
  const limitOptions =
    previousEntity && levelEntityId
      ? previousEntity.fields
          .filter(
            (field) =>
              field.type === "relation" &&
              getEntityRelationTargetId(field) === levelEntityId,
          )
          .map((field) => ({
            value: field.id,
            label: getEntityFieldDisplayName(field),
          }))
      : [];

  const fieldSourceOptions = previousEntity
    ? previousEntity.fields
        .filter((field) => field.type === "relation" || field.type === "list")
        .map((field) => ({
          value: field.id,
          label: `${getEntityFieldDisplayName(field)} · ${getEntityFieldTypeLabel(field.type)}`,
        }))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(100%,28rem)] sm:w-md sm:max-w-md"
        forceOverlay
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-[2px]"
      >
        <DialogHeader>
          <DialogTitle>
            {index + 1}. {levelTitle(index)}
          </DialogTitle>
          <DialogDescription>{levelDescription(index)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {index > 0 ? (
            <SettingSelect
              id={`entity-field-relation-groups-level-${level.id}-source`}
              title="Источник"
              description="Откуда брать записи этого уровня"
              value={level.source.kind}
              options={[...SOURCE_KIND_OPTIONS]}
              onChange={(kind) => {
                if (kind === "field") {
                  onSetLevelSource(index, { kind: "field", fieldId: null });
                  return;
                }
                onSetLevelSource(index, {
                  kind: "entity",
                  entityId: null,
                  limitFieldId: null,
                });
              }}
            />
          ) : null}

          {level.source.kind === "entity" ? (
            <>
              <SettingSelect
                id={`entity-field-relation-groups-level-${level.id}-entity`}
                title="Сущность"
                description={
                  index === 0
                    ? "Каталог записей для строк"
                    : "Каталог записей этого уровня"
                }
                value={level.source.entityId}
                options={entitySelectOptions}
                emptyLabel="Выберите сущность"
                onChange={(entityId) =>
                  onSetLevelSource(index, {
                    kind: "entity",
                    entityId,
                    limitFieldId: null,
                  })
                }
              />
              {index > 0 && level.source.entityId && previousEntity ? (
                <SettingSelect
                  id={`entity-field-relation-groups-level-${level.id}-limit`}
                  title="Ограничить"
                  description={
                    entityName
                      ? `Необязательно: связь на предыдущем уровне → «${entityName}»`
                      : "Необязательно: поле связи на предыдущем уровне"
                  }
                  value={level.source.limitFieldId}
                  options={limitOptions}
                  emptyLabel="Все записи"
                  onChange={(limitFieldId) =>
                    onUpdateLevel(index, {
                      source: {
                        kind: "entity",
                        entityId:
                          level.source.kind === "entity"
                            ? level.source.entityId
                            : null,
                        limitFieldId,
                      },
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <SettingSelect
              id={`entity-field-relation-groups-level-${level.id}-field`}
              title="Поле"
              description={
                previousEntity
                  ? `Связь или список у «${getEntityDisplayName(previousEntity)}»`
                  : "Связь или список на предыдущем уровне"
              }
              value={level.source.fieldId}
              options={fieldSourceOptions}
              emptyLabel="Выберите поле"
              onChange={(fieldId) =>
                onSetLevelSource(index, { kind: "field", fieldId })
              }
            />
          )}

          {levelEntity ? (
            <DisplayFieldsPicker
              id={`entity-field-relation-groups-level-${level.id}-display`}
              title="Поля отображения"
              description={
                entityName ? `Кроме названия «${entityName}»` : "Кроме названия"
              }
              fields={displayFields}
              selectedIds={displayFieldIds}
              onChange={(ids) => onUpdateLevel(index, { displayFieldIds: ids })}
            />
          ) : null}

          <SettingSelect
            id={`entity-field-relation-groups-level-${level.id}-layout`}
            title="Отображение"
            description="Как элементы этого уровня выглядят в форме"
            value={level.layout ?? "column"}
            options={LAYOUT_OPTIONS}
            onChange={(layout) =>
              onUpdateLevel(index, {
                layout: layout === "row" ? "row" : "column",
              })
            }
          />

          {canEditDefaults ? (
            <div className="flex flex-col gap-1.5">
              <SettingLabel
                title="По умолчанию"
                description={defaultDescription}
              />
              {sourceField?.type === "list" ? (
                <ListSelect
                  options={sourceField.listOptions}
                  value={serializeEntityListValueIds(defaultIds)}
                  multiple
                  allowEmpty
                  showColors={sourceField.listUseColors}
                  size="sm"
                  emptyLabel="Не заполнять"
                  aria-label={`${levelTitle(index)} по умолчанию`}
                  className="h-8 min-h-8 rounded-md border-input font-normal"
                  onChange={(next) =>
                    onCommitDefaults(index, parseEntityListValueIds(next))
                  }
                />
              ) : levelEntity ? (
                <RelationSelect
                  id={`entity-field-relation-groups-level-${level.id}-default`}
                  options={getRelationRecordOptions(levelEntity, entities)}
                  value={serializeEntityRelationIds(defaultIds)}
                  multiple
                  placeholder="Не заполнять"
                  aria-label={`${levelTitle(index)} по умолчанию`}
                  className={SETTINGS_SELECT_CLASS}
                  onChange={(next) =>
                    onCommitDefaults(index, parseEntityRelationIds(next))
                  }
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RelationGroupsSettings({
  entities,
  entityOptions,
  value,
  onChange,
  defaultValue,
  onDefaultValueChange,
}: RelationGroupsSettingsProps) {
  const levels = value.levels;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const selectOptions = useMemo(
    () =>
      entityOptions.map((option) => ({
        value: option.id,
        label: optionLabel(option),
      })),
    [entityOptions],
  );

  function patchLevels(next: EntityRelationGroupsLevel[]) {
    onChange({ ...value, levels: next });
  }

  function updateLevel(
    index: number,
    patch: Partial<EntityRelationGroupsLevel>,
    resetFollowing = false,
  ) {
    const next = levels.map((level, i) =>
      i === index ? { ...level, ...patch } : level,
    );
    patchLevels(resetFollowing ? next.slice(0, index + 1) : next);
  }

  function setLevelSource(
    index: number,
    source: EntityRelationGroupsLevelSource,
  ) {
    updateLevel(index, { source, displayFieldIds: [], defaultIds: [] }, true);
  }

  function commitDefaults(index: number, nextIds: readonly string[]) {
    const rootIds =
      index === 0
        ? [...nextIds]
        : parseEntityRelationGroups(constantDefaultValue(defaultValue)).map(
            (node) => node.id,
          );
    // Keep level.defaultIds in sync for every level, including roots.
    const nextLevels = levels.map((level, i) =>
      i === index ? { ...level, defaultIds: [...nextIds] } : level,
    );
    const levelDefaults = nextLevels.map((level) => level.defaultIds);
    onChange({ ...value, levels: nextLevels });
    onDefaultValueChange(
      toConstantDefaultValue(
        buildEntityRelationGroupsValue(rootIds, levelDefaults),
      ),
    );
  }

  function addLevel() {
    const nextIndex = levels.length;
    patchLevels([
      ...levels,
      createEntityRelationGroupsLevel({
        kind: "entity",
        entityId: null,
        limitFieldId: null,
      }),
    ]);
    setEditingIndex(nextIndex);
  }

  function removeLevel(index: number) {
    if (levels.length <= 2) return;
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex != null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
    patchLevels(levels.filter((_, i) => i !== index));
  }

  const canAddLevel = levels.every((level, index) =>
    isLevelSourceReady(level.source, index > 0),
  );
  const editingLevel =
    editingIndex != null ? (levels[editingIndex] ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {levels.map((level, index) => {
          const ready = isLevelSourceReady(level.source, index > 0);
          const summary = levelSummary(
            level,
            index,
            levels,
            entities,
            entityOptions,
          );
          const canRemove =
            levels.length > 2 && (index >= 2 || index === levels.length - 1);

          return (
            <div key={level.id} className="flex items-stretch gap-1">
              <button
                type="button"
                onClick={() => setEditingIndex(index)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  ready
                    ? "border-border/70 bg-background hover:border-foreground/20 hover:bg-muted/40"
                    : "border-dashed border-border bg-muted/15 hover:border-foreground/20 hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    ready
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-none">
                    {levelTitle(index)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block truncate text-[11px] leading-snug",
                      ready
                        ? "text-muted-foreground"
                        : "text-muted-foreground/80",
                    )}
                  >
                    {summary}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
              {canRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-9 shrink-0 self-center text-muted-foreground hover:text-destructive"
                  aria-label={`Удалить уровень ${index + 1}`}
                  onClick={() => removeLevel(index)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center gap-1.5"
        disabled={!canAddLevel}
        onClick={addLevel}
      >
        <Plus className="size-3.5" />
        Добавить уровень
      </Button>

      {editingLevel != null && editingIndex != null ? (
        <LevelEditorDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingIndex(null);
          }}
          index={editingIndex}
          level={editingLevel}
          levels={levels}
          entities={entities}
          selectOptions={selectOptions}
          defaultValue={defaultValue}
          onCommitDefaults={commitDefaults}
          onUpdateLevel={updateLevel}
          onSetLevelSource={setLevelSource}
        />
      ) : null}
    </div>
  );
}
