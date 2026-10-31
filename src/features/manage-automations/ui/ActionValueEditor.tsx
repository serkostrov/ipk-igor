import * as React from "react";
import { ChevronRight } from "lucide-react";
import {
  AUTOMATION_PATH_RELATED_RECORD,
  AUTOMATION_VALUE_CURRENT_RECORD,
  AUTOMATION_VALUE_CURRENT_USER,
  AUTOMATION_VALUE_NOW,
  AUTOMATION_VALUE_TIME_NOW,
  AUTOMATION_VALUE_TODAY,
  AUTOMATION_VALUE_TOMORROW,
  automationBridgeTargetEntityId,
  automationLookupRelationGroupsField,
  getAskRelatedLinkedTabs,
  isAutomationEntityPathRef,
  isAutomationFieldRef,
  isAutomationPathRelatedRecord,
  isAutomationTabPathBridge,
  parseAutomationEntityPathRef,
  toAutomationEntityPathRef,
  toAutomationFieldRef,
  toAutomationTabPathBridge,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getEntityValueContext,
  getRelationRecordOptions,
  isEntityComputedFieldType,
  isEntityRelationGroupsConfigReady,
  isEntityRelationLikeFieldType,
  ListSelect,
  normalizeEntityDecimalInput,
  RelationGroupsFieldControl,
  RelationSelect,
  resolveEntityListFieldOptions,
  resolveEntityListFieldPresentation,
  SYSTEM_USERS_ENTITY_ID,
  parseEntityPeriod,
  serializeEntityPeriod,
  type Entity,
  type EntityField,
  type EntityTab,
} from "@/entities/entity";
import { DatePicker } from "@/shared/ui/date-picker";
import { DateRangePicker } from "@/shared/ui/date-range-picker";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { TimePicker } from "@/shared/ui/time-picker";
import { joinDatetime, splitDatetime } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

type ActionValueEditorProps = {
  field: EntityField | null;
  value: string;
  onChange: (value: string) => void;
  sourceFields: EntityField[];
  entities: Entity[];
  className?: string;
  /** Value is written to another entity (createRecord mappings). */
  mapToOtherEntity?: boolean;
  /** Source/trigger entity — enables «Текущая запись» for reverse relations. */
  sourceEntityId?: string;
  /** Mode + value on one row for dense mapping tables. */
  compact?: boolean;
};

function valueSourceLabels(compact?: boolean) {
  const fromFieldLabel = compact ? "Поле" : "Из другого поля";
  const fromEntityLabel = compact ? "Связь" : "Из другой сущности";
  return { fromFieldLabel, fromEntityLabel };
}

type ValueMode =
  | "empty"
  | "today"
  | "tomorrow"
  | "now"
  | "custom"
  | "true"
  | "false"
  | "currentUser"
  | "currentRecord"
  | "fromField"
  | "fromEntity";

function fieldRefId(value: string) {
  const match = value.trim().match(/^\{\{([^.}]+)\}\}$/);
  return match?.[1]?.trim() ?? "";
}

function detectMode(value: string, field: EntityField | null): ValueMode {
  const raw = value.trim();
  if (!raw) return "empty";
  if (raw === AUTOMATION_VALUE_TODAY) return "today";
  if (raw === AUTOMATION_VALUE_TOMORROW) return "tomorrow";
  if (raw === AUTOMATION_VALUE_NOW || raw === AUTOMATION_VALUE_TIME_NOW) {
    return "now";
  }
  if (raw === AUTOMATION_VALUE_CURRENT_USER) return "currentUser";
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) return "currentRecord";
  if (isAutomationEntityPathRef(raw)) return "fromEntity";
  if (isAutomationFieldRef(raw)) return "fromField";
  if (field?.type === "boolean") {
    if (raw === "true") return "true";
    if (raw === "false") return "false";
  }
  return "custom";
}

const VALUE_MODE_GROUPS_DEFAULT: Array<{ label: string; values: string[] }> = [
  { label: "Сброс", values: ["empty"] },
  {
    label: "Готовые",
    values: [
      "today",
      "tomorrow",
      "now",
      "true",
      "false",
      "currentUser",
      "currentRecord",
    ],
  },
  { label: "Вручную", values: ["custom"] },
  { label: "Из записи", values: ["fromField", "fromEntity"] },
];

/** createRecord mappings: «Заполнить» with source field vs related entity. */
const VALUE_MODE_GROUPS_MAPPING: Array<{ label: string; values: string[] }> = [
  {
    label: "Заполнить",
    values: [
      "custom",
      "today",
      "tomorrow",
      "now",
      "true",
      "false",
      "currentUser",
      "currentRecord",
      "fromField",
      "fromEntity",
    ],
  },
];

