import { useMemo, useState } from "react";
import { getErrorMessage } from "@/shared/lib/error-message";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  addEntityRecord,
  applyEntityFieldValue,
  applyTkpGipDepartmentUsers,
  createEntityDraftRecord,
  sanitizeEntityRelationDependencies,
  getEntityFieldDisplayName,
  getEntityFieldGroupName,
  getEntityHeaderField,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getVisibleListOptions,
  groupEntityFields,
  isEntityFieldGroupTitleHidden,
  computeAllowManualFormulaSoftFill,
  isEntityComputedAutoValueEmpty,
  isEntityComputedFieldType,
  isEntityFieldManualInputEnabled,
  isEntityFieldVisibleByConditions,
  isEntityFieldVisibleOnCreate,
  isEntityFieldVisibleOnRecord,
  isEntityInternal,
  isEntityNameField,
  isValidEntityEmail,
  normalizeEntityFieldInputValue,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  PRIMARY_ENTITY_FIELD_GROUP,
  resolveEntityFieldDefaultValue,
  resolveEntityListFieldPresentation,
  updateEntityRecord,
  waitForEntityRecordInsert,
  useCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { canEntity, canField, useCurrentRole } from "@/entities/access";
import { RecordFieldControl } from "./RecordFieldControl";

export type EntityRecordSubmitMeta = {
  password?: string;
};

type EntityRecordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  record?: EntityRecord | null;
  entities?: Entity[];
  presetValues?: Record<string, string>;
  /**
   * Parent host record for product soft-fill hardcodes
   * (e.g. «Разбор ТКП» → «Расчёты отделов» / ГИП).
   */
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
  hiddenFieldIds?: Set<string>;
  titleOverride?: string;
  submitLabel?: string;
  /** When creating a Users account — require password and pass it in meta. */
  requireAccountPassword?: boolean;
  onSubmit?: (
    values: Record<string, string>,
    meta: EntityRecordSubmitMeta,
  ) => void | Promise<void>;
};

function buildRecordValues(
  fields: EntityField[],
  recordValues: Record<string, string> | undefined,
  presetValues: Record<string, string> | undefined,
  currentUserRecordId: string | null,
) {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const preset = presetValues?.[field.id];
    if (preset !== undefined) {
      values[field.id] = normalizeEntityFieldInputValue(field, preset);
      continue;
    }
    const existing = recordValues?.[field.id];
    if (existing !== undefined) {
      values[field.id] = normalizeEntityFieldInputValue(field, existing);
      continue;
    }
    const fallback = recordValues
      ? null
      : resolveEntityFieldDefaultValue(field, currentUserRecordId);
    values[field.id] = fallback ?? (field.type === "boolean" ? "false" : "");
  }
  return values;
}

function canSubmitRecord(
  entity: Entity,
  fields: EntityField[],
  values: Record<string, string>,
  ctx: EntityValueContext,
  recordId: string,
) {
  const draft = createEntityDraftRecord(values, recordId);
  return fields.every((field) => {
    if (
      isEntityComputedFieldType(field.type) &&
      !isEntityFieldManualInputEnabled(field)
    ) {
      return true;
    }
    // Entity name template soft-fills the title; empty name still has a
    // display fallback from the template, so do not block create/edit.
    if (
      isEntityNameField(field) &&
      entity.nameTemplate.trim().length > 0 &&
      !(values[field.id] ?? "").trim()
    ) {
      return true;
    }
    const raw = values[field.id] ?? "";
    if (field.type === "email" && !isValidEntityEmail(raw)) return false;
    if (!field.required) return true;
    if (field.type === "boolean") return true;
    if (field.type === "file") {
      return parseEntityFieldFileValue(raw) != null;
    }
    // Manual-enabled computed: required only when auto is empty.
    if (isEntityComputedFieldType(field.type)) {
      if (!isEntityComputedAutoValueEmpty(ctx, entity, draft, field)) {
        return true;
      }
      return raw.trim().length > 0;
    }
    return raw.trim().length > 0;
  });
}

function normalizeRecordValues(
  fields: EntityField[],
  values: Record<string, string>,
) {
  const next: Record<string, string> = { ...values };
  for (const field of fields) {
    next[field.id] = normalizeEntityFieldInputValue(
      field,
      next[field.id] ?? "",
    );
  }
  return next;
}

