import { Plus, X } from "lucide-react";
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
  type AutomationConditionNode,
  type AutomationConditionOperator,
  type AutomationConditionRule,
  type AutomationConditions,
} from "@/entities/automation";
import { getEntityFieldDisplayName, type Entity } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";

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

export function ConditionGroupBuilder({
  entity,
  value,
  onChange,
  className,
}: ConditionGroupBuilderProps) {
  const fields =
    entity?.fields.filter(
      (field) => field.type !== "file" && field.type !== "dependencies",
    ) ?? [];

  function updateRules(rules: AutomationConditionNode[]) {
    onChange({ ...value, rules });
  }

  function addRule() {
    const fieldId = fields[0]?.id ?? "";
    updateRules([
      ...value.rules,
      {
        kind: "rule",
        id: createAutomationConditionId(),
        fieldId,
        operator: "notEmpty",
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
              fields={fields}
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
          disabled={fields.length === 0}
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
  fields,
  onChange,
  onRemove,
}: {
  rule: AutomationConditionRule;
  fields: Entity["fields"];
  onChange: (rule: AutomationConditionRule) => void;
  onRemove: () => void;
}) {
  const needsValue = ![
    "empty",
    "notEmpty",
    "true",
    "false",
    "fieldChanged",
  ].includes(rule.operator);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-background p-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={rule.fieldId}
          onValueChange={(next) => {
            if (next != null) onChange({ ...rule, fieldId: String(next) });
          }}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue>
              {fields.find((field) => field.id === rule.fieldId)
                ? getEntityFieldDisplayName(
                    fields.find((field) => field.id === rule.fieldId)!,
                  )
                : "Поле"}
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
        <Select
          value={rule.operator}
          onValueChange={(next) => {
            if (
              next != null &&
              (AUTOMATION_CONDITION_OPERATORS as readonly string[]).includes(
                String(next),
              )
            ) {
              onChange({
                ...rule,
                operator: String(next) as AutomationConditionOperator,
              });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-[9.5rem] shrink-0">
            <SelectValue>
              {AUTOMATION_CONDITION_OPERATOR_LABELS[rule.operator]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AUTOMATION_CONDITION_OPERATORS.map((operator) => (
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
      ) : null}
    </div>
  );
}
