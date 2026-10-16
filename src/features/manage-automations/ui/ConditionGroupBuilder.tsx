import { Folder, Plus, X } from "lucide-react";
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
  getEntityTabFilesValueKey,
  isEntityFilesTab,
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
};

function isRule(
  node: AutomationConditionNode,
): node is AutomationConditionRule {
  return node.kind === "rule";
}

function buildSources(entity: Entity | null): ConditionSource[] {
  if (!entity) return [];
  const fields = entity.fields
    .filter((field) => field.type !== "dependencies")
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

function operatorsForSource(
  source: ConditionSource | null,
): AutomationConditionOperator[] {
  if (!source) return [...AUTOMATION_CONDITION_OPERATORS];
  if (source.kind === "filesTab") {
    return ["folderHasFiles", "folderEmpty"];
  }
  if (source.field.type === "file") {
    return ["folderHasFiles", "folderEmpty"];
  }
  return AUTOMATION_CONDITION_OPERATORS.filter(
    (operator) => !isAutomationFolderFileOperator(operator),
  );
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
}: ConditionGroupBuilderProps) {
  const sources = buildSources(entity);

  function updateRules(rules: AutomationConditionNode[]) {
    onChange({ ...value, rules });
  }

  function addRule() {
    const source = sources[0] ?? null;
    const fieldId = source ? sourceId(source) : "";
    const operators = operatorsForSource(source);
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
          value={value.match}
          onValueChange={(next) => {
            if (next === "all" || next === "any") {
              onChange({ ...value, match: next });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue>
              {value.match === "any" ? "Любое условие" : "Все условия"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все условия</SelectItem>
            <SelectItem value="any">Любое условие</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.rules.map((node, index) => {
        if (isRule(node)) {
          return (
            <RuleRow
              key={node.id}
              rule={node}
              sources={sources}
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
            onClick={() => onChange(emptyAutomationConditions(value.match))}
          >
            Очистить
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  sources,
  onChange,
  onRemove,
}: {
  rule: AutomationConditionRule;
  sources: ConditionSource[];
  onChange: (rule: AutomationConditionRule) => void;
  onRemove: () => void;
}) {
  const source = findSource(sources, rule.fieldId);
  const operators = operatorsForSource(source);
  const isFolderOp = isAutomationFolderFileOperator(rule.operator);
  const folders = folderOptions(source);
  const needsValue = ![
    "empty",
    "notEmpty",
    "true",
    "false",
    "fieldChanged",
  ].includes(rule.operator);

  function selectSource(nextId: string) {
    const next = findSource(sources, nextId);
    const nextOperators = operatorsForSource(next);
    const nextOperator = nextOperators.includes(rule.operator)
      ? rule.operator
      : (nextOperators[0] ?? "notEmpty");
    const nextFolders = folderOptions(next);
    const nextValue = isAutomationFolderFileOperator(nextOperator)
      ? (nextFolders.includes(rule.value ?? "")
          ? rule.value
          : nextFolders[0]) || ""
      : rule.value;
    onChange({
      ...rule,
      fieldId: nextId,
      operator: nextOperator,
      value: nextValue,
    });
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
              onChange({
                ...rule,
                operator,
                value: isAutomationFolderFileOperator(operator)
                  ? (nextFolders.includes(rule.value ?? "")
                      ? rule.value
                      : nextFolders[0]) ||
                    rule.value ||
                    ""
                  : rule.value,
              });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-[11rem] shrink-0">
            <SelectValue>
              {AUTOMATION_CONDITION_OPERATOR_LABELS[rule.operator]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {AUTOMATION_CONDITION_OPERATOR_LABELS[operator]}
              </SelectItem>
            ))}
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
        isFolderOp ? (
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
        ) : (
          <Input
            className="h-8"
            value={rule.value ?? ""}
            placeholder={
              rule.operator === "fieldTransition"
                ? '{"from":"…","to":"…"}'
                : "Значение"
            }
            onChange={(event) =>
              onChange({ ...rule, value: event.target.value })
            }
          />
        )
      ) : null}
    </div>
  );
}
