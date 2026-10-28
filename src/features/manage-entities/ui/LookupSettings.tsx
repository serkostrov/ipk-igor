import { ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  isEntityLookupBridgeField,
  resolveEntityRelationBridgeTarget,
  resolveRelationGroupsBridgeEntityId,
  type Entity,
  type EntityField,
  type EntityLookupConfig,
} from "@/entities/entity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { SettingLabel, SettingSelect } from "@/shared/ui/setting-controls";
import { cn } from "@/shared/lib/cn";

type LookupSettingsProps = {
  entity: Entity | null;
  entities: Entity[];
  value: EntityLookupConfig | null;
  onChange: (value: EntityLookupConfig) => void;
  /**
   * Tab-link relation → lookup: bridge stays the preserved link field;
   * only the target field on the parent entity is chosen here.
   */
  tabLinkBridge?: {
    fieldId: string;
    label: string;
    targetEntityId: string;
  } | null;
};

function entityLabel(entity: Pick<Entity, "name" | "namePlural">) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

function relationGroupsLevelLabel(index: number) {
  return index === 0 ? "Строки" : "Вложенные";
}

function isDrillableField(field: EntityField) {
  return field.type === "relation" || field.type === "relationGroups";
}

function pickableFields(entity: Entity | null | undefined): EntityField[] {
  return (
    entity?.fields.filter(
      (field) => field.type !== "file" && field.type !== "dependencies",
    ) ?? []
  );
}

/** Same pattern as field cards: name + Link2 + target entity. */
function RelationLinkLabel({
  fieldName,
  targetName,
}: {
  fieldName: string;
  targetName?: string | null;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{fieldName}</span>
      {targetName ? (
        <span className="inline-flex min-w-0 items-center gap-0.5 text-muted-foreground">
          <Link2 className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{targetName}</span>
        </span>
      ) : null}
    </span>
  );
}

function baseLookupValue(
  value: EntityLookupConfig | null,
  tabLinkBridge: LookupSettingsProps["tabLinkBridge"],
): EntityLookupConfig {
  return {
    relationFieldId: value?.relationFieldId || tabLinkBridge?.fieldId || "",
    targetFieldId: value?.targetFieldId ?? "",
    ...(value?.relationGroupsDepth != null
      ? { relationGroupsDepth: value.relationGroupsDepth }
      : {}),
  };
}

