import { useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectOptionGroups,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  AUTOMATION_ACTION_KIND_GROUPS,
  AUTOMATION_ACTION_KIND_LABELS,
  AUTOMATION_ACTION_KINDS,
  automationRelationGroupsAskModeLabel,
  automationRelationGroupsAskModes,
  createAutomationNestedCreateId,
  defaultAutomationAction,
  toAutomationFieldRef,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationCreateNestedSpec,
  type AutomationFieldAskOptions,
  type AutomationRelationGroupsAskMode,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityFieldTypeLabel,
  getEntityRelationTargetId,
  getEntityTabKindLabel,
  getRelationGroupsLevelEntityId,
  isEntityComputedFieldType,
  isEntityFilesTab,
  isEntityTabWithLinkedEntity,
  ListSelect,
  parseEntityListValueIds,
  resolveEntityLookupTarget,
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
  /** When true, omit the local «+ Действие» (parent provides Add). */
  hideAdd?: boolean;
};

type CreateRecordExtras = {
  ask?: boolean;
  nested?: boolean;
};

export function ActionPipelineEditor({
  actions,
  onChange,
  entities,
  sourceEntity,
  className,
  omitKinds = [],
  addKind = "setField",
  hideAdd = false,
}: ActionPipelineEditorProps) {
  const omit = new Set(omitKinds);
  const kindOptions = AUTOMATION_ACTION_KINDS.filter((kind) => !omit.has(kind));
  const visible = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => !omit.has(action.kind));
  const [createExtras, setCreateExtras] = useState<
    Record<string, CreateRecordExtras>
  >({});

  function update(index: number, action: AutomationAction) {
    const next = [...actions];
    next[index] = action;
    onChange(next);
  }

  function setCreateExtra(
    actionId: string,
    patch: Partial<CreateRecordExtras>,
  ) {
    setCreateExtras((prev) => ({
      ...prev,
      [actionId]: { ...prev[actionId], ...patch },
    }));
  }

  function clearCreateExtra(actionId: string, key: keyof CreateRecordExtras) {
    setCreateExtras((prev) => {
      const current = prev[actionId];
      if (!current?.[key]) return prev;
      const nextEntry = { ...current, [key]: false };
      if (!nextEntry.ask && !nextEntry.nested) {
        const next = { ...prev };
        delete next[actionId];
        return next;
      }
      return { ...prev, [actionId]: nextEntry };
    });
  }

  function dropCreateExtras(actionId: string) {
    setCreateExtras((prev) => {
      if (!(actionId in prev)) return prev;
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }

  const defaultAdd =
    addKind && !omit.has(addKind)
      ? addKind
      : (kindOptions[0] ?? ("noop" as AutomationActionKind));

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {visible.map(({ action, index }) => {
        const createAction = action.kind === "createRecord" ? action : null;
        const createTarget = createAction
          ? (entities.find((entity) => entity.id === createAction.entityId) ??
            null)
          : null;
        const createTargetLabel = createTarget
          ? getEntityDisplayName(createTarget)
          : "новой записи";
        const showCreateAsk =
          createAction != null &&
          ((createAction.askFieldIds?.length ?? 0) > 0 ||
            Boolean(createExtras[action.id]?.ask));
        const showCreateNested =
          createAction != null &&
          ((createAction.nestedCreates?.length ?? 0) > 0 ||
            Boolean(createExtras[action.id]?.nested));
        const nestedOptions = createTarget
          ? getCreateNestedEntityOptions(createTarget, entities)
          : [];

        return (
          <div key={action.id} className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs">
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
                      dropCreateExtras(action.id);
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
                    <SelectOptionGroups
                      groups={AUTOMATION_ACTION_KIND_GROUPS}
                      available={kindOptions}
                      getLabel={(kind) => AUTOMATION_ACTION_KIND_LABELS[kind]}
                    />
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Удалить действие"
                  onClick={() => {
                    dropCreateExtras(action.id);
                    onChange(actions.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <ActionFields
                action={action}
                entities={entities}
                sourceEntity={sourceEntity}
                onChange={(next) => update(index, next)}
                createAskVisible={showCreateAsk}
                createNestedVisible={showCreateNested}
                onOpenCreateAsk={
                  createAction
                    ? () => setCreateExtra(action.id, { ask: true })
                    : undefined
                }
                onOpenCreateNested={
                  createAction
                    ? () => setCreateExtra(action.id, { nested: true })
                    : undefined
                }
              />
            </div>

            {createAction && showCreateAsk && createTarget ? (
              <CreateRecordAskFieldsEditor
                title="Спросить при создании"
                hint={`Исполнитель заполнит в форме задачи · «${createTargetLabel}»`}
                fields={createTarget.fields}
                askFieldIds={createAction.askFieldIds ?? []}
                askRequiredFieldIds={createAction.askRequiredFieldIds ?? []}
                fieldAskOptions={createAction.fieldAskOptions ?? {}}
                onRemove={() => {
                  clearCreateExtra(action.id, "ask");
                  update(index, {
                    ...createAction,
                    askFieldIds: undefined,
                    askRequiredFieldIds: undefined,
                    fieldAskOptions: undefined,
                  });
                }}
                onChange={(next) =>
                  update(index, {
                    ...createAction,
                    askFieldIds:
                      next.askFieldIds.length > 0
                        ? next.askFieldIds
                        : undefined,
                    askRequiredFieldIds:
                      next.askRequiredFieldIds.length > 0
                        ? next.askRequiredFieldIds
                        : undefined,
                    fieldAskOptions:
                      Object.keys(next.fieldAskOptions).length > 0
                        ? next.fieldAskOptions
                        : undefined,
                  })
                }
              />
            ) : null}

            {createAction && showCreateNested && createTarget ? (
              <CreateRecordNestedEditor
                nestedCreates={createAction.nestedCreates ?? []}
                nestedOptions={nestedOptions}
                parentLabel={createTargetLabel}
                sourceEntity={sourceEntity}
                entities={entities}
                onRemove={() => {
                  clearCreateExtra(action.id, "nested");
                  update(index, {
                    ...createAction,
                    nestedCreates: undefined,
                  });
                }}
                onChange={(nestedCreates) =>
                  update(index, {
                    ...createAction,
                    nestedCreates:
                      nestedCreates.length > 0 ? nestedCreates : undefined,
                  })
                }
              />
            ) : null}
          </div>
        );
      })}
      {hideAdd ? null : (
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
      )}
    </div>
  );
}

function ActionFields({
  action,
  entities,
  sourceEntity,
  onChange,
  createAskVisible = false,
  createNestedVisible = false,
  onOpenCreateAsk,
  onOpenCreateNested,
}: {
  action: AutomationAction;
  entities: Entity[];
  sourceEntity: Entity | null;
  onChange: (action: AutomationAction) => void;
  createAskVisible?: boolean;
  createNestedVisible?: boolean;
  onOpenCreateAsk?: () => void;
  onOpenCreateNested?: () => void;
}) {
  const fields = (sourceEntity?.fields ?? []).filter(
    (field) => !isEntityComputedFieldType(field.type),
  );

  if (action.kind === "setField" || action.kind === "setFieldPrevious") {
    const selected =
      fields.find((field) => field.id === action.fieldId) ?? null;
    return (
      <div className="flex flex-col gap-2">
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

  if (action.kind === "createRecord") {
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
    const nestedOptions = target
      ? getCreateNestedEntityOptions(target, entities)
      : [];
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Создать в сущности
          </p>
          <EntitySelect
            entities={entities}
            sourceEntity={sourceEntity}
            value={action.entityId}
            onChange={(entityId) =>
              onChange({
                ...action,
                entityId,
                linkBackFieldId: undefined,
                mappings: [],
                askFieldIds: undefined,
                askRequiredFieldIds: undefined,
                fieldAskOptions: undefined,
                nestedCreates: undefined,
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
        {linkBackFields.length > 0 ? (
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
        {target &&
        (!createAskVisible || !createNestedVisible) &&
        (onOpenCreateAsk || onOpenCreateNested) ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
            {!createAskVisible && onOpenCreateAsk ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
                onClick={onOpenCreateAsk}
              >
                <Plus className="size-3.5 shrink-0" />
                Спросить в форме
              </Button>
            ) : null}
            {!createNestedVisible && onOpenCreateNested ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
                disabled={nestedOptions.length === 0}
                title={
                  nestedOptions.length === 0
                    ? "Нет подсущностей или связанных вкладок"
                    : undefined
                }
                onClick={onOpenCreateNested}
              >
                <Plus className="size-3.5 shrink-0" />
                Вложенные записи
              </Button>
            ) : null}
          </div>
        ) : null}
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
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Что обновляем
          </p>
          <EntitySelect
            entities={entities}
            sourceEntity={sourceEntity}
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
            <p className="text-[11px] leading-snug text-muted-foreground">
              Нет связи между «{sourceOne}» и «{targetOne}». Добавьте поле-связь
              на одной из сущностей.
            </p>
          ) : linkOptions.length === 1 && selectedLink ? (
            <div className="rounded-md bg-background/60 px-2.5 py-2">
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
      <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-1.5">
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
        className="h-8"
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
      <FieldSelect
        fields={fields.filter((field) => field.type === "file")}
        value={action.fileFieldId}
        placeholder="Поле файла"
        onChange={(fileFieldId) => onChange({ ...action, fileFieldId })}
      />
    );
  }

  return null;
}

/** Entities reachable from the trigger record (self, tabs, relations, children). */
function collectEntityScopedIds(
  source: Entity,
  entities: readonly Entity[],
): Set<string> {
  const ids = new Set<string>([source.id]);
  for (const entity of entities) {
    if (entity.parentEntityId === source.id) ids.add(entity.id);
  }
  for (const tab of source.tabs) {
    if (!isEntityTabWithLinkedEntity(tab)) continue;
    const linkedId = tab.linkedEntityId?.trim();
    if (linkedId) ids.add(linkedId);
  }
  const resolveFieldTarget = (entityId: string, fieldId: string) => {
    const host = entities.find((item) => item.id === entityId);
    const field = host?.fields.find((item) => item.id === fieldId);
    return field ? getEntityRelationTargetId(field) : null;
  };
  for (const field of source.fields) {
    if (field.type === "relation" || field.type === "belonging") {
      const targetId = getEntityRelationTargetId(field);
      if (targetId) ids.add(targetId);
      continue;
    }
    if (field.type === "relationGroups" && field.relationGroups) {
      let previous: string | null = null;
      for (const level of field.relationGroups.levels) {
        const levelId = getRelationGroupsLevelEntityId(
          level,
          previous,
          resolveFieldTarget,
        );
        if (!levelId) break;
        ids.add(levelId);
        previous = levelId;
      }
      continue;
    }
    if (field.type === "lookup") {
      const target = resolveEntityLookupTarget(source, field, entities);
      if (target) ids.add(target.entity.id);
    }
  }
  return ids;
}

function EntitySelect({
  entities,
  sourceEntity,
  value,
  onChange,
}: {
  entities: Entity[];
  sourceEntity?: Entity | null;
  value: string;
  onChange: (entityId: string) => void;
}) {
  const selected = entities.find((item) => item.id === value) ?? null;
  const sorted = [...entities].sort((left, right) =>
    getEntityDisplayName(left).localeCompare(getEntityDisplayName(right), "ru"),
  );
  const scopedIds = sourceEntity
    ? collectEntityScopedIds(sourceEntity, entities)
    : null;
  const inEntity = scopedIds
    ? sorted.filter((entity) => scopedIds.has(entity.id))
    : [];
  const common = scopedIds
    ? sorted.filter((entity) => !scopedIds.has(entity.id))
    : sorted;
  const groups = scopedIds
    ? [
        { label: "В сущности", items: inEntity.map((entity) => entity.id) },
        { label: "Общие", items: common.map((entity) => entity.id) },
      ]
    : [{ label: "Сущности", items: sorted.map((entity) => entity.id) }];
  const labelById = new Map(
    entities.map((entity) => [entity.id, getEntityDisplayName(entity)]),
  );

  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger size="sm" className="h-8">
        <SelectValue>
          {selected ? getEntityDisplayName(selected) : "Сущность"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72" searchPlaceholder="Поиск…">
        <SelectOptionGroups
          groups={groups}
          getLabel={(id) => labelById.get(id) ?? id}
        />
      </SelectContent>
    </Select>
  );
}

function fieldMappingTypeHint(
  field: EntityField,
  entities: Entity[] = [],
): string {
  if (field.type === "relation") {
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
      left.type === "relation" &&
      getEntityRelationTargetId(left) === SYSTEM_USERS_ENTITY_ID
        ? 0
        : 1;
    const rightUsers =
      right.type === "relation" &&
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
      <p className="text-[11px] text-muted-foreground">
        У сущности пока нет вкладок
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
    return <p className="text-[11px] text-muted-foreground">Нет полей</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
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
  if (source.type === "file" || source.type === "dependencies") {
    return false;
  }
  if (source.type === "relationGroups") {
    return target.type === "relationGroups";
  }
  if (target.type === source.type) {
    if (target.type === "relation") {
      const targetId = getEntityRelationTargetId(target);
      const sourceId = getEntityRelationTargetId(source);
      return !targetId || !sourceId || targetId === sourceId;
    }
    return true;
  }
  if (
    (target.type === "text" || target.type === "textarea") &&
    (source.type === "text" ||
      source.type === "textarea" ||
      source.type === "phone" ||
      source.type === "email" ||
      source.type === "url" ||
      source.type === "relation" ||
      source.type === "lookup" ||
      source.type === "list" ||
      source.type === "number" ||
      source.type === "formula" ||
      source.type === "rollup" ||
      source.type === "numberSum")
  ) {
    return true;
  }
  if (target.type === "relation" && source.type === "lookup") return true;
  if (
    target.type === "number" &&
    (source.type === "formula" ||
      source.type === "rollup" ||
      source.type === "numberSum" ||
      source.type === "lookup" ||
      source.type === "text")
  ) {
    return true;
  }
  if (target.type === "list" && source.type === "lookup") return true;
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

function isCreateAskableField(field: EntityField) {
  return (
    !isEntityComputedFieldType(field.type) &&
    field.type !== "file" &&
    field.type !== "dependencies"
  );
}

function getCreateNestedEntityOptions(
  parent: Entity,
  entities: Entity[],
): Entity[] {
  const ids = new Set<string>();
  for (const entity of entities) {
    if (entity.parentEntityId === parent.id) ids.add(entity.id);
  }
  for (const tab of parent.tabs) {
    if (isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId) {
      ids.add(tab.linkedEntityId);
    }
  }
  return entities
    .filter((entity) => ids.has(entity.id))
    .sort((left, right) =>
      getEntityDisplayName(left).localeCompare(
        getEntityDisplayName(right),
        "ru",
      ),
    );
}

function toggleIdList(ids: string[], fieldId: string, enabled: boolean) {
  if (enabled) {
    return ids.includes(fieldId) ? ids : [...ids, fieldId];
  }
  return ids.filter((id) => id !== fieldId);
}

function CreateAskFlagCheckbox({
  checked,
  disabled,
  label,
  title,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      title={title}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground",
        checked && !disabled && "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="size-3 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function CreateRecordAskFieldsEditor({
  title,
  hint,
  fields,
  askFieldIds,
  askRequiredFieldIds,
  fieldAskOptions,
  onChange,
  onRemove,
  embedded = false,
}: {
  title: string;
  hint?: string;
  fields: EntityField[];
  askFieldIds: string[];
  askRequiredFieldIds: string[];
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
  onChange: (next: {
    askFieldIds: string[];
    askRequiredFieldIds: string[];
    fieldAskOptions: Record<string, AutomationFieldAskOptions>;
  }) => void;
  onRemove?: () => void;
  /** Compact block inside a nested slot (no outer card). */
  embedded?: boolean;
}) {
  const askable = fields.filter(isCreateAskableField);
  const selected = askFieldIds
    .map((id) => askable.find((field) => field.id === id))
    .filter((field): field is EntityField => field != null);
  const available = askable.filter((field) => !askFieldIds.includes(field.id));

  function removeField(fieldId: string) {
    const nextOptions = { ...fieldAskOptions };
    delete nextOptions[fieldId];
    onChange({
      askFieldIds: askFieldIds.filter((id) => id !== fieldId),
      askRequiredFieldIds: askRequiredFieldIds.filter((id) => id !== fieldId),
      fieldAskOptions: nextOptions,
    });
  }

  function setRequired(fieldId: string, required: boolean) {
    const field = fields.find((item) => item.id === fieldId);
    if (field && isEntityComputedFieldType(field.type)) return;
    onChange({
      askFieldIds,
      askRequiredFieldIds: toggleIdList(askRequiredFieldIds, fieldId, required),
      fieldAskOptions,
    });
  }

  function setRelationGroupsMode(
    fieldId: string,
    mode: AutomationRelationGroupsAskMode,
  ) {
    const nextOptions = { ...fieldAskOptions };
    if (mode === "full") {
      delete nextOptions[fieldId];
    } else {
      nextOptions[fieldId] = {
        ...nextOptions[fieldId],
        relationGroupsMode: mode,
      };
    }
    onChange({
      askFieldIds,
      askRequiredFieldIds,
      fieldAskOptions: nextOptions,
    });
  }

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "min-w-0 font-medium leading-none text-muted-foreground",
              embedded ? "text-[11px]" : "text-xs",
            )}
          >
            {title}
          </p>
          {hint ? (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
              {hint}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {available.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
                  />
                }
              >
                <Plus className="size-3.5 shrink-0" />
                Поле
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 min-w-52">
                {available.map((field) => (
                  <DropdownMenuItem
                    key={field.id}
                    onClick={() =>
                      onChange({
                        askFieldIds: [...askFieldIds, field.id],
                        askRequiredFieldIds,
                        fieldAskOptions,
                      })
                    }
                  >
                    {getEntityFieldDisplayName(field)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Убрать"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      {selected.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Добавьте поля — исполнитель заполнит их в форме задачи
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {selected.map((field) => {
            const required = askRequiredFieldIds.includes(field.id);
            const computed = isEntityComputedFieldType(field.type);
            return (
              <li key={field.id} className="list-none">
                <div className="flex flex-col gap-1 rounded-md bg-muted/30 px-2 py-1.5">
                  <div className="flex h-7 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {getEntityFieldDisplayName(field)}
                    </span>
                    <CreateAskFlagCheckbox
                      checked={required}
                      disabled={computed}
                      label="обяз."
                      title={
                        computed
                          ? "Вычисляемое поле заполняется автоматически"
                          : "Обязательное поле"
                      }
                      onCheckedChange={(checked) =>
                        setRequired(field.id, checked)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-6 shrink-0"
                      aria-label="Убрать поле"
                      onClick={() => removeField(field.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  {field.type === "relationGroups" ? (
                    <div className="flex flex-wrap items-center gap-1 border-t border-border/40 pt-1.5">
                      <span className="mr-0.5 text-[10px] text-muted-foreground">
                        Спросить
                      </span>
                      {automationRelationGroupsAskModes(
                        field.relationGroups?.levels.length ?? 2,
                      ).map((mode) => {
                        const active =
                          (fieldAskOptions[field.id]?.relationGroupsMode ??
                            "full") === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            title={automationRelationGroupsAskModeLabel(mode)}
                            onClick={() =>
                              setRelationGroupsMode(field.id, mode)
                            }
                          >
                            {automationRelationGroupsAskModeLabel(mode)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex flex-col gap-2">{body}</div>;
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs">
      {body}
    </div>
  );
}

function CreateRecordNestedEditor({
  nestedCreates,
  nestedOptions,
  parentLabel,
  sourceEntity,
  entities,
  onChange,
  onRemove,
}: {
  nestedCreates: AutomationCreateNestedSpec[];
  nestedOptions: Entity[];
  parentLabel: string;
  sourceEntity: Entity | null;
  entities: Entity[];
  onChange: (next: AutomationCreateNestedSpec[]) => void;
  onRemove?: () => void;
}) {
  const sourceLabel = sourceEntity
    ? getEntityDisplayName(sourceEntity)
    : "текущей записи";
  const usedIds = new Set(nestedCreates.map((item) => item.entityId));
  const freeOptions = nestedOptions.filter((entity) => !usedIds.has(entity.id));

  function updateAt(index: number, next: AutomationCreateNestedSpec) {
    const copy = [...nestedCreates];
    copy[index] = next;
    onChange(copy);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-none text-muted-foreground">
            Вложенные записи
          </p>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
            Несколько дочерних к «{parentLabel}» прямо в форме задачи
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
            disabled={nestedOptions.length === 0 || freeOptions.length === 0}
            onClick={() => {
              const entity = freeOptions[0] ?? null;
              if (!entity) return;
              onChange([
                ...nestedCreates,
                {
                  id: createAutomationNestedCreateId(),
                  entityId: entity.id,
                  askFieldIds: [],
                },
              ]);
            }}
          >
            <Plus className="size-3.5 shrink-0" />
            Тип
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Убрать вложенные"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      {nestedOptions.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Нет подсущностей или связанных вкладок у «{parentLabel}»
        </p>
      ) : nestedCreates.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Добавьте тип — исполнитель сможет создать несколько записей
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {nestedCreates.map((nested, index) => {
            const child =
              entities.find((entity) => entity.id === nested.entityId) ?? null;
            const childLabel = child
              ? getEntityDisplayName(child)
              : "вложенной";
            const slotOptions = nestedOptions.filter(
              (entity) =>
                entity.id === nested.entityId || !usedIds.has(entity.id),
            );
            return (
              <li
                key={nested.id}
                className="flex flex-col gap-2.5 border-t border-border/50 pt-2.5 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Тип
                  </span>
                  <div className="min-w-0 flex-1">
                    <Select
                      value={nested.entityId || undefined}
                      onValueChange={(next) => {
                        if (next == null) return;
                        updateAt(index, {
                          id: nested.id,
                          entityId: String(next),
                          askFieldIds: [],
                        });
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8">
                        <SelectValue>
                          {child ? getEntityDisplayName(child) : "Сущность"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {slotOptions.map((entity) => (
                          <SelectItem key={entity.id} value={entity.id}>
                            {getEntityDisplayName(entity)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Удалить тип"
                    onClick={() =>
                      onChange(nestedCreates.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {child ? (
                  <>
                    <CreateRecordAskFieldsEditor
                      embedded
                      title="Спросить у исполнителя"
                      fields={child.fields}
                      askFieldIds={nested.askFieldIds}
                      askRequiredFieldIds={nested.askRequiredFieldIds ?? []}
                      fieldAskOptions={nested.fieldAskOptions ?? {}}
                      onChange={(next) =>
                        updateAt(index, {
                          ...nested,
                          askFieldIds: next.askFieldIds,
                          askRequiredFieldIds:
                            next.askRequiredFieldIds.length > 0
                              ? next.askRequiredFieldIds
                              : undefined,
                          fieldAskOptions:
                            Object.keys(next.fieldAskOptions).length > 0
                              ? next.fieldAskOptions
                              : undefined,
                        })
                      }
                    />
                    <MappingsEditor
                      mappings={nested.mappings ?? []}
                      targetFields={child.fields}
                      targetEntityName={childLabel}
                      sourceFields={sourceEntity?.fields ?? []}
                      sourceEntityId={sourceEntity?.id}
                      sourceEntityName={sourceLabel}
                      entities={entities}
                      title="Автозаполнить"
                      onChange={(mappings) =>
                        updateAt(index, {
                          ...nested,
                          mappings: mappings.length > 0 ? mappings : undefined,
                        })
                      }
                    />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
    (field) =>
      !isEntityComputedFieldType(field.type) &&
      field.type !== "file" &&
      field.type !== "dependencies",
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-none text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground/80">
            «{sourceLabel}» → «{targetLabel}»
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
        <p className="text-[11px] leading-snug text-muted-foreground">
          Нет маппингов — «По именам» или добавьте поле
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mappings.map((mapping, index) => {
            const target =
              writable.find((field) => field.id === mapping.targetFieldId) ??
              null;
            return (
              <li
                key={`${mapping.targetFieldId}-${index}`}
                className="flex flex-col gap-1.5 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Куда
                  </span>
                  <div className="min-w-0 flex-1">
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
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Удалить маппинг"
                    onClick={() =>
                      onChange(mappings.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="mt-2 shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    Откуда
                  </span>
                  <ActionValueEditor
                    field={target}
                    value={mapping.source}
                    sourceFields={sourceFields}
                    sourceEntityId={sourceEntityId}
                    mapToOtherEntity
                    compact
                    className="min-w-0 flex-1"
                    entities={entities}
                    onChange={(source) => {
                      const next = [...mappings];
                      next[index] = { ...mapping, source };
                      onChange(next);
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
