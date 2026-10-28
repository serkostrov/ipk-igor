import { DatePicker } from "@/shared/ui/date-picker";
import { DateRangePicker } from "@/shared/ui/date-range-picker";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { TimePicker } from "@/shared/ui/time-picker";
import {
  createEntityDraftRecord,
  formatTkpGipDepartmentExtras,
  ListSelect,
  RelationGroupsFieldControl,
  RelationSelect,
  entityFieldInputType,
  formatRecordFieldValue,
  getEntityDisplayName,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationFieldOptions,
  getRelationNestedParentField,
  getRelationRecordOptions,
  isEntityComputedFieldType,
  isEntityNameField,
  isTkpAnalysisEntity,
  isValidEntityEmail,
  normalizeEntityDecimalInput,
  normalizeEntityPhoneValue,
  parseEntityPeriod,
  parseEntityRelationIds,
  serializeEntityPeriod,
  resolveEntityLookupTarget,
  type Entity,
  type EntityField,
  type EntityListOption,
  type EntityRecord,
  type EntityRelationGroupsMode,
  type EntityValueContext,
} from "@/entities/entity";
import { TemplateFieldInput } from "@/features/manage-automations/ui/TemplateFieldInput";
import { joinDatetime, splitDatetime } from "@/shared/lib/format-date";
import { DependenciesFieldControl } from "./DependenciesFieldControl";
import { FileFieldControl } from "./FileFieldControl";

/**
 * Where a computed value comes from — shown next to the field title.
 * Lookup: из записи «Отдел».
 */
function getComputedSourceCaption(
  entity: Entity,
  field: EntityField,
  entities: readonly Entity[],
): string {
  switch (field.type) {
    case "lookup": {
      const target = resolveEntityLookupTarget(entity, field, entities);
      const bridge = target?.relationField;
      if (bridge) {
        const name = getEntityFieldDisplayName(bridge);
        return bridge.type === "relationGroups"
          ? `из наборов «${name}»`
          : `из записи «${name}»`;
      }
      const relationField = field.lookup?.relationFieldId
        ? entity.fields.find(
            (item) => item.id === field.lookup?.relationFieldId,
          )
        : null;
      if (relationField) {
        return relationField.type === "relationGroups"
          ? `из наборов «${getEntityFieldDisplayName(relationField)}»`
          : `из записи «${getEntityFieldDisplayName(relationField)}»`;
      }
      return "из записи";
    }
    case "formula":
      return "рассчитывается по формуле";
    case "rollup": {
      const sourceId = field.rollup?.sourceEntityId;
      const source = sourceId
        ? entities.find((item) => item.id === sourceId)
        : null;
      return source
        ? `считается по «${getEntityDisplayName(source)}»`
        : "считается по связанным записям";
    }
    case "numberSum": {
      const names = field.sumFieldIds
        .map((id) => entity.fields.find((item) => item.id === id))
        .filter((item): item is EntityField => item != null)
        .map((item) => getEntityFieldDisplayName(item));
      if (names.length === 0) return "сумма полей";
      if (names.length <= 3) return `сумма: ${names.join(" + ")}`;
      return `сумма ${names.length} полей`;
    }
    default:
      return "авто";
  }
}

function RequiredMark({ required }: { required?: boolean }) {
  if (!required) return null;
  return <span className="text-destructive"> *</span>;
}

/** Filtered options plus already selected records that the filter hides. */
function getRelationControlOptions(
  ctx: EntityValueContext,
  entity: Entity,
  field: EntityField,
  values: Record<string, string | undefined>,
  recordId: string,
  target: Entity | null,
  entities: readonly Entity[],
) {
  const options = getRelationFieldOptions(ctx, entity, values, field, recordId);
  const nestedParent = getRelationNestedParentField(entity, field, entities);
  // Parent required for nested cascade — don't keep orphans when it's empty.
  if (
    nestedParent &&
    parseEntityRelationIds(values[nestedParent.id]).length === 0
  ) {
    return options;
  }
  const known = new Set(options.map((option) => option.id));
  const selected = new Set(parseEntityRelationIds(values[field.id]));
  const hidden = getRelationRecordOptions(target).filter(
    (option) => selected.has(option.id) && !known.has(option.id),
  );
  return hidden.length > 0 ? [...options, ...hidden] : options;
}