/** Bridge of this entity → field of the related / nested entity. */
export function LookupSettings({
  entity,
  entities,
  value,
  onChange,
  tabLinkBridge = null,
}: LookupSettingsProps) {
  // Relations, relationGroups, lookups that yield relation ids.
  const relationFields =
    entity?.fields.filter((field) =>
      isEntityLookupBridgeField(entity, field, entities),
    ) ?? [];
  const tabLinkTarget = tabLinkBridge
    ? (entities.find((item) => item.id === tabLinkBridge.targetEntityId) ??
      null)
    : null;
  const relationField = tabLinkBridge
    ? null
    : relationFields.find((field) => field.id === value?.relationFieldId);
  const isGroupsBridge = relationField?.type === "relationGroups";
  const groupsLevels = relationField?.relationGroups?.levels ?? [];
  const groupsDepth =
    value?.relationGroupsDepth ??
    (isGroupsBridge ? Math.max(0, groupsLevels.length - 1) : undefined);

  const bridgeTarget = tabLinkTarget
    ? tabLinkTarget
    : entity && relationField
      ? resolveEntityRelationBridgeTarget(
          entity,
          relationField,
          entities,
          groupsDepth,
        )
      : null;

  const viaFieldId = value?.viaFieldId?.trim() || "";
  const viaField = viaFieldId
    ? (bridgeTarget?.fields.find((field) => field.id === viaFieldId) ?? null)
    : null;
  const viaLevels = viaField?.relationGroups?.levels ?? [];
  const viaDepth =
    value?.viaRelationGroupsDepth ??
    (viaField?.type === "relationGroups"
      ? Math.max(0, viaLevels.length - 1)
      : undefined);

  const leafTarget = (() => {
    if (!viaField || !bridgeTarget) return bridgeTarget;
    if (viaField.type === "relation") {
      const targetId = getEntityRelationTargetId(viaField);
      return entities.find((item) => item.id === targetId) ?? null;
    }
    if (viaField.type === "relationGroups") {
      const targetId = resolveRelationGroupsBridgeEntityId(
        viaField,
        entities,
        viaDepth,
      );
      return targetId
        ? (entities.find((item) => item.id === targetId) ?? null)
        : null;
    }
    return null;
  })();

  const rootFields = pickableFields(bridgeTarget);
  const leafFields = pickableFields(leafTarget);
  const fieldOptions = viaField ? leafFields : rootFields;

  const selectedRelation = tabLinkBridge
    ? {
        name: tabLinkBridge.label,
        targetName: tabLinkTarget ? entityLabel(tabLinkTarget) : null,
      }
    : relationField
      ? {
          name: getEntityFieldDisplayName(relationField),
          targetName: bridgeTarget
            ? entityLabel(bridgeTarget)
            : isGroupsBridge
              ? "набор связей"
              : null,
        }
      : null;

  const selectedTarget = viaField
    ? leafFields.find((field) => field.id === value?.targetFieldId)
    : rootFields.find((field) => field.id === value?.targetFieldId);

  const selectedTargetMeta = (() => {
    if (viaField && leafTarget) {
      const viaName = getEntityFieldDisplayName(viaField);
      if (selectedTarget) {
        return {
          name: getEntityFieldDisplayName(selectedTarget),
          suffix: `${viaName} · ${entityLabel(leafTarget)}`,
        };
      }
      return {
        name: viaName,
        suffix:
          viaField.type === "relationGroups"
            ? `набор · ${entityLabel(leafTarget)}`
            : entityLabel(leafTarget),
      };
    }
    if (!selectedTarget) return null;
    if (selectedTarget.type === "relationGroups") {
      const leafId = resolveRelationGroupsBridgeEntityId(
        selectedTarget,
        entities,
      );
      const leaf = leafId ? entities.find((item) => item.id === leafId) : null;
      return {
        name: getEntityFieldDisplayName(selectedTarget),
        suffix: leaf ? `набор · ${entityLabel(leaf)}` : "набор связей",
      };
    }
    if (selectedTarget.type === "relation") {
      const targetId = getEntityRelationTargetId(selectedTarget);
      const related = targetId
        ? entities.find((item) => item.id === targetId)
        : null;
      return {
        name: getEntityFieldDisplayName(selectedTarget),
        suffix: related ? entityLabel(related) : null,
      };
    }
    return {
      name: getEntityFieldDisplayName(selectedTarget),
      suffix: null as string | null,
    };
  })();

  function commit(next: EntityLookupConfig) {
    onChange(next);
  }

  function drillInto(field: EntityField) {
    const nextDepth =
      field.type === "relationGroups"
        ? Math.max(0, (field.relationGroups?.levels.length ?? 1) - 1)
        : undefined;
    commit({
      ...baseLookupValue(value, tabLinkBridge),
      viaFieldId: field.id,
      targetFieldId: "",
      ...(nextDepth != null ? { viaRelationGroupsDepth: nextDepth } : {}),
    });
  }

  function exitDrill() {
    commit({
      ...baseLookupValue(value, tabLinkBridge),
      targetFieldId: "",
    });
  }

  function pickWholeViaField() {
    if (!viaField) return;
    commit({
      ...baseLookupValue(value, tabLinkBridge),
      targetFieldId: viaField.id,
    });
  }

  function pickLeafField(fieldId: string) {
    if (!viaField) {
      commit({
        ...baseLookupValue(value, tabLinkBridge),
        targetFieldId: fieldId,
      });
      return;
    }
    commit({
      ...baseLookupValue(value, tabLinkBridge),
      viaFieldId: viaField.id,
      targetFieldId: fieldId,
      ...(viaField.type === "relationGroups" && viaDepth != null
        ? { viaRelationGroupsDepth: viaDepth }
        : {}),
    });
  }

  const fieldDescription = (() => {
    if (!leafTarget) return "Значение связанной записи";
    if (viaField) {
      return `Из «${entityLabel(leafTarget)}» через «${getEntityFieldDisplayName(viaField)}»`;
    }
    if (isGroupsBridge) {
      return `Из «${entityLabel(leafTarget)}» (${relationGroupsLevelLabel(groupsDepth ?? 0).toLowerCase()})`;
    }
    return `Значение из «${entityLabel(leafTarget)}»`;
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-lookup-relation"
          title="Связь"
          description={
            tabLinkBridge
              ? "Связь вкладки сохранится — по ней подставляется значение"
              : "Поле связи или наборов связей этой сущности"
          }
        />
        {tabLinkBridge ? (
          <div
            id="entity-field-lookup-relation"
            className="flex h-8 items-center rounded-md border border-border bg-muted/40 px-2.5 text-sm"
          >
            <RelationLinkLabel
              fieldName={selectedRelation?.name ?? tabLinkBridge.label}
              targetName={selectedRelation?.targetName}
            />
          </div>
        ) : relationFields.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
            Сначала добавьте «Связь» или «Наборы связей»
          </div>
        ) : (
          <Select
            value={value?.relationFieldId || undefined}
            onValueChange={(next) => {
              if (next == null || next === "") return;
              const nextBridge = relationFields.find(
                (field) => field.id === String(next),
              );
              const nextDepth =
                nextBridge?.type === "relationGroups"
                  ? Math.max(
                      0,
                      (nextBridge.relationGroups?.levels.length ?? 1) - 1,
                    )
                  : undefined;
              commit({
                relationFieldId: String(next),
                targetFieldId: "",
                ...(nextDepth != null
                  ? { relationGroupsDepth: nextDepth }
                  : {}),
              });
            }}
          >
            <SelectTrigger
              id="entity-field-lookup-relation"
              size="sm"
              className="w-full"
              aria-label="Связь"
            >
              <SelectValue placeholder="Выберите">
                {selectedRelation ? (
                  <RelationLinkLabel
                    fieldName={selectedRelation.name}
                    targetName={selectedRelation.targetName}
                  />
                ) : (
                  <span className="text-muted-foreground">Выберите</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {relationFields.map((field) => {
                const fieldTarget = entity
                  ? resolveEntityRelationBridgeTarget(
                      entity,
                      field,
                      entities,
                      field.type === "relationGroups"
                        ? Math.max(
                            0,
                            (field.relationGroups?.levels.length ?? 1) - 1,
                          )
                        : undefined,
                    )
                  : null;
                const fieldName = getEntityFieldDisplayName(field);
                const targetName =
                  field.type === "relationGroups"
                    ? fieldTarget
                      ? `набор · ${entityLabel(fieldTarget)}`
                      : "набор связей"
                    : fieldTarget
                      ? entityLabel(fieldTarget)
                      : null;
                return (
                  <SelectItem
                    key={field.id}
                    value={field.id}
                    label={[fieldName, targetName].filter(Boolean).join(" ")}
                  >
                    <RelationLinkLabel
                      fieldName={fieldName}
                      targetName={targetName}
                    />
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {isGroupsBridge && groupsLevels.length > 0 && value ? (
        <SettingSelect
          id="entity-field-lookup-groups-depth"
          title="Уровень набора"
          description="Строки или вложенные записи набора связей"
          value={String(groupsDepth ?? 0)}
          options={groupsLevels.map((_, index) => ({
            value: String(index),
            label: relationGroupsLevelLabel(index),
          }))}
          onChange={(next) => {
            if (next == null) return;
            const depth = Number.parseInt(next, 10);
            if (!Number.isFinite(depth)) return;
            commit({
              relationFieldId: value.relationFieldId,
              targetFieldId: "",
              relationGroupsDepth: depth,
            });
          }}
        />
      ) : null}

      {relationField || tabLinkBridge ? (
        <div className="flex flex-col gap-1.5">
          <SettingLabel
            htmlFor="entity-field-lookup-target"
            title="Поле"
            description={fieldDescription}
          />

          {viaField ? (
            <div className="flex flex-col gap-1.5 rounded-md border border-border/80 bg-muted/20 p-1.5">
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                onClick={exitDrill}
              >
                <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {bridgeTarget ? entityLabel(bridgeTarget) : "Назад"}
                </span>
                <span className="text-muted-foreground/60">/</span>
                <span className="truncate font-medium text-foreground">
                  {getEntityFieldDisplayName(viaField)}
                </span>
              </button>

              {viaField.type === "relationGroups" && viaLevels.length > 0 ? (
                <SettingSelect
                  id="entity-field-lookup-via-depth"
                  title="Уровень набора"
                  description="Строки или вложенные записи"
                  value={String(viaDepth ?? 0)}
                  options={viaLevels.map((_, index) => ({
                    value: String(index),
                    label: relationGroupsLevelLabel(index),
                  }))}
                  onChange={(next) => {
                    if (next == null || !viaField) return;
                    const depth = Number.parseInt(next, 10);
                    if (!Number.isFinite(depth)) return;
                    commit({
                      ...baseLookupValue(value, tabLinkBridge),
                      viaFieldId: viaField.id,
                      viaRelationGroupsDepth: depth,
                      targetFieldId: "",
                    });
                  }}
                />
              ) : null}

              <button
                type="button"
                className={cn(
                  "flex h-8 w-full items-center rounded-md border px-2.5 text-left text-sm transition-colors",
                  !value?.targetFieldId || value.targetFieldId === viaField.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40",
                )}
                onClick={pickWholeViaField}
              >
                <RelationLinkLabel
                  fieldName={
                    viaField.type === "relationGroups"
                      ? "Весь набор"
                      : "Вся связь"
                  }
                  targetName={
                    leafTarget
                      ? entityLabel(leafTarget)
                      : getEntityFieldDisplayName(viaField)
                  }
                />
              </button>
            </div>
          ) : null}

          <Select
            // Remount when entering/leaving a via-hop so Select value resets cleanly.
            key={viaField ? `via:${viaField.id}` : "root"}
            value={
              viaField && value?.targetFieldId === viaField.id
                ? undefined
                : value?.targetFieldId || undefined
            }
            onValueChange={(next) => {
              if (!next) return;
              const fieldId = String(next);
              const field = fieldOptions.find((item) => item.id === fieldId);
              if (!viaField && field && isDrillableField(field)) {
                drillInto(field);
                return;
              }
              pickLeafField(fieldId);
            }}
          >
            <SelectTrigger
              id="entity-field-lookup-target"
              size="sm"
              className="w-full"
              aria-label="Поле"
            >
              <SelectValue placeholder="Выберите">
                {selectedTargetMeta ? (
                  selectedTargetMeta.suffix ? (
                    <RelationLinkLabel
                      fieldName={selectedTargetMeta.name}
                      targetName={selectedTargetMeta.suffix}
                    />
                  ) : (
                    selectedTargetMeta.name
                  )
                ) : (
                  <span className="text-muted-foreground">Выберите</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((field) => {
                const name = getEntityFieldDisplayName(field);
                if (!viaField && isDrillableField(field)) {
                  const nested =
                    field.type === "relationGroups"
                      ? (() => {
                          const leafId = resolveRelationGroupsBridgeEntityId(
                            field,
                            entities,
                          );
                          const leaf = leafId
                            ? entities.find((item) => item.id === leafId)
                            : null;
                          return leaf
                            ? `набор · ${entityLabel(leaf)}`
                            : "набор связей";
                        })()
                      : (() => {
                          const targetId = getEntityRelationTargetId(field);
                          const related = targetId
                            ? entities.find((item) => item.id === targetId)
                            : null;
                          return related ? entityLabel(related) : null;
                        })();
                  return (
                    <SelectItem
                      key={field.id}
                      value={field.id}
                      label={`${name} ${nested ?? ""}`.trim()}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <RelationLinkLabel
                          fieldName={name}
                          targetName={nested}
                        />
                        <ChevronRight
                          className="size-3.5 shrink-0 text-muted-foreground/70"
                          aria-hidden
                        />
                      </span>
                    </SelectItem>
                  );
                }
                return (
                  <SelectItem key={field.id} value={field.id} label={name}>
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {!viaField && selectedTarget && isDrillableField(selectedTarget) ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 self-start rounded-md px-1.5 text-[11px] text-primary transition-colors hover:bg-primary/5"
              onClick={() => drillInto(selectedTarget)}
            >
              Выбрать поле из вложенных
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            </button>
          ) : null}

          {fieldOptions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {viaField || isGroupsBridge
                ? "У выбранного уровня нет полей"
                : "У связанной сущности нет полей"}
            </p>
          ) : !viaField ? (
            <p className="text-[11px] text-muted-foreground">
              Связь или набор — откройте, чтобы выбрать вложенное поле
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
