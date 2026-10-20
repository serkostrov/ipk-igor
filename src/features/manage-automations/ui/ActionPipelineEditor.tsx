import { useMemo } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
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
  toAutomationFieldRef,
  type AutomationAction,
  type AutomationActionKind,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityRelationTargetId,
  getEntityTabKindLabel,
  isEntityComputedFieldType,
  isEntityFilesTab,
  ListSelect,
  parseEntityListValueIds,
  serializeEntityListValueIds,
  SYSTEM_USERS_ENTITY_ID,
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
    const targetLabel = target ? getEntityDisplayName(target) : "новой записи";
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
                  field.type === "relation" ||
                  field.type === "template" ||
                  field.type === "dependencies",
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
          sourceEntityId={sourceEntity?.id}
          sourceEntityName={sourceLabel}
          entities={entities}
          onChange={(mappings) => onChange({ ...action, mappings })}
        />
      </div>
    );
  }

  if (action.kind === "updateRecords") {
    const target =
      entities.find((entity) => entity.id === action.entityId) ?? null;
    const sourceLabel = sourceEntity
      ? getEntityDisplayName(sourceEntity)
      : "текущей записи";
    const sourceOne =
      sourceEntity?.name.trim() || sourceLabel || "текущая запись";
    const targetLabel = target ? getEntityDisplayName(target) : "связанной";
    const targetOne = target?.name.trim() || targetLabel || "запись";
    const linkMode =
      action.linkMode === "backRelation" ? "backRelation" : "relation";

    type UpdateLinkOption = {
      key: string;
      linkMode: "relation" | "backRelation";
      linkFieldId: string;
      title: string;
      hint: string;
    };

    function buildLinkOptions(entityId: string): UpdateLinkOption[] {
      if (!entityId) return [];
      const nextTarget =
        entities.find((entity) => entity.id === entityId) ?? null;
      const nextTargetOne =
        nextTarget?.name.trim() ||
        (nextTarget ? getEntityDisplayName(nextTarget) : "запись");
      const options: UpdateLinkOption[] = [];
      for (const field of fields) {
        if (field.type !== "relation" && field.type !== "dependencies") {
          continue;
        }
        if (getEntityRelationTargetId(field) !== entityId) continue;
        const name = getEntityFieldDisplayName(field);
        options.push({
          key: `relation:${field.id}`,
          linkMode: "relation",
          linkFieldId: field.id,
          title: `Из поля «${name}»`,
          hint: `На этом «${sourceOne}» → записи «${nextTargetOne}»`,
        });
      }
      for (const field of nextTarget?.fields ?? []) {
        if (field.type !== "relation" && field.type !== "dependencies") {
          continue;
        }
        if (!sourceEntity) continue;
        if (getEntityRelationTargetId(field) !== sourceEntity.id) continue;
        const name = getEntityFieldDisplayName(field);
        options.push({
          key: `backRelation:${field.id}`,
          linkMode: "backRelation",
          linkFieldId: field.id,
          title: `Где «${name}» = эта запись`,
          hint: `Все «${nextTargetOne}» с полем «${name}» на этот «${sourceOne}»`,
        });
      }
      return options;
    }

    const linkOptions = buildLinkOptions(action.entityId);
    const selectedLinkKey =
      action.linkFieldId.trim().length > 0
        ? `${linkMode}:${action.linkFieldId}`
        : "";
    const selectedLink =
      linkOptions.find((option) => option.key === selectedLinkKey) ??
      linkOptions.find((option) => option.linkFieldId === action.linkFieldId) ??
      linkOptions[0] ??
      null;

    function applyEntity(entityId: string) {
      const options = buildLinkOptions(entityId);
      const first = options[0];
      onChange({
        ...action,
        kind: "updateRecords",
        entityId,
        linkMode: first?.linkMode ?? "relation",
        linkFieldId: first?.linkFieldId ?? "",
        mappings: [],
      });
    }

    return (
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Что обновляем
          </p>
          <EntitySelect
            entities={entities}
            value={action.entityId}
            onChange={applyEntity}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            Какие именно записи
          </p>
          {!action.entityId ? (
            <p className="text-[11px] text-muted-foreground">
              Сначала выберите сущность.
            </p>
          ) : linkOptions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/70 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              Нет связи между «{sourceOne}» и «{targetOne}». Добавьте поле-связь
              на одной из сущностей.
            </p>
          ) : linkOptions.length === 1 && selectedLink ? (
            <div className="rounded-md border border-border/70 bg-muted/25 px-2.5 py-2">
              <p className="text-sm font-medium text-foreground">
                {selectedLink.title}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {selectedLink.hint}
              </p>
            </div>
          ) : (
            <Select
              value={selectedLink?.key}
              onValueChange={(next) => {
                const option = linkOptions.find((item) => item.key === next);
                if (!option) return;
                onChange({
                  ...action,
                  linkMode: option.linkMode,
                  linkFieldId: option.linkFieldId,
                });
              }}
            >
              <SelectTrigger size="sm" className="h-auto min-h-8 py-1.5">
                <SelectValue>
                  {selectedLink ? (
                    <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                      <span className="truncate">{selectedLink.title}</span>
                      <span className="truncate text-[11px] font-normal text-muted-foreground">
                        {selectedLink.hint}
                      </span>
                    </span>
                  ) : (
                    "Выберите связь"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent searchable={false}>
                {linkOptions.map((option) => (
                  <SelectItem
                    key={option.key}
                    value={option.key}
                    label={`${option.title} ${option.hint}`}
                  >
                    <span className="flex flex-col gap-0.5 py-0.5 text-left">
                      <span>{option.title}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <MappingsEditor
          title="Какие поля заполнить"
          mappings={action.mappings}
          targetFields={target?.fields ?? []}
          targetEntityName={targetLabel}
          sourceFields={sourceEntity?.fields ?? []}
          sourceEntityId={sourceEntity?.id}
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
              field.type === "relation" ||
              field.type === "template" ||
              field.type === "dependencies",
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

function fieldMappingTypeHint(
  field: EntityField,
  entities: Entity[] = [],
): string {
  if (field.type === "relation" || field.type === "template") {
    const targetId = getEntityRelationTargetId(field);
    if (targetId === SYSTEM_USERS_ENTITY_ID) return "Пользователь";
    const target = entities.find((item) => item.id === targetId);
    if (target) return getEntityDisplayName(target);
  }
  return getEntityFieldTypeLabel(field.type);
}

function fieldMappingLabel(
  field: EntityField,
  entities: Entity[] = [],
): string {
  return `${getEntityFieldDisplayName(field)} · ${fieldMappingTypeHint(field, entities)}`;
}

function sortFieldsForMapping(
  fields: EntityField[],
  entities: Entity[],
): EntityField[] {
  return [...fields].sort((left, right) => {
    const leftUsers =
      (left.type === "relation" || left.type === "template") &&
      getEntityRelationTargetId(left) === SYSTEM_USERS_ENTITY_ID
        ? 0
        : 1;
    const rightUsers =
      (right.type === "relation" || right.type === "template") &&
      getEntityRelationTargetId(right) === SYSTEM_USERS_ENTITY_ID
        ? 0
        : 1;
    if (leftUsers !== rightUsers) return leftUsers - rightUsers;
    return fieldMappingLabel(left, entities).localeCompare(
      fieldMappingLabel(right, entities),
      "ru",
    );
  });
}

function FieldSelect({
  fields,
  value,
  onChange,
  placeholder = "Поле",
  entities = [],
  showType = false,
  className,
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  placeholder?: string;
  entities?: Entity[];
  /** Append type / relation target in the list (mapping pickers). */
  showType?: boolean;
  className?: string;
}) {
  const options = showType ? sortFieldsForMapping(fields, entities) : fields;
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-8 w-full min-w-0 overflow-hidden", className)}
      >
        <SelectValue className="min-w-0">
          {(selected) => {
            const field = options.find((item) => item.id === selected);
            return (
              <span className="block truncate">
                {field ? getEntityFieldDisplayName(field) : placeholder}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((field) => {
          const name = getEntityFieldDisplayName(field);
          const typeHint = showType
            ? fieldMappingTypeHint(field, entities)
            : "";
          const full = typeHint ? `${name} · ${typeHint}` : name;
          // `label` is what search indexes; keep type there. Closed trigger
          // uses SelectValue render above (short name only).
          return (
            <SelectItem key={field.id} value={field.id} label={full}>
              {typeHint ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{name}</span>
                  <span className="truncate text-muted-foreground">
                    {typeHint}
                  </span>
                </span>
              ) : (
                name
              )}
            </SelectItem>
          );
        })}
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

function normalizeMappingFieldName(field: EntityField) {
  return getEntityFieldDisplayName(field)
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");
}

function fieldsCompatibleForAutoMap(
  target: EntityField,
  source: EntityField,
): boolean {
  if (isEntityComputedFieldType(source.type) || source.type === "file") {
    return false;
  }
  if (
    (target.type === "relation" || target.type === "template") &&
    (source.type === "relation" || source.type === "template")
  ) {
    const targetId = getEntityRelationTargetId(target);
    const sourceId = getEntityRelationTargetId(source);
    return !targetId || !sourceId || targetId === sourceId;
  }
  if (target.type === source.type) {
    return true;
  }
  if (
    (target.type === "text" || target.type === "textarea") &&
    (source.type === "text" ||
      source.type === "textarea" ||
      source.type === "phone" ||
      source.type === "email" ||
      source.type === "url")
  ) {
    return true;
  }
  return false;
}

function findSameNameSourceField(
  target: EntityField,
  sourceFields: EntityField[],
): EntityField | null {
  const name = normalizeMappingFieldName(target);
  if (!name) return null;
  return (
    sourceFields.find(
      (source) =>
        fieldsCompatibleForAutoMap(target, source) &&
        normalizeMappingFieldName(source) === name,
    ) ?? null
  );
}

function MappingsEditor({
  mappings,
  targetFields,
  targetEntityName,
  sourceFields,
  sourceEntityId,
  sourceEntityName,
  entities,
  title = "Поля новой записи",
  onChange,
}: {
  mappings: Array<{ targetFieldId: string; source: string }>;
  targetFields: EntityField[];
  targetEntityName: string;
  sourceFields: EntityField[];
  sourceEntityId?: string;
  sourceEntityName: string;
  entities: Entity[];
  title?: string;
  onChange: (
    mappings: Array<{ targetFieldId: string; source: string }>,
  ) => void;
}) {
  const writable = targetFields.filter(
    (field) => !isEntityComputedFieldType(field.type) && field.type !== "file",
  );
  const targetLabel = targetEntityName.trim() || "Целевая запись";
  const sourceLabel = sourceEntityName.trim() || "Текущая запись";
  const usedTargetIds = new Set(
    mappings.map((mapping) => mapping.targetFieldId).filter(Boolean),
  );
  const autoMapCount = writable.filter((field) => {
    if (!findSameNameSourceField(field, sourceFields)) return false;
    const existing = mappings.find(
      (mapping) => mapping.targetFieldId === field.id,
    );
    return !existing || !existing.source.trim();
  }).length;

  function autoMapSameNames() {
    const byTarget = new Map(
      mappings.map((mapping, index) => [mapping.targetFieldId, index]),
    );
    const next = [...mappings];
    for (const field of writable) {
      const match = findSameNameSourceField(field, sourceFields);
      if (!match) continue;
      const source = toAutomationFieldRef(match.id);
      const index = byTarget.get(field.id);
      if (index != null) {
        if (!next[index]!.source.trim()) {
          next[index] = { targetFieldId: field.id, source };
        }
        continue;
      }
      next.push({ targetFieldId: field.id, source });
      byTarget.set(field.id, next.length - 1);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            {title}
          </p>
          <p className="truncate text-[10px] text-muted-foreground/80">
            «{sourceLabel}» → «{targetLabel}»
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={autoMapCount === 0}
            title="Добавить маппинги для полей с одинаковыми названиями"
            onClick={autoMapSameNames}
          >
            <Wand2 className="size-3.5" />
            По именам
            {autoMapCount > 0 ? ` · ${autoMapCount}` : ""}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={writable.length === 0}
            onClick={() => {
              const free =
                writable.find((field) => !usedTargetIds.has(field.id)) ??
                writable[0];
              onChange([
                ...mappings,
                { targetFieldId: free?.id ?? "", source: "" },
              ]);
            }}
          >
            <Plus className="size-3.5" />
            Поле
          </Button>
        </div>
      </div>

      {mappings.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          Нет маппингов. Нажмите «По именам» или добавьте поле вручную.
        </p>
      ) : (
        <div className="rounded-md border border-border/70">
          <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_1.75rem] items-center gap-1.5 border-b border-border/60 bg-muted/30 px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <span className="truncate">Куда · {targetLabel}</span>
            <span className="truncate">Откуда · {sourceLabel}</span>
            <span aria-hidden />
          </div>
          <ul className="divide-y divide-border/60">
            {mappings.map((mapping, index) => {
              const target =
                writable.find((field) => field.id === mapping.targetFieldId) ??
                null;
              return (
                <li
                  key={`${mapping.targetFieldId}-${index}`}
                  className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_1.75rem] items-center gap-1.5 px-2 py-1.5"
                >
                  <FieldSelect
                    fields={writable}
                    value={mapping.targetFieldId}
                    placeholder="Поле"
                    entities={entities}
                    showType
                    onChange={(targetFieldId) => {
                      const next = [...mappings];
                      next[index] = { targetFieldId, source: "" };
                      onChange(next);
                    }}
                  />
                  <ActionValueEditor
                    field={target}
                    value={mapping.source}
                    sourceFields={sourceFields}
                    sourceEntityId={sourceEntityId}
                    mapToOtherEntity
                    compact
                    className="min-w-0"
                    entities={entities}
                    onChange={(source) => {
                      const next = [...mappings];
                      next[index] = { ...mapping, source };
                      onChange(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 justify-self-end"
                    aria-label="Удалить маппинг"
                    onClick={() =>
                      onChange(mappings.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
