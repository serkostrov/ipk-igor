import { Link2 } from "lucide-react";
import {
  getEntityFieldDisplayName,
  isEntityLookupBridgeField,
  resolveEntityRelationBridgeTarget,
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
};

function entityLabel(entity: Pick<Entity, "name" | "namePlural">) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
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
}: LookupSettingsProps) {
  // Relations, relationGroups (nested), lookups that yield relation ids.
  const relationFields =
    entity?.fields.filter((field) =>
      isEntityLookupBridgeField(entity, field, entities),
    ) ?? [];
  const relationField = relationFields.find(
    (field) => field.id === value?.relationFieldId,
  );
  const target =
    entity && relationField
      ? resolveEntityRelationBridgeTarget(entity, relationField, entities)
      : null;
  const targetFields =
    target?.fields.filter(
      (field) =>
        field.type !== "file" &&
        field.type !== "dependencies" &&
        field.type !== "relationGroups",
    ) ?? [];

  const isGroupsBridge = relationField?.type === "relationGroups";
  const selectedRelation = relationField
    ? {
        name: getEntityFieldDisplayName(relationField),
        targetName: target ? entityLabel(target) : null,
      }
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-lookup-relation"
          title="Связь"
          description="Поле связи или наборов связей этой сущности"
        />
        {relationFields.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
            Сначала добавьте «Связь» или «Наборы связей»
          </div>
        ) : (
          <Select
            value={value?.relationFieldId || undefined}
            onValueChange={(next) => {
              if (next == null || next === "") return;
              onChange({ relationFieldId: String(next), targetFieldId: "" });
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
                  ? resolveEntityRelationBridgeTarget(entity, field, entities)
                  : null;
                const fieldName = getEntityFieldDisplayName(field);
                const targetName = fieldTarget
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

      {relationField ? (
        <SettingSelect
          id="entity-field-lookup-target"
          title="Поле"
          description={
            target
              ? isGroupsBridge
                ? `Из вложенных «${entityLabel(target)}» в наборах`
                : `Значение из «${entityLabel(target)}»`
              : "Значение связанной записи"
          }
          value={value?.targetFieldId || null}
          options={targetFields.map((field) => ({
            value: field.id,
            label: getEntityFieldDisplayName(field),
          }))}
          noOptionsLabel={
            isGroupsBridge
              ? "У вложенной сущности нет полей"
              : "У связанной сущности нет полей"
          }
          onChange={(next) => {
            if (next && value) onChange({ ...value, targetFieldId: next });
          }}
        />
      ) : null}
    </div>
  );
}
