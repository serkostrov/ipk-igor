import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Rows2,
  X,
} from "lucide-react";
import {
  buildEntityRelationGroupsValue,
  emptyEntityRelationGroupsConfig,
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
  description: string;
  icon: typeof Columns2;
}> = [
  {
    value: "column",
    label: "Столбец",
    description: "Друг под другом",
    icon: Rows2,
  },
  {
    value: "row",
    label: "Строка",
    description: "В одну линию",
    icon: Columns2,
  },
];

const SOURCE_KIND_OPTIONS = [
  { value: "entity", label: "Сущность" },
  { value: "field", label: "Поле" },
] as const;

function LayoutPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EntityRelationGroupsLayout;
  onChange: (layout: EntityRelationGroupsLayout) => void;
}) {
  const current = value === "row" ? "row" : "column";
  return (
    <div className="flex flex-col gap-1.5">
      <SettingLabel
        title="Отображение"
        description="Как элементы этого уровня выглядят в форме"
      />
      <div
        className="grid grid-cols-2 gap-1.5"
        role="group"
        aria-labelledby={id}
      >
        {LAYOUT_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              id={selected ? id : undefined}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 pr-4">
                <span className="block truncate text-sm font-medium">
                  {option.label}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {option.description}
                </span>
              </span>
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full border",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-transparent",
                )}
                aria-hidden
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  return index === 0 ? "Строки" : "Вложенные";
}

function levelDescription(index: number) {
  return index === 0
    ? "Что выбирают в первую очередь"
    : "Мультивыбор внутри каждой строки";
}

function twoLevels(
  levels: readonly EntityRelationGroupsLevel[],
): EntityRelationGroupsLevel[] {
  const fallback = emptyEntityRelationGroupsConfig().levels;
  return [levels[0] ?? fallback[0]!, levels[1] ?? fallback[1]!];
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

/** Inline panel — not a nested Dialog (Select/Popover break under stacked modals). */
function LevelEditorPanel({
  index,
  level,
  levels,
  entities,
  selectOptions,
  defaultValue,
  onBack,
  onCommitDefaults,
  onUpdateLevel,
  onSetLevelSource,
}: {
  index: number;
  level: EntityRelationGroupsLevel;
  levels: readonly EntityRelationGroupsLevel[];
  entities: Entity[];
  selectOptions: Array<{ value: string; label: string }>;
  defaultValue: EntityFieldDefaultValue | null;
  onBack: () => void;
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
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 mt-0.5 shrink-0"
          aria-label="Назад к уровням"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-none">
            {levelTitle(index)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {levelDescription(index)}
          </p>
        </div>
      </div>

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

      <LayoutPicker
        id={`entity-field-relation-groups-level-${level.id}-layout`}
        value={level.layout === "row" ? "row" : "column"}
        onChange={(layout) => onUpdateLevel(index, { layout })}
      />

      {canEditDefaults ? (
        <div className="flex flex-col gap-1.5">
          <SettingLabel title="По умолчанию" description={defaultDescription} />
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

      <Button type="button" className="w-full" onClick={onBack}>
        Готово
      </Button>
    </div>
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
  const levels = twoLevels(value.levels);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Drop extra levels left over from unlimited nesting.
  useEffect(() => {
    if (value.levels.length === 2) return;
    onChange({ ...value, levels: twoLevels(value.levels) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when length drifts
  }, [value.levels.length]);

  const selectOptions = useMemo(
    () =>
      entityOptions.map((option) => ({
        value: option.id,
        label: optionLabel(option),
      })),
    [entityOptions],
  );

  function patchLevels(next: EntityRelationGroupsLevel[]) {
    onChange({ ...value, levels: twoLevels(next) });
  }

  function updateLevel(
    index: number,
    patch: Partial<EntityRelationGroupsLevel>,
    resetFollowing = false,
  ) {
    const blankNested = emptyEntityRelationGroupsConfig().levels[1]!;
    const next: EntityRelationGroupsLevel[] = [
      index === 0 ? { ...levels[0]!, ...patch } : levels[0]!,
      index === 1
        ? { ...levels[1]!, ...patch }
        : resetFollowing
          ? {
              ...blankNested,
              id: levels[1]!.id,
            }
          : levels[1]!,
    ];
    patchLevels(next);
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

  const editingLevel =
    editingIndex === 0 || editingIndex === 1
      ? (levels[editingIndex] ?? null)
      : null;

  if (editingLevel != null && editingIndex != null) {
    return (
      <LevelEditorPanel
        index={editingIndex}
        level={editingLevel}
        levels={levels}
        entities={entities}
        selectOptions={selectOptions}
        defaultValue={defaultValue}
        onBack={() => setEditingIndex(null)}
        onCommitDefaults={commitDefaults}
        onUpdateLevel={updateLevel}
        onSetLevelSource={setLevelSource}
      />
    );
  }

  return (
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
        const layoutLabel = level.layout === "row" ? "Строка" : "Столбец";

        return (
          <button
            key={level.id}
            type="button"
            onClick={() => setEditingIndex(index)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
              ready
                ? "border-border/70 bg-background hover:border-foreground/20 hover:bg-muted/40"
                : "border-dashed border-border bg-muted/15 hover:border-foreground/20 hover:bg-muted/30",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-none">
                {levelTitle(index)}
              </span>
              <span
                className={cn(
                  "mt-1 block truncate text-[11px] leading-snug",
                  ready ? "text-muted-foreground" : "text-muted-foreground/80",
                )}
              >
                {ready ? `${summary} · ${layoutLabel}` : summary}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
