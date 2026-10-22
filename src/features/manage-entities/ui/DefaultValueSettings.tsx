import { Input } from "@/shared/ui/input";
import { DateRangePicker } from "@/shared/ui/date-range-picker";
import {
  normalizeEntityDecimalInput,
  parseEntityListValueIds,
  parseEntityPeriod,
  parseEntityRelationIds,
  RelationSelect,
  ListSelect,
  serializeEntityPeriod,
  type EntityFieldDefaultValue,
  type EntityFieldType,
  type EntityListOption,
  type RelationRecordOption,
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
  /** Relation target options (records of the linked entity). */
  relationOptions?: RelationRecordOption[];
  relationMultiple?: boolean;
  /** Target is Users — offer «Текущий пользователь». */
  relationToUsers?: boolean;
  value: EntityFieldDefaultValue | null;
  onChange: (value: EntityFieldDefaultValue | null) => void;
};

const TITLE = "По умолчанию";
const DESCRIPTION = "Подставляется в новую запись — можно изменить";

/** Match display-field pickers in RelationGroupsSettings. */
const SETTINGS_SELECT_CLASS =
  "h-8 bg-background hover:bg-background aria-expanded:bg-background";

function constantOf(value: EntityFieldDefaultValue | null) {
  return value?.kind === "value" ? value.value : "";
}

function toConstant(value: string): EntityFieldDefaultValue | null {
  return value.trim().length > 0 ? { kind: "value", value } : null;
}

/** Default for new records, by field type. */
export function DefaultValueSettings({
  type,
  datetimeWithTime,
  listOptions,
  listMultiple,
  listAllowOther = false,
  listUseColors = false,
  relationOptions = [],
  relationMultiple = false,
  relationToUsers = false,
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

  if (type === "period") {
    return (
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-default"
          title={TITLE}
          description={DESCRIPTION}
        />
        <DateRangePicker
          id="entity-field-default"
          value={parseEntityPeriod(constantOf(value))}
          placeholder="Не заполнять"
          aria-label={TITLE}
          className={SETTINGS_SELECT_CLASS}
          onChange={(next) => onChange(toConstant(serializeEntityPeriod(next)))}
        />
      </div>
    );
  }

  if (type === "relation" || type === "belonging") {
    const isCurrentUser = type === "relation" && value?.kind === "currentUser";
    const raw = isCurrentUser ? "" : constantOf(value);
    const multiple = type === "belonging" ? false : relationMultiple;
    const selectedCount = parseEntityRelationIds(raw).length;
    const description = multiple
      ? "Предзаполняются в новой записи"
      : DESCRIPTION;

    return (
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-default"
          title={TITLE}
          description={description}
        />
        {type === "relation" && relationToUsers ? (
          <SettingSwitch
            id="entity-field-default-current-user"
            title="Текущий пользователь"
            description="Подставить того, кто создаёт запись"
            checked={isCurrentUser}
            onCheckedChange={(checked) =>
              onChange(checked ? { kind: "currentUser" } : null)
            }
          />
        ) : null}
        {isCurrentUser ? null : (
          <RelationSelect
            id="entity-field-default"
            options={relationOptions}
            value={raw}
            multiple={multiple}
            placeholder="Не заполнять"
            aria-label={TITLE}
            className={SETTINGS_SELECT_CLASS}
            onChange={(next) => onChange(toConstant(next))}
          />
        )}
        {!isCurrentUser && multiple && selectedCount > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Выбрано: {selectedCount}
          </p>
        ) : null}
      </div>
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

    return (
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-default"
          title={TITLE}
          description={
            listMultiple ? "Предзаполняются в новой записи" : DESCRIPTION
          }
        />
        <ListSelect
          options={listOptions}
          value={raw}
          multiple={listMultiple}
          allowEmpty
          allowOther={listAllowOther && !listMultiple}
          showColors={listUseColors}
          size="sm"
          emptyLabel="Не заполнять"
          aria-label={TITLE}
          className="min-h-8 rounded-md border-input font-normal"
          onChange={(next) => onChange(toConstant(next))}
        />
        {listMultiple && parseEntityListValueIds(raw).length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Выбрано: {parseEntityListValueIds(raw).length}
          </p>
        ) : null}
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