function ModeSelect({
  value,
  options,
  onChange,
  className,
  mapping,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
  className?: string;
  /** createRecord field mappings — «Заполнить» / источник / связанная. */
  mapping?: boolean;
}) {
  const byValue = new Map(options.map((item) => [item.value, item]));
  const groupDefs = mapping
    ? VALUE_MODE_GROUPS_MAPPING
    : VALUE_MODE_GROUPS_DEFAULT;
  const groups = groupDefs
    .map((group) => ({
      label: group.label,
      items: group.values
        .map((mode) => byValue.get(mode))
        .filter((item): item is { value: string; label: string } =>
          Boolean(item),
        ),
    }))
    .filter((group) => group.items.length > 0);
  const groupedValues = new Set(
    groups.flatMap((group) => group.items.map((item) => item.value)),
  );
  const ungrouped = options.filter((item) => !groupedValues.has(item.value));

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(String(next));
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-8 min-w-0 overflow-hidden", className)}
      >
        <SelectValue className="min-w-0">
          {(selected) => {
            const label =
              options.find((item) => item.value === selected)?.label ??
              "Выберите";
            return <span className="block truncate">{label}</span>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent searchable={false} align="start" className="min-w-[12rem]">
        {ungrouped.length > 0 ? (
          <SelectGroup>
            {ungrouped.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                label={item.label}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                label={item.label}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function SourceFieldSelect({
  fields,
  value,
  onChange,
  excludeFieldId,
  placeholder = "Выберите поле",
  entitySuffix,
  /** Pick the related record id itself (for relation targets). */
  relatedRecordOption,
  className,
}: {
  fields: EntityField[];
  value: string;
  onChange: (fieldId: string) => void;
  excludeFieldId?: string;
  placeholder?: string;
  /** Entity this field is read from — shown as muted «из …». */
  entitySuffix?: string;
  relatedRecordOption?: { value: string; label: string };
  className?: string;
}) {
  // Compatibility filtering happens upstream (`compatibleNestedFields`).
  // Do not drop relationGroups here — they are valid when the target is also
  // a groups field (copy set → set).
  const options = fields.filter(
    (field) => field.id !== excludeFieldId && field.type !== "file",
  );
  const searchLabel = (field: EntityField) => {
    const name = getEntityFieldDisplayName(field);
    if (entitySuffix) return `${name} из ${entitySuffix}`;
    if (field.type === "relationGroups") return `${name} · набор связей`;
    if (isEntityRelationLikeFieldType(field.type)) {
      const targetId = getEntityRelationTargetId(field);
      if (targetId === SYSTEM_USERS_ENTITY_ID) {
        return `${name} · пользователь`;
      }
    }
    return name;
  };
  const renderFieldLabel = (field: EntityField) => {
    const name = getEntityFieldDisplayName(field);
    if (entitySuffix) {
      return (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">{name}</span>
          <span className="truncate text-muted-foreground">
            из «{entitySuffix}»
          </span>
        </span>
      );
    }
    if (field.type === "relationGroups") {
      return (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">{name}</span>
          <span className="truncate text-muted-foreground">набор связей</span>
        </span>
      );
    }
    if (isEntityRelationLikeFieldType(field.type)) {
      const targetId = getEntityRelationTargetId(field);
      if (targetId === SYSTEM_USERS_ENTITY_ID) {
        return (
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate">{name}</span>
            <span className="truncate text-muted-foreground">пользователь</span>
          </span>
        );
      }
    }
    return <span className="block truncate">{name}</span>;
  };
  const recordLabel = relatedRecordOption?.label ?? "";
  const hasOptions = options.length > 0 || Boolean(relatedRecordOption);
  return (
    <div className={cn("min-w-0 w-full", className)}>
      <Select
        value={value || undefined}
        onValueChange={(next) => {
          if (next != null) onChange(String(next));
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-8 min-w-0 overflow-hidden !w-full"
        >
          <SelectValue className="min-w-0">
            {(selected) => {
              if (
                relatedRecordOption &&
                selected === relatedRecordOption.value
              ) {
                return <span className="block truncate">{recordLabel}</span>;
              }
              const field = options.find((item) => item.id === selected);
              return field ? renderFieldLabel(field) : placeholder;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72" searchPlaceholder="Поиск поля…">
          {!hasOptions ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет совместимых полей на исходной записи
            </div>
          ) : (
            <>
              {relatedRecordOption ? (
                <SelectGroup>
                  <SelectLabel>Связанная запись</SelectLabel>
                  <SelectItem
                    value={relatedRecordOption.value}
                    label={relatedRecordOption.label}
                  >
                    {relatedRecordOption.label}
                  </SelectItem>
                </SelectGroup>
              ) : null}
              {options.length > 0 ? (
                <SelectGroup>
                  {relatedRecordOption ? (
                    <SelectLabel>Поле записи</SelectLabel>
                  ) : null}
                  {options.map((field) => (
                    <SelectItem
                      key={field.id}
                      value={field.id}
                      label={searchLabel(field)}
                    >
                      {renderFieldLabel(field)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Skip non-copyable structured / binary fields. */
function isMappableSourceField(field: EntityField, target?: EntityField) {
  if (field.type === "file" || field.type === "dependencies") return false;
  // relationGroups only as source when mapping onto another groups field.
  if (field.type === "relationGroups") {
    return target?.type === "relationGroups";
  }
  return true;
}

function isTypeCompatibleSource(
  target: EntityField,
  item: EntityField,
): boolean {
  if (target.type === "boolean") {
    return item.type === "boolean" || item.type === "lookup";
  }
  if (target.type === "list") {
    return (
      item.type === "list" || item.type === "lookup" || item.type === "text"
    );
  }
  if (target.type === "datetime") {
    return (
      item.type === "datetime" ||
      item.type === "text" ||
      item.type === "lookup" ||
      item.type === "formula"
    );
  }
  if (target.type === "period") {
    return (
      item.type === "period" || item.type === "text" || item.type === "lookup"
    );
  }
  if (target.type === "time") {
    return (
      item.type === "time" || item.type === "text" || item.type === "lookup"
    );
  }
  if (target.type === "relation" || target.type === "belonging") {
    if (item.type === "lookup") return true;
    if (item.type === "text" || item.type === "textarea") return true;
    if (!isEntityRelationLikeFieldType(item.type)) return false;
    const targetId = getEntityRelationTargetId(target);
    const itemTarget = getEntityRelationTargetId(item);
    return !targetId || !itemTarget || targetId === itemTarget;
  }
  if (target.type === "number") {
    return (
      item.type === "number" ||
      item.type === "text" ||
      item.type === "formula" ||
      item.type === "rollup" ||
      item.type === "numberSum" ||
      item.type === "lookup"
    );
  }
  if (target.type === "relationGroups") {
    return item.type === "relationGroups" || item.type === "lookup";
  }
  // Text-like: runtime resolves relation ids to labels.
  if (
    target.type === "text" ||
    target.type === "textarea" ||
    target.type === "url" ||
    target.type === "email" ||
    target.type === "phone"
  ) {
    return (
      item.type === "text" ||
      item.type === "textarea" ||
      item.type === "url" ||
      item.type === "email" ||
      item.type === "phone" ||
      item.type === "number" ||
      item.type === "datetime" ||
      item.type === "time" ||
      item.type === "list" ||
      item.type === "relation" ||
      item.type === "belonging" ||
      item.type === "lookup" ||
      item.type === "formula" ||
      item.type === "rollup" ||
      item.type === "numberSum"
    );
  }
  return !isEntityComputedFieldType(item.type) || item.type === "lookup";
}

/**
 * Fields that can supply a value for `target` in mappings / setField.
 * Computed fields are allowed as sources (their resolved value is copied).
 * `loose` — show every copyable field (compatible first); for «через связь».
 */
function compatibleNestedFields(
  target: EntityField,
  candidates: EntityField[],
  options?: { loose?: boolean },
): EntityField[] {
  const usable = candidates.filter((item) =>
    isMappableSourceField(item, target),
  );
  if (options?.loose) {
    return [...usable].sort((a, b) => {
      const aOk = isTypeCompatibleSource(target, a) ? 0 : 1;
      const bOk = isTypeCompatibleSource(target, b) ? 0 : 1;
      if (aOk !== bOk) return aOk - bOk;
      return getEntityFieldDisplayName(a).localeCompare(
        getEntityFieldDisplayName(b),
        "ru",
      );
    });
  }
  return usable.filter((item) => isTypeCompatibleSource(target, item));
}

function relationGroupsLevelLabel(index: number) {
  return index === 0 ? "Строки" : "Вложенные";
}

function isBridgeSourceField(
  field: EntityField,
  entities: Entity[],
  host?: Entity | null,
) {
  if (isEntityRelationLikeFieldType(field.type)) {
    return Boolean(getEntityRelationTargetId(field));
  }
  if (field.type === "relationGroups") {
    return Boolean(
      automationBridgeTargetEntityId(field, entities) ||
      (field.relationGroups?.levels.length ?? 0) > 0,
    );
  }
  if (host && automationLookupRelationGroupsField(host, field, entities)) {
    return true;
  }
  return false;
}

/** Groups field behind a relationGroups bridge or a lookup of groups. */
function bridgeGroupsField(
  field: EntityField,
  entities: Entity[],
  host?: Entity | null,
): EntityField | null {
  if (field.type === "relationGroups") return field;
  if (!host) return null;
  return automationLookupRelationGroupsField(host, field, entities);
}

function bridgeFieldLabel(
  field: EntityField,
  entities: Entity[],
  host?: Entity | null,
) {
  const name = getEntityFieldDisplayName(field);
  if (field.type === "relationGroups") {
    return `${name} · набор связей`;
  }
  if (host && automationLookupRelationGroupsField(host, field, entities)) {
    return `${name} · набор из связи`;
  }
  if (field.type === "relation" || field.type === "belonging") {
    const targetId = getEntityRelationTargetId(field);
    if (targetId === SYSTEM_USERS_ENTITY_ID) {
      return `${name} → пользователь`;
    }
    const target = targetId
      ? entities.find((entity) => entity.id === targetId)
      : null;
    return target ? `${name} → ${getEntityDisplayName(target)}` : name;
  }
  return name;
}

/** Relation/belonging/dependencies target matches the hop entity — copy record id(s). */
function canPickRelatedRecordAsValue(
  targetField: EntityField,
  relatedEntityId: string | null,
) {
  if (!relatedEntityId) return false;
  if (
    targetField.type !== "relation" &&
    targetField.type !== "belonging" &&
    targetField.type !== "dependencies"
  ) {
    return false;
  }
  return getEntityRelationTargetId(targetField) === relatedEntityId;
}

type EntityPathBridgeOption = {
  id: string;
  label: string;
  field: EntityField | null;
  tab: EntityTab | null;
  linkedEntity: Entity | null;
};

function pickDefaultNestedFieldId(
  targetField: EntityField,
  relatedEntityId: string | null,
  nestedFields: EntityField[],
  preferId: string,
) {
  const canRecord = canPickRelatedRecordAsValue(targetField, relatedEntityId);
  if (preferId) {
    if (isAutomationPathRelatedRecord(preferId) && canRecord) return preferId;
    if (nestedFields.some((field) => field.id === preferId)) return preferId;
  }
  if (canRecord) return AUTOMATION_PATH_RELATED_RECORD;
  return nestedFields[0]?.id ?? "";
}

function buildEntityPathBridgeOptions(options: {
  sourceFields: EntityField[];
  entities: Entity[];
  hostEntity: Entity | null;
  targetField: EntityField;
  mapToOtherEntity?: boolean;
}): EntityPathBridgeOption[] {
  const { sourceFields, entities, hostEntity, targetField, mapToOtherEntity } =
    options;
  const bridges: EntityPathBridgeOption[] = [];
  const seen = new Set<string>();

  for (const field of sourceFields) {
    if (!mapToOtherEntity && field.id === targetField.id) continue;
    if (!isBridgeSourceField(field, entities, hostEntity)) continue;
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    bridges.push({
      id: field.id,
      label: bridgeFieldLabel(field, entities, hostEntity),
      field,
      tab: null,
      linkedEntity: null,
    });
  }

  if (hostEntity) {
    for (const { tab, target } of getAskRelatedLinkedTabs(
      hostEntity,
      entities,
    )) {
      const id = toAutomationTabPathBridge(tab.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tabName = tab.name.trim() || getEntityDisplayName(target);
      bridges.push({
        id,
        label: `${tabName} → ${getEntityDisplayName(target)}`,
        field: null,
        tab,
        linkedEntity: target,
      });
    }
  }

  return bridges;
}

function FromEntitySelects({
  targetField,
  sourceFields,
  entities,
  value,
  onChange,
  mapToOtherEntity,
  sourceEntityId,
  compact,
  className,
}: {
  targetField: EntityField;
  sourceFields: EntityField[];
  entities: Entity[];
  value: string;
  onChange: (next: string) => void;
  mapToOtherEntity?: boolean;
  sourceEntityId?: string;
  compact?: boolean;
  className?: string;
}) {
  const path = parseAutomationEntityPathRef(value);
  let hostEntity = sourceEntityId
    ? (entities.find((entity) => entity.id === sourceEntityId) ?? null)
    : null;
  if (!hostEntity) {
    hostEntity =
      entities.find((entity) =>
        sourceFields.every((field) =>
          entity.fields.some((item) => item.id === field.id),
        ),
      ) ??
      entities.find((entity) =>
        sourceFields.some((field) =>
          entity.fields.some((item) => item.id === field.id),
        ),
      ) ??
      null;
  }
  const bridgeOptions = buildEntityPathBridgeOptions({
    sourceFields,
    entities,
    hostEntity,
    targetField,
    mapToOtherEntity,
  });
  const relationFieldId = path?.relationFieldId ?? "";
  const nestedFieldId = path?.fieldId ?? "";
  const selectedBridge =
    bridgeOptions.find((item) => item.id === relationFieldId) ?? null;
  const bridgeField = selectedBridge?.field ?? null;
  const groupsField = bridgeField
    ? bridgeGroupsField(bridgeField, entities, hostEntity)
    : null;
  const isGroups = groupsField != null;
  const groupsLevels = groupsField?.relationGroups?.levels ?? [];
  const groupsDepth =
    path?.relationGroupsDepth ??
    (isGroups ? Math.max(0, groupsLevels.length - 1) : undefined);

  const relatedEntityId = selectedBridge?.linkedEntity
    ? selectedBridge.linkedEntity.id
    : bridgeField
      ? automationBridgeTargetEntityId(
          bridgeField,
          entities,
          groupsDepth,
          hostEntity,
        )
      : null;
  const relatedEntity = relatedEntityId
    ? (entities.find((entity) => entity.id === relatedEntityId) ??
      selectedBridge?.linkedEntity ??
      null)
    : null;
  const nestedFields = relatedEntity
    ? compatibleNestedFields(targetField, relatedEntity.fields, {
        loose: true,
      })
    : [];
  const relatedName = relatedEntity
    ? getEntityDisplayName(relatedEntity)
    : "связанной записи";

  function emitPath(
    nextBridgeId: string,
    nextNestedId: string,
    nextDepth?: number,
  ) {
    onChange(
      toAutomationEntityPathRef(
        nextBridgeId,
        nextNestedId,
        nextDepth != null ? nextDepth : undefined,
      ),
    );
  }

  function pickDefaultNestedForBridge(
    bridge: EntityPathBridgeOption,
    depth: number | undefined,
    preferId: string,
  ) {
    const targetId = bridge.linkedEntity
      ? bridge.linkedEntity.id
      : bridge.field
        ? automationBridgeTargetEntityId(
            bridge.field,
            entities,
            depth,
            hostEntity,
          )
        : null;
    const entity = targetId
      ? (entities.find((item) => item.id === targetId) ??
        bridge.linkedEntity ??
        null)
      : null;
    const options = entity
      ? compatibleNestedFields(targetField, entity.fields, { loose: true })
      : [];
    return pickDefaultNestedFieldId(targetField, targetId, options, preferId);
  }

  const canPickRecord = canPickRelatedRecordAsValue(
    targetField,
    relatedEntityId,
  );
  const relatedRecordOption = canPickRecord
    ? {
        value: AUTOMATION_PATH_RELATED_RECORD,
        label: `Запись «${relatedName}»`,
      }
    : undefined;

  const bridgeSelect =
    bridgeOptions.length === 0 ? (
      <p className="text-[11px] text-muted-foreground">
        Нет связей, вкладок и наборов, из которых можно взять значение.
      </p>
    ) : (
      <div className="min-w-0">
        <Select
          value={relationFieldId || undefined}
          onValueChange={(next) => {
            if (next == null) return;
            const nextId = String(next);
            const nextBridge = bridgeOptions.find((item) => item.id === nextId);
            if (!nextBridge) return;
            const nextGroups = nextBridge.field
              ? bridgeGroupsField(nextBridge.field, entities, hostEntity)
              : null;
            const nextDepth = nextGroups
              ? Math.max(0, (nextGroups.relationGroups?.levels.length ?? 1) - 1)
              : undefined;
            const nextNested = pickDefaultNestedForBridge(
              nextBridge,
              nextDepth,
              nestedFieldId,
            );
            emitPath(nextId, nextNested, nextDepth);
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-full min-w-0 overflow-hidden"
          >
            <SelectValue className="min-w-0">
              {(selected) => {
                const bridge = bridgeOptions.find(
                  (item) => item.id === selected,
                );
                return (
                  <span className="block truncate">
                    {bridge?.label ??
                      (isAutomationTabPathBridge(String(selected ?? ""))
                        ? "Связанная вкладка"
                        : "Поле связи")}
                  </span>
                );
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72" searchPlaceholder="Поиск…">
            {bridgeOptions.map((bridge) => (
              <SelectItem
                key={bridge.id}
                value={bridge.id}
                label={bridge.label}
              >
                {bridge.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );

  const levelSelect =
    isGroups && groupsLevels.length > 0 ? (
      <div className={cn("min-w-0", compact ? "w-auto shrink-0" : undefined)}>
        <Select
          value={String(groupsDepth ?? 0)}
          onValueChange={(next) => {
            if (next == null || !selectedBridge) return;
            const depth = Number.parseInt(String(next), 10);
            if (!Number.isFinite(depth)) return;
            const nextNested = pickDefaultNestedForBridge(
              selectedBridge,
              depth,
              nestedFieldId,
            );
            emitPath(relationFieldId, nextNested, depth);
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-0 overflow-hidden"
          >
            <SelectValue>
              {relationGroupsLevelLabel(groupsDepth ?? 0)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent searchable={false}>
            {groupsLevels.map((_, index) => (
              <SelectItem
                key={index}
                value={String(index)}
                label={relationGroupsLevelLabel(index)}
              >
                {relationGroupsLevelLabel(index)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  const nestedSelect = !relationFieldId ? null : !canPickRecord &&
    nestedFields.length === 0 ? (
    <p className="text-[11px] text-muted-foreground">
      У связанной сущности нет подходящих полей.
    </p>
  ) : (
    <SourceFieldSelect
      fields={nestedFields}
      value={nestedFieldId}
      placeholder={
        canPickRecord
          ? `Запись или поле «${relatedName}»`
          : `Поле из «${relatedName}»`
      }
      entitySuffix={relatedName}
      relatedRecordOption={relatedRecordOption}
      className={compact ? "min-w-0 w-full" : undefined}
      onChange={(nextFieldId) => {
        emitPath(
          relationFieldId,
          nextFieldId,
          isGroups ? (groupsDepth ?? 0) : undefined,
        );
      }}
    />
  );

  if (compact) {
    const nestingRow =
      levelSelect || nestedSelect ? (
        <div className="col-span-2 grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5">
          <div className="flex shrink-0 items-center gap-1.5">
            {levelSelect}
            {levelSelect && nestedSelect ? (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
          {nestedSelect}
        </div>
      ) : null;

    // `contents` so bridge + nesting participate in parent grid
    // (mode | bridge / nesting full width).
    return (
      <div className={cn("contents", className)}>
        {bridgeSelect}
        {nestingRow}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {bridgeSelect}
      {levelSelect}
      {nestedSelect}
    </div>
  );
}

/**
 * Mode can be `custom` / `fromField` / `fromEntity` while the stored value is
 * still empty (user just switched type and has not filled the picker yet).
 */
function useEditorMode(value: string, field: EntityField) {
  const detected = detectMode(value, field);
  const [pendingMode, setPendingMode] = React.useState<ValueMode | null>(null);

  const mode = detected !== "empty" ? detected : (pendingMode ?? "empty");

  const selectMode = React.useCallback(
    (next: ValueMode, nextValue: string) => {
      const nextDetected = detectMode(nextValue, field);
      if (nextDetected === next) {
        setPendingMode(null);
      } else if (
        next === "custom" ||
        next === "fromField" ||
        next === "fromEntity"
      ) {
        setPendingMode(next);
      } else {
        setPendingMode(null);
      }
      return nextValue;
    },
    [field],
  );

  return { mode, selectMode };
}

function applyFromEntityMode(
  value: string,
  applyMode: (next: ValueMode, nextValue: string) => void,
) {
  applyMode("fromEntity", isAutomationEntityPathRef(value) ? value : "");
}

function applyFromFieldMode(
  value: string,
  applyMode: (next: ValueMode, nextValue: string) => void,
) {
  applyMode("fromField", isAutomationFieldRef(value) ? value : "");
}

/** Type-aware value picker for automation `setField` / relation actions. */
export function ActionValueEditor({
  field,
  value,
  onChange,
  sourceFields,
  entities,
  className,
  mapToOtherEntity,
  sourceEntityId,
  compact = false,
}: ActionValueEditorProps) {
  if (!field) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        Сначала выберите поле
      </p>
    );
  }

  if (isEntityComputedFieldType(field.type) || field.type === "file") {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        Это поле нельзя задать действием
      </p>
    );
  }

  return (
    <ActionValueEditorBody
      key={field.id}
      field={field}
      value={value}
      onChange={onChange}
      sourceFields={sourceFields}
      entities={entities}
      className={className}
      mapToOtherEntity={mapToOtherEntity}
      sourceEntityId={sourceEntityId}
      compact={compact}
    />
  );
}

function ActionValueEditorBody({
  field,
  value,
  onChange,
  sourceFields,
  entities,
  className,
  mapToOtherEntity,
  sourceEntityId,
  compact,
}: {
  field: EntityField;
  value: string;
  onChange: (value: string) => void;
  sourceFields: EntityField[];
  entities: Entity[];
  className?: string;
  mapToOtherEntity?: boolean;
  sourceEntityId?: string;
  compact: boolean;
}) {
  const { mode, selectMode } = useEditorMode(value, field);
  const mapping = Boolean(mapToOtherEntity);
  const { fromFieldLabel, fromEntityLabel } = valueSourceLabels(compact);
  const excludeSourceFieldId = mapping ? undefined : field.id;
  const shellClass = compact
    ? cn(
        mode === "fromEntity"
          ? "grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)] gap-1.5"
          : "flex min-w-0 w-full flex-nowrap items-center gap-1.5",
        className,
      )
    : cn("flex flex-col gap-1.5", className);
  // Mode/type: content width; value pickers take the rest.
  const modeClass = compact ? "h-8 w-auto max-w-[11rem] shrink-0" : undefined;
  const valueGrowClass = compact ? "min-w-0 flex-1 overflow-hidden" : undefined;
  const customModeLabel = (full: string, short: string) =>
    mapping ? "Вручную" : compact ? short : full;
  const modeSelectValue = mode;

  const applyMode = (next: ValueMode, nextValue: string) => {
    onChange(selectMode(next, nextValue));
  };

  const sourceModeOptions = mapping
    ? [
        { value: "fromField", label: "Из источника" },
        { value: "fromEntity", label: "Из связанной сущности" },
      ]
    : [
        { value: "fromField", label: fromFieldLabel },
        { value: "fromEntity", label: fromEntityLabel },
      ];

  const handleSourceModePick = (next: string) => {
    if (next === "fromField") applyFromFieldMode(value, applyMode);
    else if (next === "fromEntity") applyFromEntityMode(value, applyMode);
  };

  const mappingSourceEntity = sourceEntityId
    ? (entities.find((entity) => entity.id === sourceEntityId) ?? null)
    : null;
  const mappingDirectFields = mapping
    ? compatibleNestedFields(field, sourceFields, { loose: true }).filter(
        (sourceField) => {
          // Bridges go to «Из связанной сущности», except when the field
          // itself is the value to copy (groups→groups, relation→relation).
          if (
            field.type === "relationGroups" &&
            sourceField.type === "relationGroups"
          ) {
            return true;
          }
          // Lead «Менеджер» / «ГИП» → Deal same fields: copy the relation id.
          if (
            (field.type === "relation" || field.type === "belonging") &&
            isEntityRelationLikeFieldType(sourceField.type) &&
            isTypeCompatibleSource(field, sourceField)
          ) {
            return true;
          }
          return !isBridgeSourceField(
            sourceField,
            entities,
            mappingSourceEntity,
          );
        },
      )
    : [];

  const fromEntityPicker =
    mode === "fromEntity" ? (
      <FromEntitySelects
        targetField={field}
        sourceFields={sourceFields}
        entities={entities}
        value={value}
        onChange={onChange}
        mapToOtherEntity={mapToOtherEntity}
        sourceEntityId={sourceEntityId}
        compact={compact}
        className={
          compact && mode === "fromEntity"
            ? undefined
            : compact
              ? "min-w-0 flex-1"
              : undefined
        }
      />
    ) : null;

  const fromFieldPicker =
    mode === "fromField" ? (
      <SourceFieldSelect
        className={valueGrowClass}
        fields={
          mapping
            ? mappingDirectFields
            : compatibleNestedFields(field, sourceFields, {
                loose: false,
              })
        }
        value={fieldRefId(value)}
        excludeFieldId={excludeSourceFieldId}
        onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
      />
    ) : null;

  if (field.type === "datetime") {
    const withTime = field.datetimeWithTime !== false;
    const { date, time } = splitDatetime(mode === "custom" ? value : "");
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={modeSelectValue}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "today", label: "Сегодня" },
            { value: "tomorrow", label: "Завтра" },
            ...(withTime ? [{ value: "now", label: "Сейчас" }] : []),
            {
              value: "custom",
              label: customModeLabel("Выбрать дату", "Дата"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "today") {
              applyMode("today", AUTOMATION_VALUE_TODAY);
            } else if (next === "tomorrow") {
              applyMode("tomorrow", AUTOMATION_VALUE_TOMORROW);
            } else if (next === "now") {
              applyMode("now", AUTOMATION_VALUE_NOW);
            } else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {mode === "custom" ? (
          withTime ? (
            <div
              className={cn(
                "grid grid-cols-[1.25fr_1fr] gap-1.5",
                valueGrowClass,
              )}
            >
              <DatePicker
                value={date}
                className="h-8"
                aria-label="Дата"
                onChange={(next) => onChange(joinDatetime(next, time))}
              />
              <TimePicker
                value={time}
                className="h-8"
                aria-label="Время"
                onChange={(next) => onChange(joinDatetime(date, next))}
              />
            </div>
          ) : (
            <DatePicker
              value={date || value}
              className={cn("h-8", valueGrowClass)}
              aria-label="Дата"
              onChange={onChange}
            />
          )
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "period") {
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={modeSelectValue}
          options={[
            { value: "empty", label: "Очистить" },
            {
              value: "custom",
              label: customModeLabel("Выбрать период", "Период"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {mode === "custom" ? (
          <DateRangePicker
            value={parseEntityPeriod(value)}
            className={cn("h-8", valueGrowClass)}
            aria-label="Период"
            placeholder="Начало — окончание"
            onChange={(next) => onChange(serializeEntityPeriod(next))}
          />
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={modeSelectValue}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "now", label: "Сейчас" },
            {
              value: "custom",
              label: customModeLabel("Выбрать время", "Время"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "now") {
              applyMode("now", AUTOMATION_VALUE_TIME_NOW);
            } else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {mode === "custom" ? (
          <TimePicker
            value={value}
            className={cn("h-8", valueGrowClass)}
            aria-label="Время"
            onChange={onChange}
          />
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "boolean") {
    const booleanMode =
      mode === "true" ||
      mode === "false" ||
      mode === "fromField" ||
      mode === "fromEntity" ||
      mode === "empty"
        ? mode
        : "empty";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={booleanMode}
          options={[
            { value: "empty", label: "Очистить" },
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "true") applyMode("true", "true");
            else if (next === "false") applyMode("false", "false");
            else handleSourceModePick(next);
          }}
        />
        {mode === "true" || mode === "false" ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">Значение</span>
            <Switch
              checked={value === "true"}
              onCheckedChange={(checked) =>
                onChange(checked ? "true" : "false")
              }
            />
          </div>
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "list") {
    const listOptions = resolveEntityListFieldOptions(field, entities);
    const presentation = resolveEntityListFieldPresentation(field, entities);
    const listMode =
      mode === "fromField" || mode === "fromEntity" || mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={listMode}
          options={[
            { value: "empty", label: "Очистить" },
            {
              value: "custom",
              label: customModeLabel("Выбрать вариант", "Вариант"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {listMode === "custom" ? (
          <ListSelect
            options={listOptions}
            value={value}
            multiple={presentation.listMultiple}
            allowOther={field.listAllowOther && !presentation.listMultiple}
            showColors={presentation.listUseColors}
            size="sm"
            emptyLabel="Не выбрано"
            aria-label="Значение списка"
            className={cn(
              "h-8 min-w-0 rounded-md border-input font-normal",
              valueGrowClass,
            )}
            onChange={onChange}
          />
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "relationGroups") {
    const groupsMode =
      mode === "fromField" || mode === "fromEntity" || mode === "empty"
        ? mode
        : "custom";
    const groupsReady = isEntityRelationGroupsConfigReady(field.relationGroups);
    const groupsCtx = getEntityValueContext(entities);
    const storedGroupsValue =
      isAutomationFieldRef(value) || isAutomationEntityPathRef(value)
        ? ""
        : value;
    return (
      <div
        className={cn(
          shellClass,
          groupsMode === "custom" && compact && "flex-col items-stretch gap-2",
        )}
      >
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={groupsMode}
          options={[
            { value: "empty", label: "Очистить" },
            {
              value: "custom",
              label: customModeLabel("Выбрать набор", "Набор"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode(
                "custom",
                mode === "custom" &&
                  !isAutomationFieldRef(value) &&
                  !isAutomationEntityPathRef(value)
                  ? value
                  : "",
              );
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {groupsMode === "custom" ? (
          groupsReady ? (
            <div
              className={cn(
                "min-w-0 rounded-md border border-border/80 bg-background p-2",
                compact ? "w-full" : valueGrowClass,
              )}
            >
              <RelationGroupsFieldControl
                id={`action-value-groups-${field.id}`}
                ctx={groupsCtx}
                field={field}
                value={storedGroupsValue}
                onChange={onChange}
                mode="full"
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Сначала настройте уровни поля «Наборы связей»
            </p>
          )
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    const target = entities.find((entity) => entity.id === targetId) ?? null;
    const isUsers = targetId === SYSTEM_USERS_ENTITY_ID;
    const canLinkCurrentRecord =
      Boolean(mapToOtherEntity) &&
      Boolean(sourceEntityId) &&
      targetId === sourceEntityId;
    const sourceEntity = canLinkCurrentRecord
      ? (entities.find((entity) => entity.id === sourceEntityId) ?? null)
      : null;
    const sourceEntityName = sourceEntity
      ? getEntityDisplayName(sourceEntity)
      : "запись";
    const relationMode =
      mode === "currentUser" ||
      mode === "currentRecord" ||
      mode === "fromField" ||
      mode === "fromEntity" ||
      mode === "empty"
        ? mode
        : "custom";
    const currentUserLabel = mapping
      ? "Текущий пользователь"
      : customModeLabel("Текущий пользователь", "Я");
    const currentRecordLabel = mapping
      ? `Текущая «${sourceEntityName}»`
      : customModeLabel(`Текущая «${sourceEntityName}»`, "Текущая");
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={relationMode}
          options={[
            { value: "empty", label: "Очистить" },
            ...(isUsers
              ? [{ value: "currentUser", label: currentUserLabel }]
              : []),
            ...(canLinkCurrentRecord
              ? [{ value: "currentRecord", label: currentRecordLabel }]
              : []),
            {
              value: "custom",
              label: customModeLabel("Выбрать запись", "Запись"),
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "currentUser") {
              applyMode("currentUser", AUTOMATION_VALUE_CURRENT_USER);
            } else if (next === "currentRecord") {
              applyMode("currentRecord", AUTOMATION_VALUE_CURRENT_RECORD);
            } else if (next === "custom") {
              applyMode(
                "custom",
                mode === "custom" &&
                  !isAutomationFieldRef(value) &&
                  !isAutomationEntityPathRef(value) &&
                  value !== AUTOMATION_VALUE_CURRENT_USER &&
                  value !== AUTOMATION_VALUE_CURRENT_RECORD
                  ? value
                  : "",
              );
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {relationMode === "custom" ? (
          <RelationSelect
            options={getRelationRecordOptions(target)}
            value={
              isAutomationFieldRef(value) ||
              isAutomationEntityPathRef(value) ||
              value === AUTOMATION_VALUE_CURRENT_USER ||
              value === AUTOMATION_VALUE_CURRENT_RECORD
                ? ""
                : value
            }
            multiple={field.relationMultiple}
            placeholder="Не выбран"
            aria-label="Запись"
            className={cn("h-8", valueGrowClass)}
            onChange={onChange}
          />
        ) : null}
        {mode === "fromField" ? (
          <SourceFieldSelect
            className={valueGrowClass}
            fields={
              mapping
                ? mappingDirectFields
                : compatibleNestedFields(field, sourceFields)
            }
            value={fieldRefId(value)}
            excludeFieldId={excludeSourceFieldId}
            entitySuffix={
              mapping
                ? mappingSourceEntity
                  ? getEntityDisplayName(mappingSourceEntity)
                  : undefined
                : isUsers
                  ? "пользователь"
                  : target
                    ? getEntityDisplayName(target)
                    : undefined
            }
            onChange={(fieldId) => onChange(toAutomationFieldRef(fieldId))}
          />
        ) : null}
        {fromEntityPicker}
      </div>
    );
  }

  if (field.type === "textarea") {
    const textMode =
      mode === "fromField" || mode === "fromEntity" || mode === "empty"
        ? mode
        : "custom";
    return (
      <div className={shellClass}>
        <ModeSelect
          className={modeClass}
          mapping={mapping}
          value={textMode}
          options={[
            { value: "empty", label: "Очистить" },
            {
              value: "custom",
              label: mapping ? "Вручную" : "Текст",
            },
            ...sourceModeOptions,
          ]}
          onChange={(next) => {
            if (next === "empty") applyMode("empty", "");
            else if (next === "custom") {
              applyMode("custom", mode === "custom" ? value : "");
            } else {
              handleSourceModePick(next);
            }
          }}
        />
        {textMode === "custom" ? (
          compact ? (
            <Input
              className={cn("h-8", valueGrowClass)}
              placeholder="Значение"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <Textarea
              className="min-h-16 resize-none text-sm"
              placeholder="Значение"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : null}
        {fromFieldPicker}
        {fromEntityPicker}
      </div>
    );
  }

  const inputMode =
    field.type === "number"
      ? "decimal"
      : field.type === "phone"
        ? "tel"
        : field.type === "email"
          ? "email"
          : undefined;

  const textMode =
    mode === "fromField" || mode === "fromEntity" || mode === "empty"
      ? mode
      : "custom";

  return (
    <div className={shellClass}>
      <ModeSelect
        className={modeClass}
        mapping={mapping}
        value={textMode}
        options={[
          { value: "empty", label: "Очистить" },
          {
            value: "custom",
            label: mapping ? "Вручную" : "Значение",
          },
          ...sourceModeOptions,
        ]}
        onChange={(next) => {
          if (next === "empty") applyMode("empty", "");
          else if (next === "custom") {
            applyMode("custom", mode === "custom" ? value : "");
          } else {
            handleSourceModePick(next);
          }
        }}
      />
      {textMode === "custom" ? (
        <Input
          className={cn("h-8", valueGrowClass)}
          type={field.type === "url" ? "url" : "text"}
          inputMode={inputMode}
          placeholder="Значение"
          value={value}
          onChange={(event) =>
            onChange(
              field.type === "number"
                ? normalizeEntityDecimalInput(event.target.value)
                : event.target.value,
            )
          }
        />
      ) : null}
      {fromFieldPicker}
      {fromEntityPicker}
    </div>
  );
}
