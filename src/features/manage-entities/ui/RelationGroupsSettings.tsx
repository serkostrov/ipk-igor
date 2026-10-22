import { useMemo, useState } from "react";
import { Check, ChevronDown, Columns2, Rows2, X } from "lucide-react";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityRelationTargetId,
  isEntityNameField,
  isEntityStructuredFieldType,
  type Entity,
  type EntityField,
  type EntityRelationGroupsConfig,
  type EntityRelationGroupsLayout,
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
};

const LAYOUT_OPTIONS: Array<{
  value: EntityRelationGroupsLayout;
  label: string;
  description: string;
  icon: typeof Rows2;
}> = [
  {
    value: "column",
    label: "Столбец",
    description: "Группы одна под другой",
    icon: Rows2,
  },
  {
    value: "row",
    label: "Строка",
    description: "Группы рядом",
    icon: Columns2,
  },
];

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
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(needle) ||
        option.typeLabel.toLowerCase().includes(needle),
    );
  }, [options, query]);

  function toggle(fieldId: string) {
    if (selectedSet.has(fieldId)) {
      onChange(selectedIds.filter((id) => id !== fieldId));
      return;
    }
    onChange([...selectedIds, fieldId]);
  }

  function remove(fieldId: string) {
    onChange(selectedIds.filter((id) => id !== fieldId));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SettingLabel htmlFor={id} title={title} description={description} />
      {options.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
          Нет дополнительных полей
        </div>
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
            aria-label={title}
            render={
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-8 w-full items-center justify-between gap-2 overflow-hidden border-input bg-background px-2.5 py-0 font-normal shadow-xs hover:bg-background aria-expanded:bg-background",
                  selectedOptions.length === 0 && "text-muted-foreground",
                )}
              />
            }
          >
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {selectedOptions.length === 0 ? (
                <span className="truncate text-sm">Выберите поля</span>
              ) : (
                <>
                  {visibleOptions.map((option) => (
                    <span
                      key={option.id}
                      className="inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-xs font-medium leading-none text-primary"
                    >
                      <span className="truncate">{option.name}</span>
                      <span
                        role="button"
                        tabIndex={-1}
                        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
                        aria-label={`Убрать «${option.name}»`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          remove(option.id);
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <X className="size-3" />
                      </span>
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

/** Configures primary + nested entities for a `relationGroups` field. */
export function RelationGroupsSettings({
  entities,
  entityOptions,
  value,
  onChange,
}: RelationGroupsSettingsProps) {
  const itemOptions = useMemo(
    () =>
      entityOptions.map((option) => ({
        value: option.id,
        label: optionLabel(option),
      })),
    [entityOptions],
  );

  const nestedOptions = useMemo(
    () =>
      entityOptions
        .filter((option) => option.id !== value.itemEntityId)
        .map((option) => ({
          value: option.id,
          label: optionLabel(option),
        })),
    [entityOptions, value.itemEntityId],
  );

  const itemEntity =
    entities.find((entity) => entity.id === value.itemEntityId) ?? null;
  const nestedEntity =
    entities.find((entity) => entity.id === value.nestedEntityId) ?? null;

  const nestedSourceOptions = useMemo(() => {
    if (!itemEntity || !value.nestedEntityId) return [];
    return itemEntity.fields
      .filter(
        (field) =>
          field.type === "relation" &&
          getEntityRelationTargetId(field) === value.nestedEntityId,
      )
      .map((field) => ({
        value: field.id,
        label: getEntityFieldDisplayName(field),
      }));
  }, [itemEntity, value.nestedEntityId]);

  const itemDisplayFields = useMemo(
    () => displayFieldCandidates(itemEntity),
    [itemEntity],
  );
  const nestedDisplayFields = useMemo(
    () => displayFieldCandidates(nestedEntity),
    [nestedEntity],
  );

  const itemDisplayAllowed = useMemo(
    () => new Set(itemDisplayFields.map((field) => field.id)),
    [itemDisplayFields],
  );
  const nestedDisplayAllowed = useMemo(
    () => new Set(nestedDisplayFields.map((field) => field.id)),
    [nestedDisplayFields],
  );

  const itemDisplayFieldIds = keepKnownIds(
    value.itemDisplayFieldIds,
    itemDisplayAllowed,
  );
  const nestedDisplayFieldIds = keepKnownIds(
    value.nestedDisplayFieldIds,
    nestedDisplayAllowed,
  );

  const nestedEntityName = nestedEntity
    ? getEntityDisplayName(nestedEntity)
    : null;
  const itemEntityName = itemEntity ? getEntityDisplayName(itemEntity) : null;
  const configured = Boolean(value.itemEntityId && value.nestedEntityId);

  return (
    <div className="flex flex-col gap-2">
      <SettingSelect
        id="entity-field-relation-groups-item"
        title="Строки"
        description="Что выбирают в первую очередь"
        value={value.itemEntityId}
        options={itemOptions}
        emptyLabel="Выберите сущность"
        onChange={(itemEntityId) =>
          onChange({
            ...value,
            itemEntityId,
            nestedEntityId:
              value.nestedEntityId === itemEntityId
                ? null
                : value.nestedEntityId,
            nestedSourceFieldId: null,
            itemDisplayFieldIds: [],
            nestedDisplayFieldIds:
              value.nestedEntityId === itemEntityId
                ? []
                : value.nestedDisplayFieldIds,
            defaultNestedIds:
              value.nestedEntityId === itemEntityId
                ? []
                : value.defaultNestedIds,
          })
        }
      />
      <SettingSelect
        id="entity-field-relation-groups-nested"
        title="Вложенные"
        description="Мультивыбор внутри каждой строки"
        value={value.nestedEntityId}
        options={nestedOptions}
        emptyLabel="Выберите сущность"
        onChange={(nestedEntityId) =>
          onChange({
            ...value,
            nestedEntityId,
            nestedSourceFieldId: null,
            nestedDisplayFieldIds: [],
            defaultNestedIds: [],
          })
        }
      />
      {configured ? (
        <SettingSelect
          id="entity-field-relation-groups-source"
          title="Ограничить вложенные"
          description={
            nestedEntityName
              ? `Необязательно: поле связи на строке → «${nestedEntityName}»`
              : "Необязательно: поле связи на строке"
          }
          value={value.nestedSourceFieldId}
          options={nestedSourceOptions}
          emptyLabel="Все записи"
          onChange={(nestedSourceFieldId) =>
            onChange({ ...value, nestedSourceFieldId })
          }
        />
      ) : null}

      {configured ? (
        <div className="mt-0.5 flex flex-col gap-2.5 border-t border-border/60 pt-2.5">
          <div className="flex flex-col gap-1.5">
            <SettingLabel
              title="Отображение"
              description="Как группы выглядят в форме и в записи"
            />
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = (value.layout ?? "column") === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange({ ...value, layout: option.value })}
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

          <DisplayFieldsPicker
            id="entity-field-relation-groups-item-fields"
            title="Поля строк"
            description={
              itemEntityName
                ? `Кроме названия «${itemEntityName}»`
                : "Кроме названия"
            }
            fields={itemDisplayFields}
            selectedIds={itemDisplayFieldIds}
            onChange={(ids) => onChange({ ...value, itemDisplayFieldIds: ids })}
          />

          <DisplayFieldsPicker
            id="entity-field-relation-groups-nested-fields"
            title="Поля вложенных"
            description={
              nestedEntityName
                ? `Кроме названия «${nestedEntityName}»`
                : "Кроме названия"
            }
            fields={nestedDisplayFields}
            selectedIds={nestedDisplayFieldIds}
            onChange={(ids) =>
              onChange({ ...value, nestedDisplayFieldIds: ids })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
