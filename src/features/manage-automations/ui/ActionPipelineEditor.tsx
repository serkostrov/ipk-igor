import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  AUTOMATION_ACTION_KIND_LABELS,
  AUTOMATION_ACTION_KINDS,
  defaultAutomationAction,
  type AutomationAction,
  type AutomationActionKind,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getEntityTabKindLabel,
  isEntityComputedFieldType,
  isEntityFilesTab,
  ListSelect,
  parseEntityListValueIds,
  serializeEntityListValueIds,
  type Entity,
  type EntityField,
  type EntityListOption,
  type EntityTab,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import { ActionValueEditor } from "./ActionValueEditor";

type ActionPipelineEditorProps = {
  actions: AutomationAction[];
  onChange: (actions: AutomationAction[]) => void;
  entities: Entity[];
  sourceEntity: Entity | null;
  className?: string;
  /** Hide kinds managed elsewhere (e.g. setField in OutcomeAutofillEditor). */
  omitKinds?: readonly AutomationActionKind[];
  /** Default kind for «+ Действие». */
  addKind?: AutomationActionKind;
};

export function ActionPipelineEditor({
  actions,
  onChange,
  entities,
  sourceEntity,
  className,
  omitKinds = [],
  addKind = "setField",
}: ActionPipelineEditorProps) {
  const omit = new Set(omitKinds);
  const kindOptions = AUTOMATION_ACTION_KINDS.filter((kind) => !omit.has(kind));
  const visible = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => !omit.has(action.kind));

  function update(index: number, action: AutomationAction) {
    const next = [...actions];
    next[index] = action;
    onChange(next);
  }

  const defaultAdd =
    addKind && !omit.has(addKind)
      ? addKind
      : (kindOptions[0] ?? ("noop" as AutomationActionKind));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {visible.map(({ action, index }) => (
        <div
          key={action.id}
          className="rounded-md border border-border/70 bg-background p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <Select
              value={action.kind}
              onValueChange={(next) => {
                if (
                  next != null &&
                  (AUTOMATION_ACTION_KINDS as readonly string[]).includes(
                    String(next),
                  )
                ) {
                  update(
                    index,
                    defaultAutomationAction(
                      String(next) as AutomationActionKind,
                    ),
                  );
                }
              }}
            >
              <SelectTrigger size="sm" className="min-w-0 flex-1">
                <SelectValue>
                  {AUTOMATION_ACTION_KIND_LABELS[action.kind]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {AUTOMATION_ACTION_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить действие"
              onClick={() => onChange(actions.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <ActionFields
            action={action}
            entities={entities}
            sourceEntity={sourceEntity}
            onChange={(next) => update(index, next)}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs"
        disabled={kindOptions.length === 0}
        onClick={() =>
          onChange([...actions, defaultAutomationAction(defaultAdd)])
        }
      >
        <Plus className="size-3.5" />
        Действие
      </Button>
    </div>
  );
}

function ActionFields({
  action,
  entities,
  sourceEntity,
  onChange,
}: {
  action: AutomationAction;
  entities: Entity[];
  sourceEntity: Entity | null;
  onChange: (action: AutomationAction) => void;
}) {
  const fields = (sourceEntity?.fields ?? []).filter(
    (field) => !isEntityComputedFieldType(field.type),
  );

  if (action.kind === "setField" || action.kind === "setFieldPrevious") {
    const selected =
      fields.find((field) => field.id === action.fieldId) ?? null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <FieldSelect
          fields={fields.filter(
            (field) =>
              action.kind === "setFieldPrevious" || field.type !== "file",
          )}
          value={action.fieldId}
          placeholder="Поле"
          onChange={(fieldId) => {
            if (action.kind === "setField") {
              onChange({ ...action, fieldId, value: "" });
            } else {
              onChange({ ...action, fieldId });
            }
          }}
        />
        {action.kind === "setField" ? (
          <ActionValueEditor
            field={selected}
            value={action.value}
            sourceFields={sourceEntity?.fields ?? []}
            entities={entities}
            onChange={(value) => onChange({ ...action, value })}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Вернёт значение поля до изменения
          </p>
        )}
      </div>
    );
  }

  if (
    action.kind === "createRecord" ||
    action.kind === "createRecordsFromMapping"
  ) {
    const target =
      entities.find((entity) => entity.id === action.entityId) ?? null;
    const sourceLabel = sourceEntity
      ? getEntityDisplayName(sourceEntity)
      : "текущей записи";
    const targetLabel = target
      ? getEntityDisplayName(target)
      : "новой записи";
    const parentLinked =
      Boolean(target?.parentEntityId) &&
      target?.parentEntityId === sourceEntity?.id;
    const linkBackFields = fields.filter((field) => {
      if (field.type !== "relation" && field.type !== "dependencies") {
        return false;
      }
      if (!target) return true;
      const targetId = getEntityRelationTargetId(field);
      return !targetId || targetId === target.id;
    });
    return (
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Создать в сущности
          </p>
          <EntitySelect
            entities={entities}
            value={action.entityId}
            onChange={(entityId) =>
              onChange({
                ...action,
                entityId,
                ...(action.kind === "createRecord"
                  ? { linkBackFieldId: undefined }
                  : {}),
              })
            }
          />
          {parentLinked ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              Новая запись автоматически привяжется к текущей «{sourceLabel}»
              как к родителю
            </p>
          ) : null}
        </div>
        {action.kind === "createRecordsFromMapping" ? (
          <>
            <FieldSelect
              fields={fields.filter(
                (field) =>
                  field.type === "relation" || field.type === "dependencies",
              )}
              value={action.fanOutFieldId}
              placeholder="Поле со списком записей"
              onChange={(fanOutFieldId) =>
                onChange({ ...action, fanOutFieldId })
              }
            />
            <FieldSelect
              fields={target?.fields ?? []}
              value={action.fanOutTargetFieldId}
              placeholder="Поле связи в новой записи"
              onChange={(fanOutTargetFieldId) =>
                onChange({ ...action, fanOutTargetFieldId })
              }
            />
          </>
        ) : null}
        {action.kind === "createRecord" && linkBackFields.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Записать связь обратно в «{sourceLabel}»
            </p>
            <Select
              value={action.linkBackFieldId || "__none__"}
              onValueChange={(next) => {
                if (next == null) return;
                const linkBackFieldId =
                  String(next) === "__none__" ? undefined : String(next);
                onChange({ ...action, linkBackFieldId });
              }}
            >
              <SelectTrigger size="sm" className="h-8">
                <SelectValue>
                  {(() => {
                    const selected = linkBackFields.find(
                      (field) => field.id === action.linkBackFieldId,
                    );
                    return selected
                      ? getEntityFieldDisplayName(selected)
                      : "Не записывать";
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Не записывать</SelectItem>
                {linkBackFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {getEntityFieldDisplayName(field)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <MappingsEditor
          mappings={action.mappings}
          targetFields={target?.fields ?? []}
          targetEntityName={targetLabel}
          sourceFields={sourceEntity?.fields ?? []}
          sourceEntityName={sourceLabel}
          entities={entities}
          onChange={(mappings) => onChange({ ...action, mappings })}
        />
      </div>
    );
  }

  if (action.kind === "setRelation" || action.kind === "addRelation") {
    const selected =
      fields.find((field) => field.id === action.fieldId) ?? null;
    return (
      <div className="mt-2 flex flex-col gap-2">
        <FieldSelect
          fields={fields.filter(
            (field) =>
              field.type === "relation" || field.type === "dependencies",
          )}
          value={action.fieldId}
          placeholder="Поле связи"
          onChange={(fieldId) => onChange({ ...action, fieldId, value: "" })}
        />
        <ActionValueEditor
          field={selected}
          value={action.value}
          sourceFields={sourceEntity?.fields ?? []}
          entities={entities}
          onChange={(value) => onChange({ ...action, value })}
        />
      </div>
    );
  }

  if (action.kind === "startProcess") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <Input
          className="h-8"
          placeholder="ID процесса"
          value={action.processId}
          onChange={(event) =>
            onChange({ ...action, processId: event.target.value })
          }
        />
      </div>
    );
  }

  if (action.kind === "notify") {
    return (
      <Input
        className="mt-2 h-8"
        placeholder="Текст уведомления"
        value={action.message}
        onChange={(event) =>
          onChange({ ...action, message: event.target.value })
        }
      />
    );
  }

  if (action.kind === "requireFields") {
    return (
      <RequireFieldsEditor
        fields={fields}
        selectedIds={action.fieldIds}
        title="Обязательные поля"
        onChange={(fieldIds) => onChange({ ...action, fieldIds })}
      />
    );
  }

  if (action.kind === "viewField") {
    return (
      <RequireFieldsEditor
        fields={fields}
        selectedIds={action.fieldIds}
        title="Показать в форме задачи"
        hint="Только просмотр — чтобы заполнять другие поля на их основе"
        onChange={(fieldIds) => onChange({ ...action, fieldIds })}
      />
    );
  }

  if (action.kind === "viewTabs") {
    return (
      <ViewTabsEditor
        tabs={sourceEntity?.tabs ?? []}
        selectedIds={action.tabIds}
        filesTabEntryIds={action.filesTabEntryIds ?? {}}
        filesTabAllowMove={action.filesTabAllowMove === true}
        onChange={(next) =>
          onChange({
            ...action,
            tabIds: next.tabIds,
            filesTabEntryIds: next.filesTabEntryIds,
            filesTabAllowMove: next.filesTabAllowMove,
          })
        }
      />
    );
  }

  if (action.kind === "attachToFolder") {
    return (
      <div className="mt-2">
        <FieldSelect
          fields={fields.filter((field) => field.type === "file")}
          value={action.fileFieldId}
          placeholder="Поле файла"
          onChange={(fileFieldId) => onChange({ ...action, fileFieldId })}
        />
      </div>
    );
  }

  return null;
}

function EntitySelect({
  entities,
  value,
  onChange,
}: {
  entities: Entity[];
  value: string;
  onChange: (entityId: string) => void;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>
          {entities.find((item) => item.id === value)?.name || "Сущность"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {entities.map((entity) => (
          <SelectItem key={entity.id} value={entity.id}>
            {entity.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldSelect({
  fields,
  value,
  onChange,
  placeholder = "Поле",
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  placeholder?: string;
}) {
  const selected = fields.find((field) => field.id === value);
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>
          {selected ? getEntityFieldDisplayName(selected) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {fields.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            {getEntityFieldDisplayName(field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ViewTabsEditor({
  tabs,
  selectedIds,
  filesTabEntryIds,
  filesTabAllowMove,
  onChange,
}: {
  tabs: EntityTab[];
  selectedIds: string[];
  filesTabEntryIds: Record<string, string[]>;
  filesTabAllowMove: boolean;
  onChange: (next: {
    tabIds: string[];
    filesTabEntryIds: Record<string, string[]>;
    filesTabAllowMove: boolean;
  }) => void;
}) {
  const options = useMemo<EntityListOption[]>(
    () =>
      tabs.map((tab) => {
        const kindLabel = getEntityTabKindLabel(tab.kind);
        const name = tab.name.trim() || kindLabel;
        return {
          id: tab.id,
          name: name === kindLabel ? name : `${name} · ${kindLabel}`,
          color: "#94a3b8",
          parentOptionId: null,
        };
      }),
    [tabs],
  );
  const knownIds = useMemo(
    () => new Set(options.map((option) => option.id)),
    [options],
  );
  const value = serializeEntityListValueIds(
    selectedIds.filter((id) => knownIds.has(id)),
  );
  const selectedTabs = useMemo(
    () =>
      selectedIds
        .map((id) => tabs.find((tab) => tab.id === id))
        .filter((tab): tab is EntityTab => tab != null),
    [selectedIds, tabs],
  );
  const selectedFilesTabs = selectedTabs.filter(isEntityFilesTab);

  function setTabIds(tabIds: string[]) {
    const nextIds = tabIds.filter((id) => knownIds.has(id));
    const allowed = new Set(nextIds);
    const nextFiles: Record<string, string[]> = {};
    for (const [tabId, entryIds] of Object.entries(filesTabEntryIds)) {
      if (!allowed.has(tabId) || entryIds.length === 0) continue;
      nextFiles[tabId] = entryIds;
    }
    const stillHasFilesTab = nextIds.some((id) =>
      tabs.some((tab) => tab.id === id && isEntityFilesTab(tab)),
    );
    onChange({
      tabIds: nextIds,
      filesTabEntryIds: nextFiles,
      filesTabAllowMove: stillHasFilesTab ? filesTabAllowMove : false,
    });
  }

  function setFilesEntries(tabId: string, entryIds: string[]) {
    const nextFiles = { ...filesTabEntryIds };
    if (entryIds.length === 0) {
      delete nextFiles[tabId];
    } else {
      nextFiles[tabId] = entryIds;
    }
    onChange({
      tabIds: selectedIds,
      filesTabEntryIds: nextFiles,
      filesTabAllowMove,
    });
  }

  if (tabs.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        У сущности пока нет вкладок
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Показать в форме задачи
        </p>
        <p className="text-[10px] leading-snug text-muted-foreground/80">
          Только просмотр — любая вкладка карточки этой сущности
        </p>
      </div>
      <ListSelect
        options={options}
        value={value}
        multiple
        size="sm"
        showColors={false}
        emptyLabel="Выберите вкладки"
        aria-label="Вкладки для просмотра"
        className="h-8 rounded-md border-input font-normal shadow-xs"
        onChange={(next) => setTabIds(parseEntityListValueIds(next))}
      />

      {selectedFilesTabs.map((tab) => {
        const folderOptions: EntityListOption[] = tab.defaultFolders.map(
          (folder) => ({
            id: folder.id,
            name: folder.name,
            color: folder.color || "#94a3b8",
            parentOptionId: null,
          }),
        );
        const knownFolderIds = new Set(folderOptions.map((item) => item.id));
        const selectedFolderIds = (filesTabEntryIds[tab.id] ?? []).filter(
          (id) => knownFolderIds.has(id),
        );
        const tabLabel = tab.name.trim() || "Файлы";

        if (folderOptions.length === 0) {
          return (
            <p
              key={tab.id}
              className="text-[11px] leading-snug text-muted-foreground"
            >
              На вкладке «{tabLabel}» нет настроенных папок — в задаче
              отобразится вся вкладка.
            </p>
          );
        }

        return (
          <div key={tab.id} className="flex flex-col gap-1.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Папки · {tabLabel}
              </p>
              <p className="text-[10px] leading-snug text-muted-foreground/80">
                Пусто — вся вкладка. Выбранные папки покажутся вместе с файлами
                внутри.
              </p>
            </div>
            <ListSelect
              options={folderOptions}
              value={serializeEntityListValueIds(selectedFolderIds)}
              multiple
              size="sm"
              showColors
              emptyLabel="Все папки и файлы"
              aria-label={`Папки вкладки ${tabLabel}`}
              className="h-8 rounded-md border-input font-normal shadow-xs"
              onChange={(next) =>
                setFilesEntries(tab.id, parseEntityListValueIds(next))
              }
            />
          </div>
        );
      })}

      {selectedFilesTabs.length > 0 ? (
        <SettingSwitch
          id="automation-view-tabs-allow-move"
          title="Перемещение файлов"
          description="В задании можно перекладывать файлы между папками этой вкладки"
          checked={filesTabAllowMove}
          onCheckedChange={(checked) =>
            onChange({
              tabIds: selectedIds,
              filesTabEntryIds,
              filesTabAllowMove: checked,
            })
          }
        />
      ) : null}
    </div>
  );
}

function RequireFieldsEditor({
  fields,
  selectedIds,
  onChange,
  title,
  hint,
}: {
  fields: EntityField[];
  selectedIds: string[];
  onChange: (fieldIds: string[]) => void;
  title: string;
  hint?: string;
}) {
  const options = useMemo<EntityListOption[]>(
    () =>
      fields.map((field) => ({
        id: field.id,
        name: getEntityFieldDisplayName(field),
        color: "#94a3b8",
        parentOptionId: null,
      })),
    [fields],
  );
  const knownIds = useMemo(
    () => new Set(options.map((option) => option.id)),
    [options],
  );
  const value = serializeEntityListValueIds(
    selectedIds.filter((id) => knownIds.has(id)),
  );

  if (fields.length === 0) {
    return <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
        {hint ? (
          <p className="text-[10px] leading-snug text-muted-foreground/80">
            {hint}
          </p>
        ) : null}
      </div>
      <ListSelect
        options={options}
        value={value}
        multiple
        size="sm"
        showColors={false}
        emptyLabel="Выберите поля"
        aria-label={title}
        className="h-8 rounded-md border-input font-normal shadow-xs"
        onChange={(next) => onChange(parseEntityListValueIds(next))}
      />
    </div>
  );
}

function MappingsEditor({
  mappings,
  targetFields,
  targetEntityName,
  sourceFields,
  sourceEntityName,
  entities,
  onChange,
}: {
  mappings: Array<{ targetFieldId: string; source: string }>;
  targetFields: EntityField[];
  targetEntityName: string;
  sourceFields: EntityField[];
  sourceEntityName: string;
  entities: Entity[];
  onChange: (
    mappings: Array<{ targetFieldId: string; source: string }>,
  ) => void;
}) {
  const writable = targetFields.filter(
    (field) => !isEntityComputedFieldType(field.type) && field.type !== "file",
  );
  const targetLabel = targetEntityName.trim() || "Новая запись";
  const sourceLabel = sourceEntityName.trim() || "Текущая запись";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          Заполнить поля новой записи
        </p>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Откуда</span>
          <span className="truncate">«{sourceLabel}»</span>
          <span className="text-muted-foreground/70" aria-hidden>
            →
          </span>
          <span className="font-medium text-foreground/80">Куда</span>
          <span className="truncate">«{targetLabel}»</span>
        </div>
      </div>
      {mappings.map((mapping, index) => {
        const target =
          writable.find((field) => field.id === mapping.targetFieldId) ?? null;
        return (
          <div
            key={`${mapping.targetFieldId}-${index}`}
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-background p-2.5"
          >
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  Куда · поле в «{targetLabel}»
                </p>
                <FieldSelect
                  fields={writable}
                  value={mapping.targetFieldId}
                  placeholder="Выберите поле"
                  onChange={(targetFieldId) => {
                    const next = [...mappings];
                    next[index] = { targetFieldId, source: "" };
                    onChange(next);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-4 shrink-0"
                aria-label="Удалить маппинг"
                onClick={() =>
                  onChange(mappings.filter((_, i) => i !== index))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-1 border-t border-border/50 pt-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Откуда · значение из «{sourceLabel}»
              </p>
              <ActionValueEditor
                field={target}
                value={mapping.source}
                sourceFields={sourceFields}
                mapToOtherEntity
                entities={entities}
                onChange={(source) => {
                  const next = [...mappings];
                  next[index] = { ...mapping, source };
                  onChange(next);
                }}
              />
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs"
        disabled={writable.length === 0}
        onClick={() =>
          onChange([
            ...mappings,
            { targetFieldId: writable[0]?.id ?? "", source: "" },
          ])
        }
      >
        <Plus className="size-3.5" />
        Поле
      </Button>
    </div>
  );
}
