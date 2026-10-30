import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectOptionGroups,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  createEntityConditionId,
  ENTITY_CONDITION_OPERATOR_GROUPS,
  ENTITY_CONDITION_OPERATOR_LABELS,
  ENTITY_VALUE_KIND_LABELS,
  entityConditionNeedsValue,
  getEntityConditionOperators,
  type EntityCondition,
  type EntityConditionOperator,
  type EntityValueKind,
} from "../model/condition";
import {
  ENTITY_LIST_OTHER_OPTION_ID,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  normalizeEntityDecimalInput,
} from "../model/field";
import {
  getEntityFieldValueKind,
  resolveEntityFieldSource,
} from "../model/field-value";
import { getSystemUsersEntity } from "../model/system-entities";
import {
  getRelationRecordOptions,
  isEntityNameField,
  parseEntityListValueIds,
  parseEntityRelationIds,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  serializeEntityListValueIds,
  serializeEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityListOption,
} from "../model/types";
import { ListSelect } from "./ListSelect";
import { RelationSelect } from "./RelationSelect";

type ConditionBuilderProps = {
  /** Entity whose records are tested. */
  entity: Entity;
  entities: Entity[];
  conditions: EntityCondition[];
  onChange: (conditions: EntityCondition[]) => void;
  /**
   * Parent / form entity. When set, enables «как в этой записи»
   * (match a field on the current record).
   */
  sourceEntity?: Entity | null;
  /** Field on `sourceEntity` that must not appear as a match source. */
  sourceExcludeFieldId?: string | null;
  className?: string;
};

type OperandKind =
  | "ids"
  | "number"
  | "days"
  | "date"
  | "text"
  | "userField"
  | "recordField"
  | null;

const LIST_OTHER_OPTION: EntityListOption = {
  id: ENTITY_LIST_OTHER_OPTION_ID,
  name: "Другое",
  color: "#94a3b8",
  parentOptionId: null,
};

function getOperandKind(operator: EntityConditionOperator): OperandKind {
  switch (operator) {
    case "in":
    case "notIn":
      return "ids";
    case "gt":
    case "lt":
    case "eq":
      return "number";
    case "withinDays":
      return "days";
    case "on":
    case "before":
    case "after":
      return "date";
    case "contains":
      return "text";
    case "equalsCurrentUserField":
    case "notEqualsCurrentUserField":
      return "userField";
    case "equalsRecordField":
      return "recordField";
    default:
      return null;
  }
}

function getConditionFields(entity: Entity) {
  return entity.fields.filter(
    (field) =>
      field.type !== "file" &&
      field.type !== "dependencies" &&
      field.type !== "relationGroups" &&
      field.type !== "period",
  );
}

function fieldKind(
  entity: Entity,
  field: EntityField,
  entities: Entity[],
): EntityValueKind {
  return getEntityFieldValueKind(entity, field, entities);
}

/** List / relation fields on the parent record, preferred matches first. */
function getRecordMatchFields(
  sourceEntity: Entity,
  targetEntity: Entity,
  targetField: EntityField,
  entities: Entity[],
  excludeFieldId: string | null | undefined,
): EntityField[] {
  const targetKind = getEntityFieldValueKind(
    targetEntity,
    targetField,
    entities,
  );
  const targetSource = resolveEntityFieldSource(
    targetEntity,
    targetField,
    entities,
  );
  // Prefer same value-kind; for relations also same related entity.
  const preferredTargetId =
    targetSource?.field.type === "relation"
      ? getEntityRelationTargetId(targetSource.field)
      : null;

  return sourceEntity.fields
    .filter((item) => {
      if (excludeFieldId && item.id === excludeFieldId) return false;
      const kind = getEntityFieldValueKind(sourceEntity, item, entities);
      return kind === "relation" || kind === "list";
    })
    .sort((a, b) => {
      const score = (item: EntityField) => {
        let points = 0;
        const kind = getEntityFieldValueKind(sourceEntity, item, entities);
        if (kind === targetKind) points += 2;
        if (
          preferredTargetId &&
          item.type === "relation" &&
          getEntityRelationTargetId(item) === preferredTargetId
        ) {
          points += 4;
        }
        if (
          getEntityFieldDisplayName(item) ===
          getEntityFieldDisplayName(targetField)
        ) {
          points += 1;
        }
        return points;
      };
      return score(b) - score(a);
    });
}

