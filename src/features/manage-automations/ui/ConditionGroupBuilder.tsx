import { useState } from "react";
import { Folder, Plus, X } from "lucide-react";
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
  AUTOMATION_CONDITION_OPERATOR_GROUPS,
  AUTOMATION_CONDITION_OPERATOR_LABELS,
  AUTOMATION_CONDITION_OPERATORS,
  createAutomationConditionId,
  emptyAutomationConditions,
  isAutomationFolderFileOperator,
  type AutomationConditionNode,
  type AutomationConditionOperator,
  type AutomationConditionRule,
  type AutomationConditions,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  getEntityFieldValueKind,
  getEntityRelationTargetId,
  getEntityTabFilesValueKey,
  getRelationRecordOptions,
  isEntityFilesTab,
  isEntityRelationLikeFieldType,
  parseEntityListValueIds,
  parseEntityRelationIds,
  ListSelect,
  RelationSelect,
  resolveEntityFieldSource,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityListValueIds,
  serializeEntityRelationIds,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityTab,
} from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

type ConditionSource =
  | { kind: "field"; field: EntityField }
  | { kind: "filesTab"; tab: EntityTab; valueKey: string };

type ConditionGroupBuilderProps = {
  entity: Entity | null;
  value: AutomationConditions;
  onChange: (value: AutomationConditions) => void;
  className?: string;
  /** Offer «Без условий» in the match select (empty rules = always match). */
  allowNone?: boolean;
};

function isRule(
  node: AutomationConditionNode,
): node is AutomationConditionRule {
  return node.kind === "rule";
}

function buildSources(entity: Entity | null): ConditionSource[] {
  if (!entity) return [];
  const fields = entity.fields
    .filter(
      (field) =>
        field.type !== "dependencies" &&
        field.type !== "relationGroups" &&
        field.type !== "period",
    )
    .map((field): ConditionSource => ({ kind: "field", field }));
  const filesTabs = entity.tabs
    .filter((tab) => isEntityFilesTab(tab))
    .map((tab): ConditionSource => ({
      kind: "filesTab",
      tab,
      valueKey: getEntityTabFilesValueKey(tab.id),
    }));
  return [...fields, ...filesTabs];
}

function sourceId(source: ConditionSource) {
  return source.kind === "field" ? source.field.id : source.valueKey;
}

function sourceLabel(source: ConditionSource) {
  if (source.kind === "field") {
    return getEntityFieldDisplayName(source.field);
  }
  return `Файлы · ${source.tab.name}`;
}

function findSource(
  sources: ConditionSource[],
  fieldId: string,
): ConditionSource | null {
  return sources.find((source) => sourceId(source) === fieldId) ?? null;
}

/** Default first: «равно» — pick one concrete record / person. */
const RELATION_LIST_OPERATORS: AutomationConditionOperator[] = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "includesAny",
  "includesAll",
  "empty",
  "notEmpty",
];

const BOOLEAN_OPERATORS: AutomationConditionOperator[] = [
  "true",
  "false",
  "empty",
  "notEmpty",
  "fieldChanged",
];

const NUMBER_OPERATORS: AutomationConditionOperator[] = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
  "empty",
  "notEmpty",
  "fieldChanged",
];

function operatorsForSource(
  source: ConditionSource | null,
  entity: Entity | null,
  entities: Entity[],
): AutomationConditionOperator[] {
  if (!source) return [...AUTOMATION_CONDITION_OPERATORS];
  if (source.kind === "filesTab") {
    return ["folderHasFiles", "folderEmpty"];
  }
  const type = source.field.type;
  if (type === "file") {
    return ["folderHasFiles", "folderEmpty"];
  }
  if (entity) {
    const kind = getEntityFieldValueKind(entity, source.field, entities);
    if (kind === "relation" || kind === "list") {
      return RELATION_LIST_OPERATORS;
    }
    if (kind === "boolean") {
      return BOOLEAN_OPERATORS;
    }
    if (kind === "number") {
      return NUMBER_OPERATORS;
    }
  } else if (type === "relation" || type === "belonging" || type === "list") {
    return RELATION_LIST_OPERATORS;
  } else if (type === "boolean") {
    return BOOLEAN_OPERATORS;
  } else if (type === "number" || type === "numberSum") {
    return NUMBER_OPERATORS;
  }
  return AUTOMATION_CONDITION_OPERATORS.filter(
    (operator) => !isAutomationFolderFileOperator(operator),
  );
}

