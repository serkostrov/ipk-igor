import { GitBranch, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  AUTOMATION_ASSIGNEE_SOURCE_LABELS,
  AUTOMATION_ASSIGNEE_SOURCE_ORDER,
  AUTOMATION_ASSIGNEE_TYPE_HINTS,
  AUTOMATION_RECIPIENT_TYPE_HINTS,
  AUTOMATION_WATCHER_TYPE_HINTS,
  assigneeSourceKind,
  createAutomationAssigneeBranchId,
  defaultAssigneeLeafResolver,
  defaultConditionalAssigneeResolver,
  relatedFieldRelationPath,
  type AutomationAssigneeBranch,
  type AutomationAssigneeEditorMode,
  type AutomationAssigneeLeafResolver,
  type AutomationAssigneeResolver,
  type AutomationAssigneeSourceKind,
} from "../model/assignee";
import {
  emptyAutomationConditions,
  type AutomationConditions,
} from "../model/conditions";
import { useRoles } from "@/entities/access";
import {
  getEntityRelationTargetId,
  getRelationRecordOptions,
  getSystemUsersEntity,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  useEntityConfig,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { RelationSelect } from "@/entities/entity/ui/RelationSelect";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  bridgeRelationFields,
  pathFromAssigneeSelection,
  userRelationFields,
  type UserFieldPath,
} from "../lib/user-field-path";
import { UserFieldPathPicker } from "./UserFieldPathPicker";

function firstUserRelationFieldId(fields: EntityField[]) {
  return userRelationFields(fields)[0]?.id ?? "";
}

function relationTargetEntity(
  field: EntityField | null | undefined,
  entities: Entity[],
): Entity | null {
  const targetId = field ? getEntityRelationTargetId(field) : null;
  if (!targetId) return null;
  return entities.find((item) => item.id === targetId) ?? null;
}

function firstRelatedDefault(
  fields: EntityField[],
  entities: Entity[],
): Extract<AutomationAssigneeLeafResolver, { type: "relatedField" }> | null {
  const bridges = bridgeRelationFields(fields);
  for (const bridge of bridges) {
    const target = relationTargetEntity(bridge, entities);
    const nested = firstUserRelationFieldId(target?.fields ?? []);
    if (nested) {
      return {
        type: "relatedField",
        relationFieldId: bridge.id,
        fieldId: nested,
      };
    }
  }
  return null;
}

function defaultFromFieldResolver(
  fields: EntityField[],
  entities: Entity[],
  preferFanOut = false,
): AutomationAssigneeLeafResolver {
  const direct = firstUserRelationFieldId(fields);
  if (direct) {
    return preferFanOut
      ? { type: "relationFieldFanOut", fieldId: direct }
      : { type: "field", fieldId: direct };
  }
  return firstRelatedDefault(fields, entities) ?? { type: "currentUser" };
}

function hintsForMode(mode: AutomationAssigneeEditorMode) {
  if (mode === "watcher") return AUTOMATION_WATCHER_TYPE_HINTS;
  if (mode === "recipient") return AUTOMATION_RECIPIENT_TYPE_HINTS;
  return AUTOMATION_ASSIGNEE_TYPE_HINTS;
}

function fanOutLabels(mode: AutomationAssigneeEditorMode) {
  if (mode === "assignee") {
    return {
      one: "Только первому",
      oneHint: "Одна задача — первому из поля",
      each: "Каждому из поля",
      eachHint: "Отдельная задача на каждого",
    };
  }
  if (mode === "watcher") {
    return {
      one: "Только первому",
      oneHint: "Один наблюдатель — первый из поля",
      each: "Каждому из поля",
      eachHint: "Наблюдатель — каждый из списка",
    };
  }
  return {
    one: "Только первому",
    oneHint: "Одно уведомление — первому из поля",
    each: "Каждому из поля",
    eachHint: "Уведомление каждому из списка",
  };
}

function asLeaf(
  value: AutomationAssigneeResolver,
): AutomationAssigneeLeafResolver {
  if (value.type === "conditional") return value.elseResolver;
  return value;
}

function pathToResolver(
  path: UserFieldPath,
  preferFanOut: boolean,
): AutomationAssigneeLeafResolver {
  if (path.kind === "direct") {
    return preferFanOut
      ? { type: "relationFieldFanOut", fieldId: path.fieldId }
      : { type: "field", fieldId: path.fieldId };
  }
  const [relationFieldId, ...via] = path.relationPath;
  if (!relationFieldId) {
    return preferFanOut
      ? { type: "relationFieldFanOut", fieldId: path.fieldId }
      : { type: "field", fieldId: path.fieldId };
  }
  return via.length > 0
    ? {
        type: "relatedField",
        relationFieldId,
        via,
        fieldId: path.fieldId,
      }
    : {
        type: "relatedField",
        relationFieldId,
        fieldId: path.fieldId,
      };
}