function ConditionValueEditor({
  entity,
  entities,
  field,
  condition,
  sourceEntity,
  sourceExcludeFieldId,
  onChange,
}: {
  entity: Entity;
  entities: Entity[];
  field: EntityField;
  condition: EntityCondition;
  sourceEntity?: Entity | null;
  sourceExcludeFieldId?: string | null;
  onChange: (patch: Partial<EntityCondition>) => void;
}) {
  const operandKind = getOperandKind(condition.operator);

  if (operandKind === "ids") {
    // Title identifies the record — pick catalog rows by id.
    if (isEntityNameField(field)) {
      return (
        <RelationSelect
          multiple
          options={getRelationRecordOptions(entity, entities)}
          value={serializeEntityRelationIds(condition.values ?? [])}
          placeholder="Выберите записи"
          aria-label="Записи"
          className="h-8"
          onChange={(next) =>
            onChange({ values: parseEntityRelationIds(next) })
          }
        />
      );
    }
    const source = resolveEntityFieldSource(entity, field, entities);
    if (source?.field.type === "list") {
      const options = resolveEntityListFieldOptions(source.field, entities);
      const withOther =
        source.field.listAllowOther && !source.field.listMultiple
          ? [...options, LIST_OTHER_OPTION]
          : options;
      return (
        <ListSelect
          multiple
          options={withOther}
          value={serializeEntityListValueIds(condition.values ?? [])}
          showColors={
            resolveEntityListFieldPresentation(source.field, entities)
              .listUseColors
          }
          emptyLabel="Выберите варианты"
          aria-label="Варианты"
          className="h-8"
          onChange={(next) =>
            onChange({ values: parseEntityListValueIds(next) })
          }
        />
      );
    }
    if (source?.field.type === "relation") {
      const target =
        entities.find(
          (item) => item.id === getEntityRelationTargetId(source.field),
        ) ?? null;
      return (
        <RelationSelect
          multiple
          options={getRelationRecordOptions(target)}
          value={serializeEntityRelationIds(condition.values ?? [])}
          placeholder="Выберите записи"
          aria-label="Записи"
          className="h-8"
          onChange={(next) =>
            onChange({ values: parseEntityRelationIds(next) })
          }
        />
      );
    }
    return (
      <p className="px-1 text-xs text-muted-foreground">
        Нет вариантов для этого поля
      </p>
    );
  }

  if (operandKind === "userField") {
    const users = getSystemUsersEntity(entities);
    const userFields = users
      ? users.fields.filter((item) => {
          const kind = getEntityFieldValueKind(users, item, entities);
          return kind === "relation" || kind === "list";
        })
      : [];
    const selected = userFields.find((item) => item.id === condition.value);
    return (
      <Select
        value={condition.value ?? ""}
        onValueChange={(next) => {
          if (next != null) onChange({ value: String(next) });
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-full"
          aria-label="Поле пользователя"
        >
          <SelectValue>
            {selected
              ? getEntityFieldDisplayName(selected)
              : "Поле пользователя"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {userFields.length === 0 || !users ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет подходящих полей у пользователя
            </div>
          ) : (
            userFields.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {getEntityFieldDisplayName(item)}
                <span className="text-muted-foreground">
                  {" · "}
                  {ENTITY_VALUE_KIND_LABELS[fieldKind(users, item, entities)]}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  if (operandKind === "recordField") {
    const recordFields = sourceEntity
      ? getRecordMatchFields(
          sourceEntity,
          entity,
          field,
          entities,
          sourceExcludeFieldId,
        )
      : [];
    const selected = recordFields.find((item) => item.id === condition.value);
    return (
      <Select
        value={condition.value ?? ""}
        onValueChange={(next) => {
          if (next != null) onChange({ value: String(next) });
        }}
      >
        <SelectTrigger
          size="sm"
          className="w-full"
          aria-label="Поле этой записи"
        >
          <SelectValue>
            {selected
              ? `Как в записи: ${getEntityFieldDisplayName(selected)}`
              : "Поле этой записи"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {recordFields.length === 0 || !sourceEntity ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет подходящих полей в этой записи
            </div>
          ) : (
            recordFields.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {getEntityFieldDisplayName(item)}
                <span className="text-muted-foreground">
                  {" · "}
                  {
                    ENTITY_VALUE_KIND_LABELS[
                      fieldKind(sourceEntity, item, entities)
                    ]
                  }
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  if (operandKind === "date") {
    return (
      <DatePicker
        value={condition.value ?? ""}
        onChange={(next) => onChange({ value: next })}
        placeholder="Дата"
        aria-label="Дата"
        className="h-8 w-full"
      />
    );
  }

  if (operandKind === "number" || operandKind === "days") {
    return (
      <Input
        type="text"
        inputMode={operandKind === "days" ? "numeric" : "decimal"}
        value={condition.value ?? ""}
        placeholder={operandKind === "days" ? "Количество дней" : "Число"}
        aria-label="Значение"
        className="h-8"
        onChange={(event) =>
          onChange({
            value:
              operandKind === "days"
                ? event.target.value.replace(/\D/g, "")
                : normalizeEntityDecimalInput(event.target.value),
          })
        }
      />
    );
  }

  if (operandKind === "text") {
    return (
      <Input
        value={condition.value ?? ""}
        placeholder="Текст"
        aria-label="Значение"
        className="h-8"
        onChange={(event) => onChange({ value: event.target.value })}
      />
    );
  }

  return null;
}

/** Editable set of conditions: «[Поле] [условие] [значение]» rows. */
export function ConditionBuilder({
  entity,
  entities,
  conditions,
  onChange,
  sourceEntity = null,
  sourceExcludeFieldId = null,
  className,
}: ConditionBuilderProps) {
  const fields = getConditionFields(entity);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function operatorsOf(field: EntityField) {
    const base = getEntityConditionOperators(
      fieldKind(entity, field, entities),
    );
    // Name is the record identity — allow catalog id / current-user matches.
    const operators = isEntityNameField(field)
      ? Array.from(
          new Set<EntityConditionOperator>([
            ...base,
            "in",
            "notIn",
            "equalsCurrentUserField",
            "notEqualsCurrentUserField",
          ]),
        )
      : base;
    if (sourceEntity) return operators;
    return operators.filter((item) => item !== "equalsRecordField");
  }

  function resolveOperator(
    field: EntityField,
    operator: EntityConditionOperator,
  ) {
    const operators = operatorsOf(field);
    return operators.includes(operator) ? operator : operators[0]!;
  }

  // Heal stale operators after a field type change (e.g. text → list).
  useEffect(() => {
    let changed = false;
    const next = conditions.map((condition) => {
      const field = fields.find((item) => item.id === condition.fieldId);
      if (!field) return condition;
      const operator = resolveOperator(field, condition.operator);
      if (operator === condition.operator) return condition;
      changed = true;
      return { id: condition.id, fieldId: condition.fieldId, operator };
    });
    if (changed) onChangeRef.current(next);
    // resolveOperator closes over sourceEntity; heal when it appears/disappears.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional field/operator heal
  }, [conditions, entities, entity, fields, sourceEntity]);

  function update(conditionId: string, patch: Partial<EntityCondition>) {
    onChange(
      conditions.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    );
  }

  function changeField(condition: EntityCondition, fieldId: string) {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;
    onChange(
      conditions.map((item) =>
        item.id === condition.id
          ? { id: item.id, fieldId, operator: operatorsOf(field)[0]! }
          : item,
      ),
    );
  }

  function changeOperator(
    condition: EntityCondition,
    operator: EntityConditionOperator,
  ) {
    const keepOperand =
      getOperandKind(operator) === getOperandKind(condition.operator);
    const field = fields.find((item) => item.id === condition.fieldId);
    onChange(
      conditions.map((item) => {
        if (item.id !== condition.id) return item;
        const next: EntityCondition = {
          id: item.id,
          fieldId: item.fieldId,
          operator,
        };
        if (keepOperand && item.values) next.values = item.values;
        if (keepOperand && item.value) next.value = item.value;
        // Prefer the best-matching parent field when enabling the operator.
        if (
          operator === "equalsRecordField" &&
          !next.value &&
          sourceEntity &&
          field
        ) {
          const preferred = getRecordMatchFields(
            sourceEntity,
            entity,
            field,
            entities,
            sourceExcludeFieldId,
          )[0];
          if (preferred) next.value = preferred.id;
        }
        return next;
      }),
    );
  }

  function add() {
    const field = fields[0];
    if (!field) return;
    onChange([
      ...conditions,
      {
        id: createEntityConditionId(),
        fieldId: field.id,
        operator: operatorsOf(field)[0]!,
      },
    ]);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {conditions.map((condition) => {
        const field = fields.find((item) => item.id === condition.fieldId);
        const operators = field ? operatorsOf(field) : [];
        const operator = field
          ? resolveOperator(field, condition.operator)
          : condition.operator;
        const kind = field ? fieldKind(entity, field, entities) : null;

        return (
          <div
            key={condition.id}
            className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-background p-1.5"
          >
            <div className="flex items-center gap-1.5">
              <Select
                value={condition.fieldId}
                onValueChange={(next) => {
                  if (next != null) changeField(condition, String(next));
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-0 flex-1"
                  aria-label="Поле"
                >
                  <SelectValue>
                    {field ? (
                      <>
                        {getEntityFieldDisplayName(field)}
                        {kind ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {ENTITY_VALUE_KIND_LABELS[kind]}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "Поле удалено"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {fields.map((item) => {
                    const itemKind = fieldKind(entity, item, entities);
                    return (
                      <SelectItem key={item.id} value={item.id}>
                        {getEntityFieldDisplayName(item)}
                        <span className="text-muted-foreground">
                          {" · "}
                          {ENTITY_VALUE_KIND_LABELS[itemKind]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select
                value={operator}
                disabled={!field}
                onValueChange={(next) => {
                  const nextOperator = operators.find((item) => item === next);
                  if (nextOperator) changeOperator(condition, nextOperator);
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-[11.5rem] shrink-0"
                  aria-label="Условие"
                >
                  <SelectValue>
                    {ENTITY_CONDITION_OPERATOR_LABELS[operator]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectOptionGroups
                    groups={ENTITY_CONDITION_OPERATOR_GROUPS}
                    available={operators}
                    getLabel={(item) => ENTITY_CONDITION_OPERATOR_LABELS[item]}
                  />
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Удалить условие"
                onClick={() =>
                  onChange(
                    conditions.filter((item) => item.id !== condition.id),
                  )
                }
              >
                <X className="size-3.5" />
              </Button>
            </div>
            {field && entityConditionNeedsValue(operator) ? (
              <ConditionValueEditor
                entity={entity}
                entities={entities}
                field={field}
                sourceEntity={sourceEntity}
                sourceExcludeFieldId={sourceExcludeFieldId}
                condition={
                  operator === condition.operator
                    ? condition
                    : { ...condition, operator }
                }
                onChange={(patch) => update(condition.id, patch)}
              />
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 self-start px-2 text-xs text-muted-foreground hover:text-foreground"
        disabled={fields.length === 0}
        onClick={add}
      >
        <Plus className="size-3.5" />
        Условие
      </Button>
    </div>
  );
}
