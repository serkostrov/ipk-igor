import { Link2 } from "lucide-react";
import {
  getEntityFieldDisplayName,
  isEntityLookupBridgeField,
  resolveEntityRelationBridgeTarget,
  resolveRelationGroupsBridgeEntityId,
  type Entity,
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

  const target = tabLinkTarget
    ? tabLinkTarget
    : entity && relationField
      ? resolveEntityRelationBridgeTarget(
          entity,
          relationField,
          entities,
          groupsDepth,
        )
      : null;
  const targetFields =
    target?.fields.filter(
      (field) => field.type !== "file" && field.type !== "dependencies",
    ) ?? [];

  const selectedRelation = tabLinkBridge
    ? {
        name: tabLinkBridge.label,
        targetName: tabLinkTarget ? entityLabel(tabLinkTarget) : null,
      }
    : relationField
      ? {
          name: getEntityFieldDisplayName(relationField),
          targetName: target
            ? entityLabel(target)
            : isGroupsBridge
              ? "набор связей"
              : null,
        }
      : null;

  const selectedTarget = targetFields.find(
    (field) => field.id === value?.targetFieldId,
  );
  const selectedTargetMeta = selectedTarget
    ? selectedTarget.type === "relationGroups"
      ? (() => {
          const leafId = resolveRelationGroupsBridgeEntityId(
            selectedTarget,
            entities,
          );
          const leaf = leafId
            ? entities.find((item) => item.id === leafId)
            : null;
          return {
            name: getEntityFieldDisplayName(selectedTarget),
            suffix: leaf ? `набор · ${entityLabel(leaf)}` : "набор связей",
          };
        })()
      : {
          name: getEntityFieldDisplayName(selectedTarget),
          suffix: null as string | null,
        }
    : null;

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
              onChange({
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
            onChange({
              ...value,
              relationGroupsDepth: depth,
              targetFieldId: "",
            });
          }}
        />
      ) : null}

      {relationField || tabLinkBridge ? (
        <div className="flex flex-col gap-1.5">
          <SettingLabel
            htmlFor="entity-field-lookup-target"
            title="Поле"
            description={
              target
                ? isGroupsBridge
                  ? `Из «${entityLabel(target)}» (${relationGroupsLevelLabel(groupsDepth ?? 0).toLowerCase()})`
                  : `Значение из «${entityLabel(target)}»`
                : "Значение связанной записи"
            }
          />
          <Select
            value={value?.targetFieldId || undefined}
            onValueChange={(next) => {
              if (!next) return;
              onChange({
                relationFieldId:
                  value?.relationFieldId || tabLinkBridge?.fieldId || "",
                targetFieldId: String(next),
                ...(value?.relationGroupsDepth != null
                  ? { relationGroupsDepth: value.relationGroupsDepth }
                  : {}),
              });
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
              {targetFields.map((field) => {
                if (field.type === "relationGroups") {
                  const leafId = resolveRelationGroupsBridgeEntityId(
                    field,
                    entities,
                  );
                  const leaf = leafId
                    ? entities.find((item) => item.id === leafId)
                    : null;
                  const name = getEntityFieldDisplayName(field);
                  const suffix = leaf
                    ? `набор · ${entityLabel(leaf)}`
                    : "набор связей";
                  return (
                    <SelectItem
                      key={field.id}
                      value={field.id}
                      label={`${name} ${suffix}`}
                    >
                      <RelationLinkLabel fieldName={name} targetName={suffix} />
                    </SelectItem>
                  );
                }
                const name = getEntityFieldDisplayName(field);
                return (
                  <SelectItem key={field.id} value={field.id} label={name}>
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {targetFields.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {isGroupsBridge
                ? "У выбранного уровня нет полей"
                : "У связанной сущности нет полей"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
