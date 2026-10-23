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
 * Free-text addition to an entity-wide name template (stored in the name field).
 * Empty when there is no entity template or the name value still looks like a
 * per-record template (`{{fieldId}}`).
 */
export function getEntityNameTemplateSuffix(
  entity: Pick<Entity, "nameTemplate" | "fields">,
  record: Pick<EntityRecord, "values">,
): string {
  if (!entity.nameTemplate.trim()) return "";
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (!nameField) return "";
  const raw = (record.values[nameField.id] ?? "").trim();
  if (!raw || entityNameValueHasTemplate(raw)) return "";
  return raw;
}

/** Join resolved template text with an optional free-text suffix. */
export function joinEntityNameTemplateWithSuffix(
  renderedTemplate: string,
  suffix: string,
): string {
  const base = renderedTemplate.trim();
  const extra = suffix.trim();
  if (!base) return extra;
  if (!extra) return base;
  return `${base} ${extra}`.replace(/\s+/g, " ").trim();
}

/**
 * Record title for UI: entity template or name field value, with tokens resolved.
 * When the entity has a name template, the name field may hold an optional
 * free-text suffix the user typed after the template.
 */
export function getEntityRecordTitle(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  empty = "Без названия",
): string {
  const template = resolveEntityRecordNameTemplate(entity, record);
  if (!template) return empty;
  const rendered = entityNameValueHasTemplate(template)
    ? renderEntityNameTemplate(ctx, entity, record, template)
    : template;
  const text = joinEntityNameTemplateWithSuffix(
    rendered,
    getEntityNameTemplateSuffix(entity, record),
  );
  if (!text || text === "—") return empty;
  return text;
}
