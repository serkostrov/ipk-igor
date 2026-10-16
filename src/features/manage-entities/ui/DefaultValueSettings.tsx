import { Input } from "@/shared/ui/input";
import {
  ListSelect,
  normalizeEntityDecimalInput,
  parseEntityListValueIds,
  type EntityFieldDefaultValue,
  type EntityFieldType,
  type EntityListOption,
} from "@/entities/entity";
import {
  SettingLabel,
  SettingSelect,
  SettingSwitch,
} from "@/shared/ui/setting-controls";

type DefaultValueSettingsProps = {
  type: EntityFieldType;
  datetimeWithTime: boolean;
  listOptions: EntityListOption[];
  listMultiple: boolean;
  listAllowOther?: boolean;
  listUseColors?: boolean;
  value: EntityFieldDefaultValue | null;
  onChange: (value: EntityFieldDefaultValue | null) => void;
};

const TITLE = "По умолчанию";
const DESCRIPTION = "Подставляется в новую запись";

function constantOf(value: EntityFieldDefaultValue | null) {
  return value?.kind === "value" ? value.value : "";
}

function toConstant(value: string): EntityFieldDefaultValue | null {
  return value ? { kind: "value", value } : null;
}

/** Default for new records, by field type. */
export function DefaultValueSettings({
  type,
  datetimeWithTime,
  listOptions,
  listMultiple,
  listAllowOther = false,
  listUseColors = false,
  value,
  onChange,
}: DefaultValueSettingsProps) {
  if (type === "datetime") {
    return (
      <SettingSelect
        id="entity-field-default"
        title={TITLE}
        description={DESCRIPTION}
        value={
          value?.kind === "today" || value?.kind === "now" ? value.kind : null
        }
        options={[
          { value: "today", label: "Сегодня" },
          ...(datetimeWithTime ? [{ value: "now", label: "Сейчас" }] : []),
        ]}
        emptyLabel="Не заполнять"
        onChange={(next) =>
          onChange(next === "today" || next === "now" ? { kind: next } : null)
        }
      />
    );
  }

  if (type === "time") {
    return (
      <SettingSelect
        id="entity-field-default"
        title={TITLE}
        description={DESCRIPTION}
        value={value?.kind === "now" ? "now" : null}
        options={[{ value: "now", label: "Сейчас" }]}
        emptyLabel="Не заполнять"
        onChange={(next) => onChange(next === "now" ? { kind: "now" } : null)}
      />
    );
  }

  if (type === "relation") {
    return (
      <SettingSwitch
        id="entity-field-default"
        title="Текущий пользователь"
        description="Подставлять в новую запись"
        checked={value?.kind === "currentUser"}
        onCheckedChange={(checked) =>
          onChange(checked ? { kind: "currentUser" } : null)
        }
      />
    );
  }

  if (type === "boolean") {
    return (
      <SettingSwitch
        id="entity-field-default"
        title="Включено по умолчанию"
        description="Значение «Да» в новой записи"
        checked={constantOf(value) === "true"}
        onCheckedChange={(checked) =>
          onChange(toConstant(checked ? "true" : ""))
        }
      />
    );
  }

  if (type === "list") {
    const raw = constantOf(value);
    const selectedId = listMultiple
      ? (parseEntityListValueIds(raw)[0] ?? "")
      : raw;

    return (
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-default"
          title={TITLE}
          description={DESCRIPTION}
        />
        <ListSelect
          options={listOptions}
          value={selectedId}
          multiple={false}
          allowOther={listAllowOther && !listMultiple}
          showColors={listUseColors}
          size="sm"
          emptyLabel="Не заполнять"
          aria-label={TITLE}
          className="h-8 rounded-md border-input font-normal"
          onChange={(next) => onChange(toConstant(next))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SettingLabel
        htmlFor="entity-field-default"
        title={TITLE}
        description={DESCRIPTION}
      />
      <Input
        id="entity-field-default"
        type="text"
        inputMode={type === "number" ? "decimal" : undefined}
        value={constantOf(value)}
        placeholder="Не заполнять"
        className="h-8"
        onChange={(event) =>
          onChange(
            toConstant(
              type === "number"
                ? normalizeEntityDecimalInput(event.target.value)
                : event.target.value,
            ),
          )
        }
      />
    </div>
  );
}
