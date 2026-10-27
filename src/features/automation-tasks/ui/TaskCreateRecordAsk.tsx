import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  createRecordAskDraftKey,
  createRecordNestedAskDraftKey,
  type AutomationFieldAskOptions,
} from "@/entities/automation";
import {
  getEntityFieldDisplayName,
  getEntityListParentField,
  getVisibleListOptions,
  parseEntityListValueIds,
  resolveEntityListFieldPresentation,
  type Entity,
  type EntityField,
  type EntityValueContext,
} from "@/entities/entity";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import {
  addNestedDraftRow,
  createAskMultiNestedSlot,
  getNestedDraftCount,
  removeNestedDraftRow,
  type AutomationCreateAskSlot,
  type AutomationCreateAskNestedSlot,
} from "../lib/task-ask-fields";

function CreateAskDraftList({
  title,
  nested,
  entity,
  actionId,
  values,
  entities,
  ctx,
  disabled,
  onChange,
  onValuesChange,
}: {
  title: string;
  nested: AutomationCreateAskNestedSlot;
  entity: Entity;
  actionId: string;
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (draftKey: string, value: string) => void;
  onValuesChange: (next: Record<string, string>) => void;
}) {
  const count = getNestedDraftCount(values, actionId, nested.nestedId);
  const requiredIds = new Set(nested.askRequiredFieldIds);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-dashed px-2 text-xs"
          disabled={disabled}
          onClick={() =>
            onValuesChange(addNestedDraftRow(values, actionId, nested))
          }
        >
          <Plus className="size-3.5" />
          Добавить
        </Button>
      </div>
      {count === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Пока нет — нажмите «Добавить»
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {Array.from({ length: count }, (_, index) => (
            <li
              key={`${nested.nestedId}-${index}`}
              className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {nested.entityLabel} · {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  aria-label="Удалить"
                  onClick={() =>
                    onValuesChange(
                      removeNestedDraftRow(values, actionId, nested, index),
                    )
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <CreateAskFieldList
                entity={entity}
                fieldIds={nested.askFieldIds}
                requiredIds={requiredIds}
                fieldAskOptions={nested.fieldAskOptions}
                draftKeyFor={(fieldId) =>
                  createRecordNestedAskDraftKey(
                    actionId,
                    nested.nestedId,
                    index,
                    fieldId,
                  )
                }
                values={values}
                entities={entities}
                ctx={ctx}
                disabled={disabled}
                onChange={onChange}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CreateAskFieldList({
  entity,
  fieldIds,
  requiredIds,
  fieldAskOptions,
  draftKeyFor,
  values,
  entities,
  ctx,
  disabled,
  onChange,
}: {
  entity: Entity;
  fieldIds: string[];
  requiredIds: ReadonlySet<string>;
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
  draftKeyFor: (fieldId: string) => string;
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (draftKey: string, value: string) => void;
}) {
  const fields = fieldIds
    .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
    .filter((field): field is EntityField => field != null);

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const draftKey = draftKeyFor(field.id);
        const parentField = getEntityListParentField(entity, field);
        const parentDraftKey = parentField ? draftKeyFor(parentField.id) : null;
        const parentValue = parentDraftKey ? values[parentDraftKey] : undefined;
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
        const required = requiredIds.has(field.id);
        // Local draft bag only — parent entity values are not mixed here.
        const localValues: Record<string, string> = {};
        for (const id of fieldIds) {
          localValues[id] = values[draftKeyFor(id)] ?? "";
        }

        return (
          <div key={field.id}>
            <RecordFieldControl
              ctx={ctx}
              entity={entity}
              field={field}
              value={values[draftKey] ?? ""}
              values={localValues}
              onChange={(value) => onChange(draftKey, value)}
              listOptions={listOptions}
              listDisabled={listDisabled || disabled}
              listDisabledHint={
                parentField
                  ? `Сначала выберите «${getEntityFieldDisplayName(parentField)}»`
                  : undefined
              }
              listMultiple={listPresentation.listMultiple}
              showColors={listPresentation.listUseColors}
              listAllowEmpty={!required}
              entities={entities}
              recordId={`draft-${draftKey}`}
              required={required}
              relationGroupsMode={
                fieldAskOptions[field.id]?.relationGroupsMode ?? "full"
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export function TaskCreateRecordAsk({
  slots,
  values,
  entities,
  ctx,
  disabled,
  onChange,
  onValuesChange,
}: {
  slots: AutomationCreateAskSlot[];
  values: Record<string, string>;
  entities: Entity[];
  ctx: EntityValueContext;
  disabled?: boolean;
  onChange: (draftKey: string, value: string) => void;
  onValuesChange: (next: Record<string, string>) => void;
}) {
  if (slots.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {slots.map((slot) => {
        const entity = entities.find((item) => item.id === slot.entityId);
        if (!entity) return null;
        const requiredIds = new Set(slot.askRequiredFieldIds);
        if (slot.underRelatedParents) {
          const triggerMulti =
            slot.multiple === true ? createAskMultiNestedSlot(slot) : null;
          return (
            <div key={slot.actionId} className="flex flex-col gap-4">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {slot.entityLabel}
              </p>
              {slot.underRelatedParents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
                  Сначала нужны записи «
                  {slot.underRelatedEmptyLabel ?? "связанной подсущности"}»
                </p>
              ) : (
                slot.underRelatedParents.map((parent, parentIndex) => (
                  <div
                    key={parent.parentRecordId}
                    className={
                      parentIndex > 0
                        ? "flex flex-col gap-2.5 border-t border-border/50 pt-3.5"
                        : "flex flex-col gap-2.5"
                    }
                  >
                    <CreateAskDraftList
                      title={`${slot.entityLabel} · ${parent.parentTitle}`}
                      nested={{
                        nestedId: parent.nestedId,
                        entityId: slot.entityId,
                        entityLabel: slot.entityLabel,
                        askFieldIds: slot.askFieldIds,
                        askRequiredFieldIds: slot.askRequiredFieldIds,
                        fieldAskOptions: slot.fieldAskOptions,
                      }}
                      entity={entity}
                      actionId={slot.actionId}
                      values={values}
                      entities={entities}
                      ctx={ctx}
                      disabled={disabled}
                      onChange={onChange}
                      onValuesChange={onValuesChange}
                    />
                  </div>
                ))
              )}
              {triggerMulti ? (
                <div className="flex flex-col gap-2.5 border-t border-border/50 pt-3.5">
                  <CreateAskDraftList
                    title={`${slot.entityLabel} · текущая запись`}
                    nested={triggerMulti}
                    entity={entity}
                    actionId={slot.actionId}
                    values={values}
                    entities={entities}
                    ctx={ctx}
                    disabled={disabled}
                    onChange={onChange}
                    onValuesChange={onValuesChange}
                  />
                </div>
              ) : null}
            </div>
          );
        }
        if (slot.multiple) {
          const multi = createAskMultiNestedSlot(slot);
          return (
            <div key={slot.actionId} className="flex flex-col gap-3.5">
              <CreateAskDraftList
                title={slot.entityLabel}
                nested={multi}
                entity={entity}
                actionId={slot.actionId}
                values={values}
                entities={entities}
                ctx={ctx}
                disabled={disabled}
                onChange={onChange}
                onValuesChange={onValuesChange}
              />
            </div>
          );
        }
        return (
          <div key={slot.actionId} className="flex flex-col gap-3.5">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Новая запись · {slot.entityLabel}
            </p>
            <CreateAskFieldList
              entity={entity}
              fieldIds={slot.askFieldIds}
              requiredIds={requiredIds}
              fieldAskOptions={slot.fieldAskOptions}
              draftKeyFor={(fieldId) =>
                createRecordAskDraftKey(slot.actionId, fieldId)
              }
              values={values}
              entities={entities}
              ctx={ctx}
              disabled={disabled}
              onChange={onChange}
            />
            {slot.nested.map((nested) => {
              const child = entities.find(
                (item) => item.id === nested.entityId,
              );
              if (!child) return null;
              return (
                <div
                  key={nested.nestedId}
                  className="flex flex-col gap-2.5 border-t border-border/50 pt-3"
                >
                  <CreateAskDraftList
                    title={nested.entityLabel}
                    nested={nested}
                    entity={child}
                    actionId={slot.actionId}
                    values={values}
                    entities={entities}
                    ctx={ctx}
                    disabled={disabled}
                    onChange={onChange}
                    onValuesChange={onValuesChange}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