type ConditionsSlot = (args: {
  value: AutomationConditions;
  onChange: (next: AutomationConditions) => void;
}) => ReactNode;

type LeafEditorProps = {
  value: AutomationAssigneeLeafResolver;
  fields: Entity["fields"];
  entities: Entity[];
  onChange: (value: AutomationAssigneeLeafResolver) => void;
  compact?: boolean;
  mode: AutomationAssigneeEditorMode;
  /** When true, parent already shows the source select. */
  hideSourceSelect?: boolean;
  /** Root entity for field path labels (optional; inferred from fields). */
  rootEntity?: Entity | null;
};

function LeafAssigneeEditor({
  value,
  fields,
  entities,
  onChange,
  compact,
  mode,
  hideSourceSelect,
  rootEntity: rootEntityProp,
}: LeafEditorProps) {
  const roles = useRoles();
  const usersEntity = getSystemUsersEntity(entities);
  const userOptions = getRelationRecordOptions(usersEntity);
  const userFields = userRelationFields(fields);
  const bridgeFields = bridgeRelationFields(fields);
  const source = assigneeSourceKind(value);
  const sourceLabels = AUTOMATION_ASSIGNEE_SOURCE_LABELS[mode];
  const hints = hintsForMode(mode);
  const fanOut = fanOutLabels(mode);

  const rootEntity =
    rootEntityProp ??
    entities.find(
      (entity) =>
        fields.length > 0 &&
        fields.every((field) =>
          entity.fields.some((item) => item.id === field.id),
        ),
    ) ??
    (fields.length > 0
      ? {
          id: "__assignee-root",
          name: "Запись",
          namePlural: "Записи",
          fields,
        }
      : null);

  const pathValue =
    value.type === "field" || value.type === "relationFieldFanOut"
      ? pathFromAssigneeSelection({
          type: value.type,
          fieldId: value.fieldId,
        })
      : value.type === "relatedField"
        ? pathFromAssigneeSelection({
            type: "relatedField",
            fieldId: value.fieldId,
            relationFieldId: value.relationFieldId,
            via: relatedFieldRelationPath(value).slice(1),
          })
        : null;

  const canPickFromField = userFields.length > 0 || bridgeFields.length > 0;
  const showFanOut =
    value.type === "field" || value.type === "relationFieldFanOut";

  const sourceOptions = AUTOMATION_ASSIGNEE_SOURCE_ORDER.filter((kind) => {
    if (kind === "conditional") return false;
    if (kind === "none") return mode === "watcher" || mode === "recipient";
    return true;
  });

  function setSource(kind: AutomationAssigneeSourceKind) {
    if (kind === "none") {
      onChange({ type: "none" });
      return;
    }
    if (kind === "fromField" || kind === "fromRelated") {
      if (
        value.type === "field" ||
        value.type === "relationFieldFanOut" ||
        value.type === "relatedField"
      ) {
        return;
      }
      onChange(defaultFromFieldResolver(fields, entities));
      return;
    }
    if (kind === "fixedUsers") {
      onChange({
        type: "fixedUsers",
        userIds: value.type === "fixedUsers" ? value.userIds : [],
      });
      return;
    }
    if (kind === "role") {
      onChange({
        type: "role",
        roleId: value.type === "role" ? value.roleId : (roles[0]?.id ?? ""),
      });
      return;
    }
    if (kind === "recordCreator") {
      onChange({ type: "recordCreator" });
      return;
    }
    onChange({ type: "currentUser" });
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      {!hideSourceSelect ? (
        <div className="flex flex-col gap-1.5">
          {!compact ? (
            <Label className="text-xs font-medium text-foreground">
              Способ
            </Label>
          ) : null}
          <Select
            value={source === "conditional" ? "fromField" : source}
            onValueChange={(next) => {
              if (next == null) return;
              setSource(String(next) as AutomationAssigneeSourceKind);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {sourceLabels[source === "conditional" ? "fromField" : source]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {sourceLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!compact ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {hints[value.type]}
            </p>
          ) : null}
        </div>
      ) : null}

      {source === "fromField" ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-muted/15 p-2.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">Кто</Label>
            {!canPickFromField ? (
              <p className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Нет полей с пользователями и связей с другими сущностями.
                Добавьте поле «Связь» (Менеджер, ГИП…) или связь с Лид / РКО в
                настройках сущности.
              </p>
            ) : (
              <UserFieldPathPicker
                rootEntity={rootEntity}
                entities={entities}
                value={pathValue}
                placeholder="Поле или связь → поле"
                onChange={(next) =>
                  onChange(
                    pathToResolver(next, value.type === "relationFieldFanOut"),
                  )
                }
              />
            )}
            {canPickFromField && !compact ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Поле на этой записи или через связанные / вложенные (Лид →
                Менеджер, РКО → ГИП…).
              </p>
            ) : null}
          </div>

          {showFanOut && userFields.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">
                Если в поле несколько человек
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors",
                    value.type === "field"
                      ? "border-primary/40 bg-background ring-1 ring-primary/25"
                      : "border-border/70 bg-background/60 hover:bg-background",
                  )}
                  onClick={() =>
                    onChange({
                      type: "field",
                      fieldId:
                        value.type === "field" ||
                        value.type === "relationFieldFanOut"
                          ? value.fieldId
                          : firstUserRelationFieldId(fields),
                    })
                  }
                >
                  <span className="block text-xs font-medium">
                    {fanOut.one}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    {fanOut.oneHint}
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors",
                    value.type === "relationFieldFanOut"
                      ? "border-primary/40 bg-background ring-1 ring-primary/25"
                      : "border-border/70 bg-background/60 hover:bg-background",
                  )}
                  onClick={() =>
                    onChange({
                      type: "relationFieldFanOut",
                      fieldId:
                        value.type === "field" ||
                        value.type === "relationFieldFanOut"
                          ? value.fieldId
                          : firstUserRelationFieldId(fields),
                    })
                  }
                >
                  <span className="block text-xs font-medium">
                    {fanOut.each}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    {fanOut.eachHint}
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {value.type === "role" ? (
        <div className="flex flex-col gap-1.5">
          {!compact ? (
            <Label className="text-xs font-medium text-foreground">Роль</Label>
          ) : null}
          <Select
            value={value.roleId || undefined}
            onValueChange={(next) => {
              if (next != null)
                onChange({ type: "role", roleId: String(next) });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите роль">
                {roles.find((role) => role.id === value.roleId)?.name ??
                  "Выберите роль"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {roles.length === 0 ? (
                <SelectItem value="__none" disabled>
                  Нет ролей
                </SelectItem>
              ) : (
                roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {value.type === "fixedUsers" ? (
        <div className="flex flex-col gap-1.5">
          {!compact ? (
            <Label className="text-xs font-medium text-foreground">
              Пользователи
            </Label>
          ) : null}
          <RelationSelect
            options={userOptions}
            value={serializeEntityRelationIds(value.userIds)}
            multiple
            placeholder="Выберите пользователей"
            aria-label="Пользователи"
            onChange={(next) =>
              onChange({
                type: "fixedUsers",
                userIds: parseEntityRelationIds(next),
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function ConditionalAssigneeEditor({
  value,
  fields,
  entities,
  onChange,
  mode,
  renderConditions,
  rootEntity,
}: {
  value: Extract<AutomationAssigneeResolver, { type: "conditional" }>;
  fields: Entity["fields"];
  entities: Entity[];
  onChange: (value: AutomationAssigneeResolver) => void;
  mode: AutomationAssigneeEditorMode;
  renderConditions?: ConditionsSlot;
  rootEntity?: Entity | null;
}) {
  const branches = value.branches;

  function commit(
    next: Extract<AutomationAssigneeResolver, { type: "conditional" }>,
  ) {
    onChange(next);
  }

  function patchBranch(
    index: number,
    patch: Partial<AutomationAssigneeBranch>,
  ) {
    commit({
      ...value,
      branches: branches.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function addBranch() {
    commit({
      ...value,
      branches: [
        ...branches,
        {
          id: createAutomationAssigneeBranchId(),
          label: "Если",
          conditions: emptyAutomationConditions(),
          resolver: defaultAssigneeLeafResolver(),
        },
      ],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs">
          <GitBranch className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Назначение по условию
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Проверяются сверху вниз. Например: отдел РКО → из связанной записи
            РКО; отдел ЛИНК → из поля «рук ЛИНК». Последняя ветка — «иначе».
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {branches.map((branch, index) => {
          const hasRules = branch.conditions.rules.length > 0;
          return (
            <li
              key={branch.id}
              className="rounded-xl border border-border/70 bg-card p-3 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-primary/10 px-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
                    Если {index + 1}
                  </span>
                  <Input
                    value={branch.label === "Если" ? "" : branch.label}
                    placeholder="Название, напр. РКО"
                    className="h-7 max-w-[11rem] text-xs"
                    onChange={(event) =>
                      patchBranch(index, {
                        label: event.target.value.trim() || "Если",
                      })
                    }
                  />
                </div>
                {branches.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Удалить ветку"
                    onClick={() =>
                      commit({
                        ...value,
                        branches: branches.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <Label className="text-xs">Условие на записи</Label>
                {renderConditions ? (
                  renderConditions({
                    value: branch.conditions,
                    onChange: (conditions) =>
                      patchBranch(index, { conditions }),
                  })
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Редактор условий недоступен в этом контексте.
                  </p>
                )}
                {!hasRules ? (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    Добавьте условие (например отдел = РКО) — иначе ветка
                    сработает всегда
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <Label className="text-xs">Кого назначить</Label>
                <LeafAssigneeEditor
                  compact
                  mode={mode}
                  value={branch.resolver}
                  fields={fields}
                  entities={entities}
                  rootEntity={rootEntity}
                  onChange={(resolver) => patchBranch(index, { resolver })}
                />
              </div>
            </li>
          );
        })}

        <li className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
          <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Иначе
          </span>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Если ни одна ветка выше не подошла
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label className="text-xs">Кого назначить</Label>
            <LeafAssigneeEditor
              compact
              mode={mode}
              value={value.elseResolver}
              fields={fields}
              entities={entities}
              rootEntity={rootEntity}
              onChange={(elseResolver) => commit({ ...value, elseResolver })}
            />
          </div>
        </li>
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 self-start"
        onClick={addBranch}
      >
        <Plus className="size-3.5" />
        Условие
      </Button>
    </div>
  );
}

export function AssigneeEditor({
  value,
  fields,
  onChange,
  compact,
  mode = "assignee",
  entities: entitiesProp,
  allowConditional = true,
  renderConditions,
  entityId,
}: {
  value: AutomationAssigneeResolver;
  fields: Entity["fields"];
  onChange: (value: AutomationAssigneeResolver) => void;
  compact?: boolean;
  mode?: AutomationAssigneeEditorMode;
  entities?: Entity[];
  allowConditional?: boolean;
  /** Slot for condition builder (kept out of entity layer for FSD). */
  renderConditions?: ConditionsSlot;
  /** Prefer this entity as the path-picker root when provided. */
  entityId?: string;
}) {
  const { entities: storeEntities } = useEntityConfig();
  const entities = entitiesProp ?? storeEntities;
  const rootEntity =
    (entityId ? entities.find((entity) => entity.id === entityId) : null) ??
    entities.find(
      (entity) =>
        fields.length > 0 &&
        fields.every((field) =>
          entity.fields.some((item) => item.id === field.id),
        ),
    ) ??
    null;
  const source = assigneeSourceKind(value);
  const sourceLabels = AUTOMATION_ASSIGNEE_SOURCE_LABELS[mode];
  const sourceOptions = AUTOMATION_ASSIGNEE_SOURCE_ORDER.filter((kind) => {
    if (kind === "conditional") return Boolean(allowConditional);
    if (kind === "none") return mode === "watcher" || mode === "recipient";
    return true;
  });

  function applySource(kind: AutomationAssigneeSourceKind) {
    if (kind === "none") {
      onChange({ type: "none" });
      return;
    }
    if (kind === "conditional") {
      onChange(defaultConditionalAssigneeResolver());
      return;
    }
    const leaf = asLeaf(value);
    if (kind === "fromField" || kind === "fromRelated") {
      if (
        leaf.type === "field" ||
        leaf.type === "relationFieldFanOut" ||
        leaf.type === "relatedField"
      ) {
        onChange(leaf);
        return;
      }
      onChange(defaultFromFieldResolver(fields, entities));
      return;
    }
    if (kind === "fixedUsers") {
      onChange({
        type: "fixedUsers",
        userIds: leaf.type === "fixedUsers" ? leaf.userIds : [],
      });
      return;
    }
    if (kind === "role") {
      onChange({
        type: "role",
        roleId: leaf.type === "role" ? leaf.roleId : "",
      });
      return;
    }
    if (kind === "recordCreator") {
      onChange({ type: "recordCreator" });
      return;
    }
    onChange({ type: "currentUser" });
  }

  if (value.type === "conditional") {
    return (
      <div className="flex flex-col gap-3">
        {!compact ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              Способ
            </Label>
            <Select
              value="conditional"
              onValueChange={(next) => {
                if (next == null || next === "conditional") return;
                applySource(String(next) as AutomationAssigneeSourceKind);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{sourceLabels.conditional}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {sourceLabels[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <ConditionalAssigneeEditor
          value={value}
          fields={fields}
          entities={entities}
          mode={mode}
          rootEntity={rootEntity}
          onChange={onChange}
          renderConditions={renderConditions}
        />
      </div>
    );
  }

  const showTopSource = allowConditional && !compact;

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      {showTopSource ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-foreground">Способ</Label>
          <Select
            value={source}
            onValueChange={(next) => {
              if (next == null) return;
              applySource(String(next) as AutomationAssigneeSourceKind);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{sourceLabels[source]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {sourceLabels[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hintsForMode(mode)[value.type]}
          </p>
        </div>
      ) : null}

      <LeafAssigneeEditor
        compact={compact}
        hideSourceSelect={showTopSource}
        mode={mode}
        value={value}
        fields={fields}
        entities={entities}
        rootEntity={rootEntity}
        onChange={onChange}
      />
    </div>
  );
}
