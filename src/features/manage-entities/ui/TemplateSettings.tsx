import { Link2 } from "lucide-react";
import {
  getEntityFieldDisplayName,
  getEntityFieldValueKind,
  getEntityRelationTargetId,
  type Entity,
  type EntityTemplateConfig,
} from "@/entities/entity";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { SettingLabel, SettingSelect } from "@/shared/ui/setting-controls";

type TemplateSettingsProps = {
  entity: Entity | null;
  entities: Entity[];
  /** Field being edited — excluded from bridge candidates. */
  fieldId: string | null;
  value: EntityTemplateConfig | null;
  onChange: (value: EntityTemplateConfig) => void;
  /** Target entity of the template source field (Отдел). */
  onTargetEntityIdChange: (entityId: string | null) => void;
};

function entityLabel(entity: Pick<Entity, "name" | "namePlural">) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

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

/** Bridge relation → field on related record that supplies option ids. */
export function TemplateSettings({
  entity,
  entities,
  fieldId,
  value,
  onChange,
  onTargetEntityIdChange,
}: TemplateSettingsProps) {
  const bridgeFields =
    entity?.fields.filter(
      (field) => field.type === "relation" && field.id !== fieldId,
    ) ?? [];
  const bridgeField = bridgeFields.find(
    (field) => field.id === value?.bridgeFieldId,
  );
  const bridgeTargetId = bridgeField
    ? getEntityRelationTargetId(bridgeField)
    : null;
  const bridgeTarget = bridgeTargetId
    ? (entities.find((item) => item.id === bridgeTargetId) ?? null)
    : null;

  const sourceFields =
    bridgeTarget?.fields.filter((field) => {
      const kind = getEntityFieldValueKind(bridgeTarget, field, entities);
      return kind === "relation" || kind === "list";
    }) ?? [];
  const sourceField = sourceFields.find(
    (field) => field.id === value?.sourceFieldId,
  );

  function resolveSourceTargetId(sourceFieldId: string): string | null {
    if (!bridgeTarget) return null;
    const source = bridgeTarget.fields.find(
      (item) => item.id === sourceFieldId,
    );
    if (!source) return null;
    if (source.type === "relation" || source.type === "template") {
      return getEntityRelationTargetId(source);
    }
    // List-valued source — options are option ids, not entity records.
    // Template field stores relation-like ids; only relation sources are valid.
    return null;
  }

  const selectedBridge = bridgeField
    ? {
        name: getEntityFieldDisplayName(bridgeField),
        targetName: bridgeTarget ? entityLabel(bridgeTarget) : null,
      }
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-template-bridge"
          title="Связь"
          description="Сначала выбирается в этой записи (например, Стадия)"
        />
        {bridgeFields.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 bg-background/70 px-2.5 py-2 text-center text-[11px] leading-snug text-muted-foreground">
            Сначала добавьте поле типа «Связь»
          </div>
        ) : (
          <Select
            value={value?.bridgeFieldId || undefined}
            onValueChange={(next) => {
              if (next == null || next === "") return;
              onChange({ bridgeFieldId: String(next), sourceFieldId: "" });
              onTargetEntityIdChange(null);
            }}
          >
            <SelectTrigger
              id="entity-field-template-bridge"
              size="sm"
              className="w-full"
              aria-label="Связь"
            >
              <SelectValue placeholder="Выберите">
                {selectedBridge ? (
                  <RelationLinkLabel
                    fieldName={selectedBridge.name}
                    targetName={selectedBridge.targetName}
                  />
                ) : (
                  <span className="text-muted-foreground">Выберите</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {bridgeFields.map((field) => {
                const targetId = getEntityRelationTargetId(field);
                const target = targetId
                  ? entities.find((item) => item.id === targetId)
                  : null;
                const fieldName = getEntityFieldDisplayName(field);
                const targetName = target ? entityLabel(target) : null;
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

      {bridgeField ? (
        <SettingSelect
          id="entity-field-template-source"
          title="Поле шаблона"
          description={
            bridgeTarget
              ? `Варианты из «${entityLabel(bridgeTarget)}»`
              : "Варианты из выбранной записи"
          }
          value={value?.sourceFieldId || null}
          options={sourceFields
            .filter((field) => field.type === "relation")
            .map((field) => ({
              value: field.id,
              label: getEntityFieldDisplayName(field),
            }))}
          noOptionsLabel="У связанной сущности нет полей-связей"
          onChange={(next) => {
            if (!next || !value) return;
            onChange({ ...value, sourceFieldId: next });
            onTargetEntityIdChange(resolveSourceTargetId(next));
          }}
        />
      ) : null}

      {sourceField && bridgeField && bridgeTarget ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          В записи сначала выбирают «{getEntityFieldDisplayName(bridgeField)}»,
          затем варианты из «{getEntityFieldDisplayName(sourceField)}»
        </p>
      ) : null}
    </div>
  );
}
