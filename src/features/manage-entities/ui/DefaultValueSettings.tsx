import { useMemo } from "react";
import { Input } from "@/shared/ui/input";
import {
  getEntityValueContext,
  ListSelect,
  normalizeEntityDecimalInput,
  parseEntityListValueIds,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  RelationGroupsFieldControl,
  RelationSelect,
  type Entity,
  type EntityField,
  type EntityFieldDefaultValue,
  type EntityFieldType,
  type EntityListOption,
  type EntityRelationGroupsConfig,
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
  /** Config for `relationGroups` defaults. */
  relationGroups?: EntityRelationGroupsConfig | null;
  entities?: Entity[];
  value: EntityFieldDefaultValue | null;
  onChange: (value: EntityFieldDefaultValue | null) => void;
};

const TITLE = "По умолчанию";
const DESCRIPTION = "Подставляется в новую запись — можно изменить";

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
  relationGroups = null,
  entities = [],
  value,
  onChange,
}: DefaultValueSettingsProps) {
  const relationGroupsCtx = useMemo(
    () => getEntityValueContext(entities),
    [entities],
  );
  const relationGroupsPreviewField = useMemo(() => {
    if (!relationGroups?.itemEntityId || !relationGroups.nestedEntityId) {
      return null;
    }
    return {
      id: "__default-relation-groups__",
      relationGroups,
    } as EntityField;
  }, [relationGroups]);

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
    const mode =
      value?.kind === "currentUser"
        ? "currentUser"
        : value?.kind === "value"
          ? "value"
          : null;
    const selectedCount = parseEntityRelationIds(constantOf(value)).length;

    return (
      <div className="flex flex-col gap-1.5">
        <SettingSelect
          id="entity-field-default"
          title={TITLE}
          description={
            relationMultiple
              ? "Предзаполняются в новой карточке — можно добавить или убрать"
              : DESCRIPTION
          }
          value={mode}
          options={[
            ...(relationToUsers
              ? [{ value: "currentUser", label: "Текущий пользователь" }]
              : []),
            {
              value: "value",
              label: relationMultiple ? "Выбранные записи" : "Выбранная запись",
            },
          ]}
          emptyLabel="Не заполнять"
          onChange={(next) => {
            if (next === "currentUser") {
              onChange({ kind: "currentUser" });
              return;
            }
            if (next === "value") {
              onChange(
                value?.kind === "value" ? value : { kind: "value", value: "" },
              );
              return;
            }
            onChange(null);
          }}
        />
        {mode === "value" ? (
          <RelationSelect
            options={relationOptions}
            value={constantOf(value)}
            multiple={relationMultiple}
            placeholder={
              relationMultiple ? "Выберите записи" : "Выберите запись"
            }
            aria-label={TITLE}
            className="min-h-8"
            onChange={(next) => onChange(toConstant(next))}
          />
        ) : null}
        {mode === "value" && relationMultiple && selectedCount > 0 ? (
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

  if (type === "relationGroups" && relationGroupsPreviewField) {
    const raw = constantOf(value);
    const groupCount = parseEntityRelationGroups(raw).length;

    return (
      <div className="flex flex-col gap-1.5">
        <SettingLabel
          htmlFor="entity-field-default-relation-groups"
          title={TITLE}
          description="Строки и вложенные подставятся в новую запись"
        />
        <div
          id="entity-field-default-relation-groups"
          className="rounded-md border border-border/70 bg-background p-2"
        >
          <RelationGroupsFieldControl
            id="entity-field-default-relation-groups-control"
            ctx={relationGroupsCtx}
            field={relationGroupsPreviewField}
            value={raw}
            onChange={(next) => onChange(toConstant(next))}
            mode="full"
          />
        </div>
        {groupCount > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Строк: {groupCount}
          </p>
        ) : null}
      </div>
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
            listMultiple
              ? "Предзаполняются в новой записи — можно добавить или убрать"
              : DESCRIPTION
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