function ruleSelectedIds(rule: AutomationConditionRule): string[] {
  if (rule.values && rule.values.length > 0) return rule.values;
  const single = rule.value?.trim();
  return single ? [single] : [];
}

function withSelectedIds(
  rule: AutomationConditionRule,
  ids: string[],
): AutomationConditionRule {
  const next: AutomationConditionRule = {
    kind: "rule",
    id: rule.id,
    fieldId: rule.fieldId,
    operator: rule.operator,
  };
  if (ids.length === 0) return next;
  if (rule.operator === "equals" || rule.operator === "notEquals") {
    next.value = ids[0];
    next.values = [ids[0]!];
    return next;
  }
  next.values = ids;
  next.value = ids[0];
  return next;
}

function usesIdPicker(operator: AutomationConditionOperator) {
  return (
    operator === "in" ||
    operator === "notIn" ||
    operator === "includesAny" ||
    operator === "includesAll" ||
    operator === "equals" ||
    operator === "notEquals"
  );
}

/** «равно» / «не равно» — one concrete id (person, record, list option). */
function isSingleIdOperator(operator: AutomationConditionOperator) {
  return operator === "equals" || operator === "notEquals";
}

function folderOptions(source: ConditionSource | null): string[] {
  if (!source || source.kind !== "filesTab") return [];
  return source.tab.defaultFolders.map((folder) => folder.name);
}

