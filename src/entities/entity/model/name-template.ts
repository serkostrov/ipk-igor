import { formatRecordFieldValue, type EntityValueContext } from "./field-value";
import { isEntityNameField, type Entity, type EntityRecord } from "./types";

export type EntityNameTemplatePart =
  { kind: "text"; text: string } | { kind: "field"; id: string };

export function fieldNameTemplateToken(fieldId: string) {
  return `{{${fieldId}}}`;
}

export function entityNameValueHasTemplate(value: string) {
  return /\{\{[^}]+\}\}/.test(value);
}

/** Split `Сделка {{fieldId}}` into text / field parts. */
export function parseEntityNameTemplateParts(
  value: string,
): EntityNameTemplatePart[] {
  const parts: EntityNameTemplatePart[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  for (const match of value.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", text: value.slice(lastIndex, index) });
    }
    const id = match[1]?.trim() ?? "";
    if (id) parts.push({ kind: "field", id });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push({ kind: "text", text: value.slice(lastIndex) });
  }
  return parts;
}

export function serializeEntityNameTemplateParts(
  parts: readonly EntityNameTemplatePart[],
) {
  return parts
    .map((part) =>
      part.kind === "field" ? fieldNameTemplateToken(part.id) : part.text,
    )
    .join("");
}

/** Render `{{fieldId}}` tokens with formatted field values. */
export function renderEntityNameTemplate(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  template: string,
): string {
  const source = template.trim();
  if (!source) return "";
  if (!entityNameValueHasTemplate(source)) return source;

  return parseEntityNameTemplateParts(source)
    .map((part) => {
      if (part.kind === "text") return part.text;
      const field = entity.fields.find((item) => item.id === part.id);
      if (!field || isEntityNameField(field)) return "";
      const text = formatRecordFieldValue(ctx, entity, record, field).trim();
      return !text || text === "—" ? "" : text;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Effective title template: entity-wide setting, else the name field value
 * when it contains `{{fieldId}}` tokens.
 */
export function resolveEntityRecordNameTemplate(
  entity: Pick<Entity, "nameTemplate" | "fields">,
  record: Pick<EntityRecord, "values">,
): string {
  const entityTemplate = entity.nameTemplate.trim();
  if (entityTemplate) return entityTemplate;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "";
  return (record.values[nameField.id] ?? "").trim();
}

/**
 * Resolved text from the entity-wide name template for the given values.
 * Empty when the entity has no template or tokens do not resolve yet.
 */
export function resolveEntityNameAutofill(
  ctx: EntityValueContext,
  entity: Entity,
  values: Record<string, string>,
): string {
  const template = entity.nameTemplate.trim();
  if (!template) return "";
  const record: EntityRecord = {
    id: "__name-autofill__",
    values,
    authUserId: null,
    createdBy: null,
    schemaVersion: 1,
  };
  return entityNameValueHasTemplate(template)
    ? renderEntityNameTemplate(ctx, entity, record, template)
    : template;
}

/**
 * Soft-fill the name field from `entity.nameTemplate`.
 * Updates only when the name is empty or still equals the previous autofill
 * (user has not customized it). Skips when the name field itself changed.
 */
export function softFillEntityNameFromTemplate(
  ctx: EntityValueContext,
  entity: Entity,
  previous: Record<string, string>,
  next: Record<string, string>,
  changedFieldId?: string | null,
): Record<string, string> {
  const template = entity.nameTemplate.trim();
  if (!template) return next;
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return next;
  if (changedFieldId === nameField.id) return next;

  const nextAuto = resolveEntityNameAutofill(ctx, entity, next);
  if (!nextAuto) return next;

  const currentName = (next[nameField.id] ?? "").trim();
  const previousAuto = resolveEntityNameAutofill(ctx, entity, previous);
  if (currentName && currentName !== previousAuto) return next;
  if (currentName === nextAuto) return next;
  return { ...next, [nameField.id]: nextAuto };
}

/**
 * Record title for UI: the name field is the stored title (editable).
 * Entity `nameTemplate` only autofills that field; if the name is empty,
 * the template is rendered as a display fallback.
 */
export function getEntityRecordTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  empty = "Без названия",
): string {
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  const nameRaw = nameField ? (record.values[nameField.id] ?? "").trim() : "";

  if (nameRaw) {
    if (entityNameValueHasTemplate(nameRaw)) {
      const text = renderEntityNameTemplate(ctx, entity, record, nameRaw);
      if (text && text !== "—") return text;
      return empty;
    }
    return nameRaw;
  }

  const entityTemplate = entity.nameTemplate.trim();
  if (entityTemplate) {
    const text = entityNameValueHasTemplate(entityTemplate)
      ? renderEntityNameTemplate(ctx, entity, record, entityTemplate)
      : entityTemplate;
    if (text && text !== "—") return text;
  }

  return empty;
}
