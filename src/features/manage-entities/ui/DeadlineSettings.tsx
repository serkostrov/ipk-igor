import {
  getEntityFieldDisplayName,
  type Entity,
  type EntityDeadlineConfig,
  type EntityField,
} from "@/entities/entity";
import { SettingSelect, SettingSwitch } from "@/shared/ui/setting-controls";

type DeadlineSettingsProps = {
  entity: Entity | null;
  value: EntityDeadlineConfig | null;
  onChange: (value: EntityDeadlineConfig | null) => void;
};

function toOptions(fields: EntityField[]) {
  return fields.map((field) => ({
    value: field.id,
    label: getEntityFieldDisplayName(field),
  }));
}

/** «Контроль срока» of a date field: what closes it and what marks it draft. */
export function DeadlineSettings({
  entity,
  value,
  onChange,
}: DeadlineSettingsProps) {
  const listFields =
    entity?.fields.filter(
      (field) => field.type === "list" && !field.listMultiple,
    ) ?? [];
  const booleanFields =
    entity?.fields.filter((field) => field.type === "boolean") ?? [];

  return (
    <div className="flex flex-col gap-2">
      <SettingSwitch
        id="entity-field-deadline"
        title="Контроль срока"
        description="Подсвечивать просроченные и близкие сроки"
        checked={value != null}
        onCheckedChange={(checked) =>
          onChange(
            checked
              ? {
                  doneListFieldId: null,
                  doneBooleanFieldId: null,
                  preliminaryFieldId: null,
                }
              : null,
          )
        }
      />
      {value && listFields.length > 0 ? (
        <SettingSelect
          id="entity-field-deadline-list"
          title="Выполнено по статусу"
          description="Завершающий вариант закрывает срок"
          value={value.doneListFieldId}
          options={toOptions(listFields)}
          emptyLabel="Не учитывать"
          onChange={(next) => onChange({ ...value, doneListFieldId: next })}
        />
      ) : null}
      {value && booleanFields.length > 0 ? (
        <SettingSelect
          id="entity-field-deadline-done"
          title="Выполнено по отметке"
          description="«Да» закрывает срок"
          value={value.doneBooleanFieldId}
          options={toOptions(booleanFields)}
          emptyLabel="Не учитывать"
          onChange={(next) => onChange({ ...value, doneBooleanFieldId: next })}
        />
      ) : null}
      {value && booleanFields.length > 0 ? (
        <SettingSelect
          id="entity-field-deadline-preliminary"
          title="Предварительный срок"
          description="«Да» — срок ещё не утверждён"
          value={value.preliminaryFieldId}
          options={toOptions(booleanFields)}
          emptyLabel="Нет"
          onChange={(next) => onChange({ ...value, preliminaryFieldId: next })}
        />
      ) : null}
    </div>
  );
}