export function ConditionGroupBuilder({
  entity,
  value,
  onChange,
  className,
  allowNone = false,
}: ConditionGroupBuilderProps) {
  const { entities } = useEntityConfig();
  const sources = buildSources(entity);
  const [noneMode, setNoneMode] = useState(
    () => allowNone && value.rules.length === 0,
  );
  const noneSelected = allowNone && noneMode && value.rules.length === 0;
  const matchSelectValue = noneSelected ? "none" : value.match;

  function updateRules(rules: AutomationConditionNode[]) {
    if (rules.length > 0) setNoneMode(false);
    onChange({ ...value, rules });
  }

  function addRule() {
    setNoneMode(false);
    const source = sources[0] ?? null;
    const fieldId = source ? sourceId(source) : "";
    const operators = operatorsForSource(source, entity, entities);
    const operator = operators[0] ?? "notEmpty";
    const folder = folderOptions(source)[0];
    updateRules([
      ...value.rules,
      {
        kind: "rule",
        id: createAutomationConditionId(),
        fieldId,
        operator,
        ...(isAutomationFolderFileOperator(operator) && folder
          ? { value: folder }
          : {}),
      },
    ]);
  }

  function addGroup() {
    updateRules([
      ...value.rules,
      {
        kind: "group",
        id: createAutomationConditionId(),
        match: "any",
        rules: [],
      },
    ]);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Совпадение</span>
        <Select
          value={matchSelectValue}
          onValueChange={(next) => {
            if (next === "none" && allowNone) {
              setNoneMode(true);
              onChange(emptyAutomationConditions(value.match));
              return;
            }
            if (next === "all" || next === "any") {
              setNoneMode(false);
              onChange({ ...value, match: next });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue>
              {noneSelected
                ? "Без условий"
                : value.match === "any"
                  ? "Любое условие"
                  : "Все условия"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowNone ? (
              <SelectItem value="none">Без условий</SelectItem>
            ) : null}
            <SelectItem value="all">Все условия</SelectItem>
            <SelectItem value="any">Любое условие</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {noneSelected ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Условия не проверяются — переход всегда идёт в «Тогда».
        </p>
      ) : null}

      {value.rules.map((node, index) => {
        if (isRule(node)) {
          return (
            <RuleRow
              key={node.id}
              rule={node}
              entity={entity}
              sources={sources}
              entities={entities}
              onChange={(rule) => {
                const rules = [...value.rules];
                rules[index] = rule;
                updateRules(rules);
              }}
              onRemove={() =>
                updateRules(value.rules.filter((_, i) => i !== index))
              }
            />
          );
        }
        return (
          <div
            key={node.id}
            className="rounded-md border border-dashed border-border/80 p-2"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Select
                value={node.match}
                onValueChange={(next) => {
                  if (next !== "all" && next !== "any") return;
                  const rules = [...value.rules];
                  rules[index] = { ...node, match: next };
                  updateRules(rules);
                }}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue>
                    {node.match === "any" ? "Группа: любое" : "Группа: все"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Группа: все</SelectItem>
                  <SelectItem value="any">Группа: любое</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Удалить группу"
                onClick={() =>
                  updateRules(value.rules.filter((_, i) => i !== index))
                }
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <ConditionGroupBuilder
              entity={entity}
              value={{
                version: 1,
                match: node.match,
                rules: node.rules,
              }}
              onChange={(next) => {
                const rules = [...value.rules];
                rules[index] = {
                  ...node,
                  match: next.match,
                  rules: next.rules.filter(isRule),
                };
                updateRules(rules);
              }}
            />
          </div>
        );
      })}

      {noneSelected ? null : (
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={sources.length === 0}
            onClick={addRule}
          >
            <Plus className="size-3.5" />
            Условие
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={addGroup}
          >
            <Plus className="size-3.5" />
            Группа
          </Button>
          {value.rules.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                if (allowNone) setNoneMode(true);
                onChange(emptyAutomationConditions(value.match));
              }}
            >
              Очистить
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ConditionValueControl({
  rule,
  entity,
  source,
  entities,
  onChange,
}: {
  rule: AutomationConditionRule;
  entity: Entity | null;
  source: ConditionSource | null;
  entities: Entity[];
  onChange: (rule: AutomationConditionRule) => void;
}) {
  const isFolderOp = isAutomationFolderFileOperator(rule.operator);
  const folders = folderOptions(source);
  const selectedIds = ruleSelectedIds(rule);
  const single = isSingleIdOperator(rule.operator);

  if (isFolderOp) {
    return (
      <div className="flex flex-col gap-1">
        {folders.length > 0 ? (
          <Select
            value={rule.value || undefined}
            onValueChange={(next) => {
              if (next != null) onChange({ ...rule, value: String(next) });
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>
                <span className="inline-flex items-center gap-1.5">
                  <Folder
                    className="size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  {rule.value?.trim() || "Папка"}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {folders.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="h-8"
            value={rule.value ?? ""}
            placeholder="Название папки"
            onChange={(event) =>
              onChange({ ...rule, value: event.target.value })
            }
          />
        )}
        <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
          Проверяются файлы прямо в этой папке (не во вложенных)
        </p>
      </div>
    );
  }

  if (source?.kind === "field" && usesIdPicker(rule.operator)) {
    const resolvedField =
      entity != null
        ? (resolveEntityFieldSource(entity, source.field, entities)?.field ??
          null)
        : isEntityRelationLikeFieldType(source.field.type) ||
            source.field.type === "list"
          ? source.field
          : null;

    if (resolvedField && isEntityRelationLikeFieldType(resolvedField.type)) {
      const targetId = getEntityRelationTargetId(resolvedField);
      const target = entities.find((item) => item.id === targetId) ?? null;
      const valueIds = single ? selectedIds.slice(0, 1) : selectedIds;
      return (
        <RelationSelect
          multiple={!single}
          options={getRelationRecordOptions(target)}
          value={serializeEntityRelationIds(valueIds)}
          placeholder={single ? "Выберите запись" : "Выберите записи"}
          aria-label="Значение условия"
          className="h-8"
          onChange={(next) => {
            const ids = parseEntityRelationIds(next);
            onChange(
              withSelectedIds(rule, single ? ids.slice(0, 1) : ids),
            );
          }}
        />
      );
    }

    if (resolvedField?.type === "list") {
      const options = resolveEntityListFieldOptions(resolvedField, entities);
      const presentation = resolveEntityListFieldPresentation(
        resolvedField,
        entities,
      );
      const valueIds = single ? selectedIds.slice(0, 1) : selectedIds;
      return (
        <ListSelect
          multiple={!single}
          options={options}
          value={serializeEntityListValueIds(valueIds)}
          showColors={presentation.listUseColors}
          emptyLabel={single ? "Выберите вариант" : "Выберите варианты"}
          aria-label="Значение условия"
          className="h-8"
          onChange={(next) => {
            const ids = parseEntityListValueIds(next);
            onChange(
              withSelectedIds(rule, single ? ids.slice(0, 1) : ids),
            );
          }}
        />
      );
    }
  }

  return (
    <Input
      className="h-8"
      value={rule.value ?? ""}
      placeholder={
        rule.operator === "fieldTransition"
          ? '{"from":"…","to":"…"}'
          : "Значение"
      }
      onChange={(event) => onChange({ ...rule, value: event.target.value })}
    />
  );
}

function RuleRow({
  rule,
  entity,
  sources,
  entities,
  onChange,
  onRemove,
}: {
  rule: AutomationConditionRule;
  entity: Entity | null;
  sources: ConditionSource[];
  entities: Entity[];
  onChange: (rule: AutomationConditionRule) => void;
  onRemove: () => void;
}) {
  const source = findSource(sources, rule.fieldId);
  const operators = operatorsForSource(source, entity, entities);
  const needsValue = ![
    "empty",
    "notEmpty",
    "true",
    "false",
    "fieldChanged",
  ].includes(rule.operator);

  function selectSource(nextId: string) {
    const next = findSource(sources, nextId);
    const nextOperators = operatorsForSource(next, entity, entities);
    const nextOperator = nextOperators.includes(rule.operator)
      ? rule.operator
      : (nextOperators[0] ?? "notEmpty");
    const nextFolders = folderOptions(next);
    if (isAutomationFolderFileOperator(nextOperator)) {
      onChange({
        kind: "rule",
        id: rule.id,
        fieldId: nextId,
        operator: nextOperator,
        value:
          (nextFolders.includes(rule.value ?? "")
            ? rule.value
            : nextFolders[0]) || "",
      });
      return;
    }
    const keepIds =
      next?.kind === "field" &&
      entity != null &&
      usesIdPicker(nextOperator) &&
      (() => {
        const kind = getEntityFieldValueKind(entity, next.field, entities);
        return kind === "relation" || kind === "list";
      })()
        ? ruleSelectedIds(rule)
        : [];
    onChange(
      withSelectedIds(
        {
          kind: "rule",
          id: rule.id,
          fieldId: nextId,
          operator: nextOperator,
        },
        keepIds,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-background p-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={rule.fieldId || undefined}
          onValueChange={(next) => {
            if (next != null) selectSource(String(next));
          }}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue>
              {source ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {source.kind === "filesTab" ? (
                    <Folder
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <span className="truncate">{sourceLabel(source)}</span>
                </span>
              ) : (
                "Поле"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sources.map((item) => (
              <SelectItem key={sourceId(item)} value={sourceId(item)}>
                <span className="inline-flex items-center gap-1.5">
                  {item.kind === "filesTab" ? (
                    <Folder className="size-3.5 text-muted-foreground" />
                  ) : null}
                  {sourceLabel(item)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={rule.operator}
          onValueChange={(next) => {
            if (
              next != null &&
              (AUTOMATION_CONDITION_OPERATORS as readonly string[]).includes(
                String(next),
              )
            ) {
              const operator = String(next) as AutomationConditionOperator;
              const nextFolders = folderOptions(source);
              if (isAutomationFolderFileOperator(operator)) {
                onChange({
                  kind: "rule",
                  id: rule.id,
                  fieldId: rule.fieldId,
                  operator,
                  value:
                    (nextFolders.includes(rule.value ?? "")
                      ? rule.value
                      : nextFolders[0]) ||
                    rule.value ||
                    "",
                });
                return;
              }
              onChange(
                withSelectedIds(
                  {
                    kind: "rule",
                    id: rule.id,
                    fieldId: rule.fieldId,
                    operator,
                  },
                  ruleSelectedIds(rule),
                ),
              );
            }
          }}
        >
          <SelectTrigger size="sm" className="w-[11rem] shrink-0">
            <SelectValue>
              {AUTOMATION_CONDITION_OPERATOR_LABELS[rule.operator]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectOptionGroups
              groups={AUTOMATION_CONDITION_OPERATOR_GROUPS}
              available={operators}
              getLabel={(operator) =>
                AUTOMATION_CONDITION_OPERATOR_LABELS[operator]
              }
            />
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0"
          aria-label="Удалить"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {needsValue ? (
        <ConditionValueControl
          rule={rule}
          entity={entity}
          source={source}
          entities={entities}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}