export function RecordFieldControl({
  ctx,
  entity,
  field,
  value,
  values = {},
  onChange,
  listOptions = [],
  listDisabled = false,
  listDisabledHint,
  listMultiple = false,
  listAllowEmpty = true,
  showColors = false,
  entities = [],
  recordId,
  required: requiredOverride,
  relationGroupsMode = "full",
  softFillParent = null,
}: {
  /** Preview context: computed values follow the unsaved `values`. */
  ctx: EntityValueContext;
  entity: Entity;
  field: EntityField;
  value: string;
  values?: Record<string, string | undefined>;
  onChange: (value: string) => void;
  listOptions?: EntityListOption[];
  listDisabled?: boolean;
  listDisabledHint?: string;
  listMultiple?: boolean;
  /** When false, a list cannot be cleared (e.g. status under a process). */
  listAllowEmpty?: boolean;
  /**
   * Parent record when editing a linked child (e.g. «Разбор ТКП» for
   * «Расчёты отделов») — used by product hardcodes.
   */
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
  /** Ask mode for `relationGroups` (items / nested / full). */
  relationGroupsMode?: EntityRelationGroupsMode;
  showColors?: boolean;
  entities?: Entity[];
  recordId: string;
  /** Overrides `field.required` (e.g. required by the chosen status). */
  required?: boolean;
}) {
  const id = `record-${field.id}`;
  const label = getEntityFieldDisplayName(field);
  const hint = field.hint;
  const required = requiredOverride ?? field.required;
  const targetId = getEntityRelationTargetId(field);
  const target = targetId
    ? (entities.find((item) => item.id === targetId) ?? null)
    : null;
  const relationUnavailable =
    (field.type === "relation" || field.type === "belonging") && !target;
  const nestedParentField =
    field.type === "relation"
      ? getRelationNestedParentField(entity, field, entities)
      : null;
  const relationParentEmpty =
    nestedParentField != null &&
    parseEntityRelationIds(values[nestedParentField.id]).length === 0;
  const relationDisabledHint = nestedParentField
    ? `Сначала выберите «${getEntityFieldDisplayName(nestedParentField)}»`
    : undefined;

  const labelNode = (
    <Label htmlFor={id}>
      {label}
      <RequiredMark required={required} />
    </Label>
  );

  if (isEntityComputedFieldType(field.type)) {
    const display = formatRecordFieldValue(
      ctx,
      entity,
      createEntityDraftRecord(values, recordId),
      field,
    );
    const sourceCaption = getComputedSourceCaption(entity, field, entities);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 items-baseline gap-x-1.5 gap-y-0.5">
          <Label htmlFor={id} className="shrink-0">
            {label}
          </Label>
          <span className="min-w-0 truncate text-[11px] leading-snug text-muted-foreground">
            {sourceCaption}
          </span>
        </div>
        <div
          id={id}
          className="flex h-9 items-center rounded-md border border-border/70 bg-muted/30 px-2.5 text-sm tabular-nums text-foreground"
        >
          <span
            className={
              display === "—" ? "text-muted-foreground/70" : "font-medium"
            }
          >
            {display}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            авто
          </span>
        </div>
      </div>
    );
  }

  if (field.type === "dependencies") {
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <DependenciesFieldControl
          id={id}
          ctx={ctx}
          entity={entity}
          field={field}
          value={value}
          values={values}
          recordId={recordId}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === "relationGroups") {
    const hostIsLead = isTkpAnalysisEntity(entity);
    const softIsLead =
      softFillParent != null && isTkpAnalysisEntity(softFillParent.entity);
    const storeHostValues =
      entity.records.find((item) => item.id === recordId)?.values ?? {};
    const leadParent = hostIsLead
      ? {
          entity,
          // Store + unsaved form: «ГИП» may not be among ask fields.
          record: createEntityDraftRecord(
            { ...storeHostValues, ...values },
            recordId,
          ),
        }
      : softIsLead && softFillParent
        ? {
            entity: softFillParent.entity,
            record: (() => {
              const live =
                softFillParent.entity.records.find(
                  (item) => item.id === softFillParent.record.id,
                ) ?? softFillParent.record;
              return {
                ...live,
                values: {
                  ...live.values,
                  ...softFillParent.record.values,
                },
              };
            })(),
          }
        : null;
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <RelationGroupsFieldControl
          id={id}
          ctx={ctx}
          field={field}
          value={value}
          onChange={onChange}
          mode={relationGroupsMode}
          resolveRecordExtras={
            leadParent
              ? ({
                  entity: departmentEntity,
                  recordId: departmentRecordId,
                  fieldIds,
                  defaultExtras,
                }) =>
                  formatTkpGipDepartmentExtras({
                    ctx,
                    hostEntity: entity,
                    parentEntity: leadParent.entity,
                    parentRecord: leadParent.record,
                    departmentEntity,
                    departmentRecordId,
                    displayFieldIds: fieldIds,
                    defaultExtras,
                  })
              : undefined
          }
        />
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex h-full min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor={id}>
            {label}
            <RequiredMark required={required} />
          </Label>
          {hint ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </div>
        <Switch
          id={id}
          checked={value === "true"}
          onCheckedChange={(next) => onChange(next ? "true" : "false")}
        />
      </div>
    );
  }

  if (field.type === "list") {
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : listDisabled && listDisabledHint ? (
          <span className="text-xs text-muted-foreground">
            {listDisabledHint}
          </span>
        ) : null}
        <ListSelect
          options={listOptions}
          value={value}
          allowEmpty={!required && listAllowEmpty}
          allowOther={field.listAllowOther && !listMultiple}
          multiple={listMultiple}
          showColors={showColors}
          disabled={listDisabled}
          aria-label={label}
          className="h-9 rounded-md border-input shadow-xs"
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === "relation" || field.type === "belonging") {
    const belongingTarget =
      field.type === "belonging"
        ? (entities.find((item) => item.id === entity.id) ?? entity)
        : target;
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : relationParentEmpty && relationDisabledHint ? (
          <span className="text-xs text-muted-foreground">
            {relationDisabledHint}
          </span>
        ) : null}
        {relationUnavailable && field.type === "relation" ? (
          <p className="flex h-9 items-center rounded-md border border-dashed border-border px-2.5 text-sm text-muted-foreground">
            Сущность не выбрана
          </p>
        ) : (
          <RelationSelect
            id={id}
            options={getRelationControlOptions(
              ctx,
              entity,
              field,
              values,
              recordId,
              belongingTarget,
              entities,
            )}
            value={relationParentEmpty ? "" : value}
            multiple={
              field.type === "belonging" ? false : field.relationMultiple
            }
            disabled={relationParentEmpty}
            placeholder={
              relationParentEmpty
                ? (relationDisabledHint ?? "Не выбран")
                : field.type === "belonging"
                  ? "Без родителя"
                  : "Не выбран"
            }
            onChange={onChange}
          />
        )}
      </div>
    );
  }

  if (field.type === "file") {
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <FileFieldControl
          id={id}
          value={value}
          entityId={entity.id}
          recordId={recordId}
          fieldId={field.id}
          onChange={onChange}
        />
      </div>
    );
  }

  if (isEntityNameField(field)) {
    const entityTemplate = entity.nameTemplate.trim();
    if (entityTemplate) {
      return (
        <div className="flex min-w-0 flex-col gap-2">
          {labelNode}
          <Input
            id={id}
            value={value}
            placeholder="Название записи"
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Подставляется из шаблона — можно изменить или дописать
          </p>
        </div>
      );
    }
    return (
      <TemplateFieldInput
        id={id}
        title={label}
        value={value}
        placeholder={hint || "Текст и поля записи"}
        fields={entity.fields.filter((item) => !isEntityNameField(item))}
        onChange={onChange}
        tone="form"
        required={required}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {labelNode}
        <Textarea
          id={id}
          value={value}
          placeholder={hint || undefined}
          className="min-h-20 flex-1 resize-none"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "datetime") {
    const { date, time } = splitDatetime(value);
    const withTime = field.datetimeWithTime !== false;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-date`}>
          {label}
          <RequiredMark required={required} />
        </Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        {withTime ? (
          <div className="grid grid-cols-[1.25fr_1fr] gap-2">
            <DatePicker
              id={`${id}-date`}
              value={date}
              aria-label={`${label}: дата`}
              onChange={(next) => onChange(joinDatetime(next, time))}
            />
            <TimePicker
              id={`${id}-time`}
              value={time}
              aria-label={`${label}: время (необязательно)`}
              onChange={(next) => onChange(joinDatetime(date, next))}
            />
          </div>
        ) : (
          <DatePicker
            id={`${id}-date`}
            value={date}
            aria-label={label}
            onChange={(next) => onChange(next)}
          />
        )}
      </div>
    );
  }

  if (field.type === "period") {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>
          {label}
          <RequiredMark required={required} />
        </Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <DateRangePicker
          id={id}
          value={parseEntityPeriod(value)}
          aria-label={label}
          placeholder="Начало — окончание"
          onChange={(next) => onChange(serializeEntityPeriod(next))}
        />
      </div>
    );
  }

  if (field.type === "time") {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>
          {label}
          <RequiredMark required={required} />
        </Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
        <TimePicker
          id={id}
          value={value}
          aria-label={label}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === "phone") {
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          placeholder={hint || "+"}
          onChange={(event) =>
            onChange(normalizeEntityPhoneValue(event.target.value))
          }
        />
      </div>
    );
  }

  if (field.type === "number") {
    const unit = field.unitSuffix?.trim() || null;
    // Keep placeholder/value clear of the unit suffix (e.g. «раб. дн.»).
    const unitPadCh = unit ? Math.max(5, unit.length + 2.5) : 0;
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        <div className="relative">
          <Input
            id={id}
            type="text"
            inputMode="decimal"
            value={value}
            placeholder={hint || "0,00"}
            style={unit ? { paddingRight: `${unitPadCh}ch` } : undefined}
            onChange={(event) =>
              onChange(normalizeEntityDecimalInput(event.target.value))
            }
          />
          {unit ? (
            <span
              className="pointer-events-none absolute top-1/2 right-3 max-w-[45%] -translate-y-1/2 truncate text-sm text-muted-foreground"
              title={unit}
              aria-hidden
            >
              {unit}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (field.type === "url") {
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        <Input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="url"
          value={value}
          placeholder={hint || "https://"}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "email") {
    const invalid = value.trim().length > 0 && !isValidEntityEmail(value);
    return (
      <div className="flex flex-col gap-2">
        {labelNode}
        <Input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          placeholder={hint || undefined}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {invalid ? (
          <p className="text-xs text-destructive">Введите корректный email</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {labelNode}
      <Input
        id={id}
        type={entityFieldInputType(field.type)}
        value={value}
        placeholder={hint || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