function EntityRecordForm({
  entity,
  record,
  entities,
  presetValues,
  softFillParent = null,
  hiddenFieldIds,
  titleOverride,
  submitLabel,
  requireAccountPassword = false,
  onCancel,
  onSubmit,
}: {
  entity: Entity;
  record?: EntityRecord | null;
  entities: Entity[];
  presetValues?: Record<string, string>;
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
  hiddenFieldIds?: Set<string>;
  titleOverride?: string;
  submitLabel?: string;
  requireAccountPassword?: boolean;
  onCancel: () => void;
  onSubmit: (
    values: Record<string, string>,
    meta: EntityRecordSubmitMeta,
  ) => void | Promise<void>;
}) {
  const isEdit = Boolean(record);
  const valueContext = useEntityValueContext();
  const currentUserRecordId = useCurrentUserRecordId();
  const role = useCurrentRole();
  const draftRecordId = useMemo(
    () => record?.id ?? `draft-${crypto.randomUUID()}`,
    [record?.id],
  );
  const editableFields = useMemo(
    () =>
      entity.fields.filter((field) => {
        if (hiddenFieldIds?.has(field.id)) return false;
        if (isEdit) {
          return canField(role, entity.id, field.id, "edit");
        }
        // Create: need entity create + field view/edit (create counts as edit).
        if (!canEntity(role, entity.id, "create")) return false;
        return (
          canField(role, entity.id, field.id, "view") ||
          canField(role, entity.id, field.id, "edit")
        );
      }),
    [entity.fields, entity.id, hiddenFieldIds, isEdit, role],
  );
  // UI: honour «При создании». Values still include all editable fields so
  // lookups / formulas can resolve through hidden sources.
  const layoutVisibleFields = useMemo(
    () =>
      editableFields.filter((field) => {
        if (!isEntityFieldVisibleOnRecord(field)) return false;
        if (isEdit) return true;
        return isEntityFieldVisibleOnCreate(field);
      }),
    [editableFields, isEdit],
  );
  const initialValues = useMemo(() => {
    const sanitized = sanitizeEntityRelationDependencies(
      entity,
      buildRecordValues(
        editableFields,
        record?.values,
        presetValues,
        currentUserRecordId,
      ),
      entities,
    );
    if (!softFillParent) return sanitized;
    return applyTkpGipDepartmentUsers({
      childEntity: entity,
      childValues: sanitized,
      entities,
      parentEntity: softFillParent.entity,
      parentRecord: softFillParent.record,
      changedFieldId: null,
    }).values;
  }, [
    entity,
    entities,
    editableFields,
    record,
    presetValues,
    currentUserRecordId,
    softFillParent,
  ]);
  const [values, setValues] = useState(initialValues);
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formulaSoftFill = useMemo(
    () =>
      computeAllowManualFormulaSoftFill({
        ctx: getEntityPreviewValueContext(valueContext),
        entity,
        values,
        recordId: draftRecordId,
      }),
    [valueContext, entity, values, draftRecordId],
  );
  const displayValues = useMemo(
    () => ({ ...formulaSoftFill, ...values }),
    [formulaSoftFill, values],
  );
  const draftRecord = useMemo(
    () => createEntityDraftRecord(displayValues, draftRecordId),
    [displayValues, draftRecordId],
  );
  const previewContext = useMemo(
    () => getEntityPreviewValueContext(valueContext),
    [valueContext],
  );
  const visibleFields = useMemo(
    () =>
      layoutVisibleFields.filter((field) =>
        isEntityFieldVisibleByConditions(
          valueContext,
          entity,
          draftRecord,
          field,
        ),
      ),
    [layoutVisibleFields, valueContext, entity, draftRecord],
  );
  const needsPassword = requireAccountPassword && !isEdit;
  const canSubmit =
    canSubmitRecord(
      entity,
      visibleFields,
      displayValues,
      valueContext,
      draftRecordId,
    ) && (!needsPassword || password.length >= 6);
  const nameField = useMemo(
    () => visibleFields.find((field) => isEntityNameField(field)) ?? null,
    [visibleFields],
  );
  const headerField = useMemo(() => {
    const field = getEntityHeaderField(entity);
    if (
      !field ||
      hiddenFieldIds?.has(field.id) ||
      !isEntityFieldVisibleOnRecord(field)
    ) {
      return null;
    }
    // Pinned header must still respect create visibility (e.g. Stage OFF).
    if (!isEdit && !isEntityFieldVisibleOnCreate(field)) {
      return null;
    }
    if (
      !isEntityFieldVisibleByConditions(
        valueContext,
        entity,
        draftRecord,
        field,
      )
    ) {
      return null;
    }
    return field;
  }, [entity, hiddenFieldIds, isEdit, valueContext, draftRecord]);
  const pinnedFields = useMemo(() => {
    // Create form is a flat list — «Название» follows «При создании» order.
    if (!isEdit) return [];
    const fields: EntityField[] = [];
    if (nameField) fields.push(nameField);
    if (headerField) fields.push(headerField);
    return fields;
  }, [isEdit, nameField, headerField]);
  const pinnedIds = useMemo(
    () => new Set(pinnedFields.map((field) => field.id)),
    [pinnedFields],
  );
  const isSubEntity = Boolean(entity.parentEntityId);
  const isInternal = isEntityInternal(entity);
  const bodyFields = useMemo(
    () => visibleFields.filter((field) => !pinnedIds.has(field.id)),
    [visibleFields, pinnedIds],
  );
  const fieldGroups = useMemo(() => {
    // Create form + service entities: flat order from settings (entity.fields).
    // Matches «Все поля → При создании» drag order (including «Название»).
    if (isInternal || !isEdit) {
      return bodyFields.length > 0
        ? [{ name: "", fields: bodyFields, colSpan: 2 }]
        : [];
    }
    const fields = bodyFields.map((field) =>
      isSubEntity &&
      getEntityFieldGroupName(field.group) === PRIMARY_ENTITY_FIELD_GROUP
        ? { ...field, group: "" }
        : field,
    );
    return groupEntityFields(fields, entity.fieldGroups).filter(
      (group) => !(isSubEntity && group.name === PRIMARY_ENTITY_FIELD_GROUP),
    );
  }, [bodyFields, entity.fieldGroups, isSubEntity, isInternal, isEdit]);
  const entityLabel =
    entity.name.trim() || entity.namePlural.trim() || "Без названия";

  function setValue(fieldId: string, value: string) {
    setValues((current) => {
      let next = applyEntityFieldValue(
        entity,
        current,
        fieldId,
        value,
        entities,
      );
      if (softFillParent) {
        next = applyTkpGipDepartmentUsers({
          childEntity: entity,
          childValues: next,
          entities,
          parentEntity: softFillParent.entity,
          parentRecord: softFillParent.record,
          changedFieldId: fieldId,
        }).values;
      }
      return next;
    });
  }

  function renderField(field: EntityField) {
    const parentField = getEntityListParentField(entity, field);
    const parentValue = parentField ? values[parentField.id] : undefined;
    const listOptions =
      field.type === "list"
        ? getVisibleListOptions(field, parentValue, parentField, entities)
        : field.listOptions;
    const listPresentation = resolveEntityListFieldPresentation(
      field,
      entities,
    );
    const listDisabled =
      field.type === "list" &&
      parentField != null &&
      parseEntityListValueIds(parentValue).length === 0;
    const listDisabledHint = parentField
      ? `Сначала выберите «${getEntityFieldDisplayName(parentField)}»`
      : undefined;

    return (
      <RecordFieldControl
        key={field.id}
        ctx={previewContext}
        entity={entity}
        field={field}
        value={displayValues[field.id] ?? ""}
        values={displayValues}
        onChange={(value) => setValue(field.id, value)}
        listOptions={listOptions}
        listDisabled={listDisabled}
        listDisabledHint={listDisabledHint}
        listMultiple={listPresentation.listMultiple}
        showColors={listPresentation.listUseColors}
        listAllowEmpty={!field.required}
        entities={entities}
        recordId={draftRecordId}
        required={field.required}
        softFillParent={softFillParent}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {titleOverride ?? (isEdit ? "Редактировать запись" : "Новая запись")}
        </DialogTitle>
        {titleOverride ? null : (
          <DialogDescription>
            {isEdit
              ? `Измените поля сущности «${entityLabel}».`
              : needsPassword
                ? `Создайте аккаунт «${entityLabel}» — запись и вход в систему.`
                : `Заполните поля сущности «${entityLabel}».`}
          </DialogDescription>
        )}
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {pinnedFields.length > 0 ? (
          <div className="flex flex-col gap-3">
            {pinnedFields.map(renderField)}
          </div>
        ) : null}

        {needsPassword ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entity-record-password">Пароль для входа</Label>
            <Input
              id="entity-record-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Не менее 6 символов"
            />
          </div>
        ) : null}

        {!isEdit && visibleFields.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            Нет доступных полей для создания. Проверьте права роли на поля этой
            сущности (раздел «Поля»), либо включите «Все поля».
          </p>
        ) : null}

        {fieldGroups
          .filter((group) => group.fields.length > 0)
          .map((group) => {
            const showHeader =
              fieldGroups.length > 1 &&
              group.name !== PRIMARY_ENTITY_FIELD_GROUP &&
              !isEntityFieldGroupTitleHidden(group.name, entity.fieldGroups);
            const useGroupedShell = fieldGroups.length > 1;

            return (
              <section
                key={group.name}
                className={
                  useGroupedShell
                    ? "shrink-0 overflow-hidden rounded-xl border border-border bg-muted/25"
                    : "flex shrink-0 flex-col gap-3"
                }
              >
                {useGroupedShell ? (
                  <>
                    {showHeader ? (
                      <header className="flex h-9 items-center border-b border-border bg-foreground/[0.045] px-3.5">
                        <h3 className="text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
                          {group.name}
                        </h3>
                      </header>
                    ) : null}
                    <div className="flex flex-col gap-3 p-3">
                      {group.fields.map(renderField)}
                    </div>
                  </>
                ) : (
                  group.fields.map(renderField)
                )}
              </section>
            );
          })}
      </div>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSubmit || pending}
          onClick={() => {
            const nextValues = {
              ...buildRecordValues(
                editableFields,
                record?.values,
                presetValues,
                currentUserRecordId,
              ),
              ...normalizeRecordValues(editableFields, {
                ...formulaSoftFill,
                ...values,
              }),
            };
            const meta: EntityRecordSubmitMeta = needsPassword
              ? { password }
              : {};
            setPending(true);
            setSubmitError(null);
            void Promise.resolve(onSubmit(nextValues, meta))
              .then(() => {
                onCancel();
              })
              .catch((error: unknown) => {
                setSubmitError(getErrorMessage(error, "Не удалось сохранить"));
              })
              .finally(() => {
                setPending(false);
              });
          }}
        >
          {pending
            ? "Сохранение…"
            : (submitLabel ?? (isEdit ? "Сохранить" : "Добавить"))}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityRecordDialog({
  open,
  onOpenChange,
  entity,
  record = null,
  entities: entitiesProp,
  presetValues,
  softFillParent = null,
  hiddenFieldIds,
  titleOverride,
  submitLabel,
  requireAccountPassword = false,
  onSubmit,
}: EntityRecordDialogProps) {
  const { entities: entitiesFromStore } = useEntityConfig();
  const entities = entitiesProp ?? entitiesFromStore;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full min-w-[min(100%,28rem)] max-w-[min(92vw,36rem)] overflow-y-auto sm:max-w-[min(92vw,36rem)]">
        {open ? (
          <EntityRecordForm
            key={
              record ? `${entity.id}-${record.id}` : `${entity.id}-new-record`
            }
            entity={entity}
            record={record}
            entities={entities}
            presetValues={presetValues}
            softFillParent={softFillParent}
            hiddenFieldIds={hiddenFieldIds}
            titleOverride={titleOverride}
            submitLabel={submitLabel}
            requireAccountPassword={requireAccountPassword}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values, meta) => {
              if (onSubmit) {
                await onSubmit(values, meta);
                return;
              }
              if (record) {
                await updateEntityRecord(entity.id, record.id, values);
                return;
              }
              const created = addEntityRecord(entity.id, values);
              await waitForEntityRecordInsert(created.id);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
